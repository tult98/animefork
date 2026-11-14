import { Logger } from '@nestjs/common';
import { parseArgs } from 'node:util';
import pg from 'pg';
import { loadDeepSeekConfig, loadJevConfig } from '../art/art.config.ts';
import { describeError } from '../art/art.filler.ts';
import type { TitleInput } from '../art/contract.ts';
import { systemClock } from '../common/clock.ts';
import { EnvError } from '../config/app.config.ts';
import { createMalClient, type MalCandidate } from '../mal/mal.client.ts';
import { loadMalConfig } from '../mal/mal.config.ts';
import { MalFiller, type MalOutcome } from '../mal/mal.filler.ts';
import { MalFranchise } from '../mal/mal.franchise.ts';
import { createMalJudge, type MalTieEntry } from '../mal/mal.jev.ts';
import {
  entrySeason,
  fitsYear,
  startYear,
  wantedSeason,
} from '../mal/mal.matcher.ts';
import {
  PostgresMalStore,
  type MalHolder,
  type MalStore,
  type StoredMal,
} from '../mal/mal.store.ts';
import {
  PostgresNameGuessStore,
  type NameGuessStore,
} from '../mal/name-guess.store.ts';
import { createNameGuesser } from '../mal/name-guesser.ts';
import { createTrailerClient } from '../mal/trailer.client.ts';
import { evalInput, type SourceRow } from './eval-mal.ts';

// The store and the filler pull in Nest decorators, which node's type stripping cannot run,
// so the package script loads this file through @swc-node/register.

export interface BackfillMalRow extends Omit<SourceRow, 'status' | 'mal_id'> {
  attempted_at: Date | null;
  names_at: Date | null;
  taken_mal_ids: number[];
}

export interface BackfillMalSummary {
  lookedUp: number;
  ok: number;
  none: number;
  failed: number;
  settled: number;
}

export interface BackfillMalDeps {
  filler: MalFiller;
  store: MalStore;
  log: (line: string) => void;
}

export async function backfillMal(
  rows: BackfillMalRow[],
  { filler, store, log }: BackfillMalDeps,
): Promise<BackfillMalSummary> {
  const summary = { lookedUp: 0, ok: 0, none: 0, failed: 0, settled: 0 };
  // The rows' taken ids predate this run, so ids matched during it are added per name.
  const matchedNow = new Map<string, number[]>();
  for (const row of rows) {
    const slug = row.source_slug;
    await filler.fill(evalInput(row), row.names_at ?? undefined, async () => [
      ...row.taken_mal_ids,
      ...(matchedNow.get(row.source_name) ?? []),
    ]);
    summary.lookedUp++;
    const stored = (await store.find([slug])).get(slug);
    if (
      !stored ||
      stored.attemptedAt.getTime() === row.attempted_at?.getTime()
    ) {
      summary.settled++;
      log(`${slug} settled`);
    } else if (stored.status === 'ok') {
      summary.ok++;
      if (stored.malId !== null) {
        matchedNow.set(row.source_name, [
          ...(matchedNow.get(row.source_name) ?? []),
          stored.malId,
        ]);
      }
      log(
        `${slug} ok ${stored.malId} ${stored.matchedTitle} by ${stored.matchedBy}`,
      );
    } else {
      summary[stored.status]++;
      log(`${slug} ${stored.status} ${stored.reason}`);
    }
  }
  return summary;
}

export async function findBackfillRows(
  pool: pg.Pool,
  limit: number | null,
  slugs: string[] | null = null,
): Promise<BackfillMalRow[]> {
  const { rows } = await pool.query<BackfillMalRow>(
    `select a.source_slug, m.attempted_at,
            a.source_name, a.source_year, a.source_episode_count,
            n.names as other_names, n.updated_at as names_at,
            array(select o.mal_id
                    from title_art oa
                    join title_mal o on o.source_slug = oa.source_slug
                   where oa.source_name = a.source_name
                     and oa.source_slug <> a.source_slug
                     and o.status = 'ok') as taken_mal_ids
       from title_art a
       left join title_mal m on m.source_slug = a.source_slug
       left join title_names n on n.source_slug = a.source_slug
      where (m.source_slug is null or m.status <> 'ok')
        and a.source_name is not null
        and ($2::text[] is null or a.source_slug = any($2))
      order by m.attempted_at nulls first, a.source_slug
      limit $1`,
    [limit, slugs],
  );
  return rows;
}

export type RecheckRow = Omit<SourceRow, 'status' | 'mal_id'>;

export interface RecheckSummary {
  rechecked: number;
  filled: number;
  replaced: number;
  kept: number;
  differs: number;
  failed: number;
  tieBreaks: number;
}

export interface RecheckDeps extends BackfillMalDeps {
  pool: pg.Pool;
  write: boolean;
}

export async function findRecheckRows(
  pool: pg.Pool,
  limit: number | null,
  slugs: string[] | null,
): Promise<RecheckRow[]> {
  const { rows } = await pool.query<RecheckRow>(
    `select a.source_slug, a.source_name, a.source_year, a.source_episode_count,
            n.names as other_names
       from title_art a
       left join title_names n on n.source_slug = a.source_slug
      where a.source_name is not null
        and ($2::text[] is null or a.source_slug = any($2))
      order by a.source_slug
      limit $1`,
    [limit, slugs],
  );
  return rows;
}

// The same-display-name rule of a lookup, read at the time of the row so earlier writes count.
async function sameNameIds(
  pool: pg.Pool,
  name: string,
  slug: string,
): Promise<number[]> {
  const { rows } = await pool.query<{ mal_id: number }>(
    `select o.mal_id
       from title_art oa
       join title_mal o on o.source_slug = oa.source_slug
      where oa.source_name = $1 and oa.source_slug <> $2 and o.status = 'ok'`,
    [name, slug],
  );
  return rows.map((r) => r.mal_id);
}

async function sharedIds(pool: pg.Pool, slugs: string[]): Promise<number[]> {
  const { rows } = await pool.query<{ mal_id: number }>(
    `select mal_id from title_mal
      where status = 'ok' and mal_id is not null
      group by mal_id
     having count(*) > 1 and bool_or(source_slug = any($1))
      order by mal_id`,
    [slugs],
  );
  return rows.map((r) => r.mal_id);
}

const MOVIE_WORDS = /\b(movie|film|gekijouban)\b/i;
const SERIES_TYPES = new Set(['tv', 'ona']);

const isMovieSlug = (input: TitleInput) =>
  MOVIE_WORDS.test(`${input.slug.replace(/-/g, ' ')} ${input.name}`);

function kindMismatch(
  input: TitleInput,
  mediaType: string | null | undefined,
): string | null {
  if (!mediaType) return null;
  const movie = isMovieSlug(input);
  if (movie && SERIES_TYPES.has(mediaType)) {
    return `a movie slug on a ${mediaType} entry`;
  }
  const series = wantedSeason(input) > 1 || (input.episodeCount ?? 0) > 1;
  if (!movie && series && mediaType === 'movie') {
    return 'a series slug on a movie entry';
  }
  return null;
}

// A movie's number counts the films, so only a series slug on a series entry is held to its season.
function seasonMismatch(
  input: TitleInput,
  titles: (string | null | undefined)[],
  mediaType: string | null | undefined,
): string | null {
  if (mediaType === 'movie' || isMovieSlug(input)) return null;
  // The slug ends in a sequel's number ("isekai-quartet-3") that wantedSeason leaves alone.
  // The display name is not read for it: the source renames a first season after its latest one.
  const slugWords = input.slug.replace(/-a\d+$/, '').replace(/-+/g, ' ');
  const wanted = Math.max(wantedSeason(input), entrySeason([slugWords]));
  const season = entrySeason(titles);
  return wanted === season ? null : `season ${wanted} vs ${season}`;
}

function failedGuards(
  input: TitleInput,
  stored: StoredMal,
  sharedWith: MalHolder[],
): string[] {
  const entry = { year: stored.startSeason?.year, startDate: stored.startDate };
  const kind = kindMismatch(input, stored.mediaType);
  const season = seasonMismatch(
    input,
    [stored.matchedTitle, stored.english, ...stored.synonyms],
    stored.mediaType,
  );
  return [
    ...(sharedWith.length > 0
      ? [`shared with ${sharedWith.map((h) => h.slug).join(', ')}`]
      : []),
    ...(fitsYear(input, entry)
      ? []
      : [`year ${input.year} vs ${startYear(entry)}`]),
    ...(kind ? [kind] : []),
    ...(season ? [season] : []),
  ];
}

function rerunGuards(input: TitleInput, candidate: MalCandidate): string[] {
  return [
    kindMismatch(input, candidate.mediaType),
    seasonMismatch(
      input,
      [candidate.title, candidate.english, ...candidate.synonyms],
      candidate.mediaType,
    ),
  ].filter((fail): fail is string => fail !== null);
}

function describeMatch(outcome: Extract<MalOutcome, { status: 'ok' }>) {
  const { candidate } = outcome.match;
  const from =
    outcome.evicts.length > 0
      ? `, taking it from ${outcome.evicts.join(', ')}`
      : '';
  return `${candidate.id} ${candidate.title} by ${outcome.by}${from}`;
}

const tieEntry = (
  malId: number,
  stored: StoredMal | undefined,
): MalTieEntry => ({
  id: malId,
  title: stored?.matchedTitle ?? `MAL ${malId}`,
  year: stored?.startSeason?.year,
  english: stored?.english ?? undefined,
  mediaType: stored?.mediaType ?? undefined,
  startDate: stored?.startDate ?? null,
  episodes: stored?.episodes ?? undefined,
});

const holderOf = (input: TitleInput): MalHolder => ({
  slug: input.slug,
  name: input.name,
  year: input.year ?? null,
  episodeCount: input.episodeCount ?? null,
});

// | stored                    | rerun                         | action           |
// | ------------------------- | ----------------------------- | ---------------- |
// | miss, or never tried      | match                         | fill             |
// | match failing a guard     | a different match that passes | replace          |
// | match passing the guards  | a different match             | keep, `differs`  |
// | match                     | the same match                | keep             |
// Then every MAL id still held by two or more of the rows' slugs goes to a Jev tie-break.
// A dry run plans the writes in memory, so its tie-breaks see the ids it would have moved.
export async function recheckMal(
  rows: RecheckRow[],
  { filler, store, pool, write, log }: RecheckDeps,
): Promise<RecheckSummary> {
  const summary: RecheckSummary = {
    rechecked: 0,
    filled: 0,
    replaced: 0,
    kept: 0,
    differs: 0,
    failed: 0,
    tieBreaks: 0,
  };
  const inputs = new Map(rows.map((r) => [r.source_slug, evalInput(r)]));
  // The MAL id each slug holds after this run's writes, null for a slug that lost its id.
  const planned = new Map<string, number | null>();
  const entries = new Map<number, MalTieEntry>();
  const apply = async (slug: string, outcome: MalOutcome) => {
    if (outcome.status === 'ok') {
      planned.set(slug, outcome.match.candidate.id);
      entries.set(outcome.match.candidate.id, outcome.match.candidate);
      for (const holder of outcome.evicts) planned.set(holder, null);
    } else {
      planned.set(slug, null);
    }
    if (write) await filler.save(slug, outcome);
  };
  const rematch = (input: TitleInput, own: number | null, block: number[]) =>
    filler.rematch(input, async () => [
      ...(await sameNameIds(pool, input.name, input.slug)).filter(
        (id) => id !== own,
      ),
      ...block,
    ]);

  for (const row of rows) {
    const slug = row.source_slug;
    const input = evalInput(row);
    summary.rechecked++;
    const stored = (await store.find([slug])).get(slug);
    const own = stored?.status === 'ok' ? stored.malId : null;
    let outcome: MalOutcome;
    try {
      // A slug's own id is not taken from it: a same-named holder of it is settled by the tie-break.
      outcome = await rematch(input, own, []);
    } catch (error) {
      summary.failed++;
      log(`${slug} failed ${describeError(error)}`);
      continue;
    }
    if (!stored || own === null) {
      if (outcome.status === 'ok') {
        summary.filled++;
        await apply(slug, outcome);
        log(`${slug} filled ${describeMatch(outcome)}`);
      } else {
        summary.kept++;
        log(`${slug} kept ${stored?.status ?? 'untried'}: ${outcome.reason}`);
      }
      continue;
    }
    const was = `${own} ${stored.matchedTitle}`;
    const fails = failedGuards(input, stored, await store.holders(own, slug));
    const failing = fails.length > 0 ? ` (fails: ${fails.join('; ')})` : '';
    if (outcome.status === 'ok' && outcome.match.candidate.id !== own) {
      const rerunFails = rerunGuards(input, outcome.match.candidate);
      if (fails.length > 0 && rerunFails.length === 0) {
        summary.replaced++;
        await apply(slug, outcome);
        log(`${slug} replaced ${was}${failing} with ${describeMatch(outcome)}`);
      } else {
        summary.differs++;
        log(
          `${slug} differs: keeps ${was}${failing}, rerun ${describeMatch(outcome)}` +
            (rerunFails.length > 0 ? ` (${rerunFails.join('; ')})` : ''),
        );
      }
      continue;
    }
    summary.kept++;
    const rerun =
      outcome.status === 'ok' ? 'rerun agrees' : `rerun: ${outcome.reason}`;
    log(`${slug} kept ${was}${failing}${fails.length > 0 ? `, ${rerun}` : ''}`);
  }

  const slugs = rows.map((r) => r.source_slug);
  const ids = new Set([
    ...(await sharedIds(pool, slugs)),
    ...[...planned.values()].filter((id): id is number => id !== null),
  ]);
  for (const id of [...ids].sort((a, b) => a - b)) {
    const holders = (await store.holders(id, '')).filter(
      (h) => !planned.has(h.slug) || planned.get(h.slug) === id,
    );
    for (const [slug, heldId] of planned) {
      const input = inputs.get(slug);
      if (heldId === id && input && !holders.some((h) => h.slug === slug)) {
        holders.push(holderOf(input));
      }
    }
    if (holders.length < 2) continue;
    summary.tieBreaks++;
    const stored = [...(await store.find(holders.map((h) => h.slug))).values()];
    const entry =
      entries.get(id) ??
      (await filler.entry(id).catch(() => null)) ??
      tieEntry(id, stored[0]);
    const label = `tie-break ${id} ${entry.title}`;
    const tie = await filler.tieBreak(entry, holders).catch((error) => {
      log(`${label} failed ${describeError(error)}`);
      return undefined;
    });
    if (tie === undefined) continue;
    const { winner } = tie;
    if (winner === null) {
      log(`${label}: unsure, nobody moves (${tie.reason})`);
      continue;
    }
    const losers = holders.filter((h) => h.slug !== winner);
    log(
      `${label}: ${winner} keeps it, ${losers.map((h) => h.slug).join(', ')} lose it (${tie.reason})`,
    );
    for (const loser of losers) {
      const input =
        inputs.get(loser.slug) ??
        evalInput({
          source_slug: loser.slug,
          source_name: loser.name ?? '',
          source_year: loser.year,
          source_episode_count: loser.episodeCount,
          other_names: null,
        });
      try {
        const outcome = await rematch(input, id, [id]);
        await apply(loser.slug, outcome);
        log(
          `${label}: ${loser.slug} ` +
            (outcome.status === 'ok'
              ? `rematched ${describeMatch(outcome)}`
              : `is a miss: ${outcome.reason}`),
        );
      } catch (error) {
        planned.set(loser.slug, null);
        if (write) await filler.evict(loser.slug, id, winner);
        log(`${label}: ${loser.slug} rematch failed ${describeError(error)}`);
      }
    }
  }
  return summary;
}

function fail(message: string): never {
  console.error(`backfill-mal: ${message}`);
  process.exit(1);
}

interface Args {
  limit: number | null;
  slugs: string[] | null;
  recheck: boolean;
  write: boolean;
}

function readArgs(): Args {
  const { values } = parseArgs({
    options: {
      limit: { type: 'string' },
      slug: { type: 'string', multiple: true },
      recheck: { type: 'boolean', default: false },
      write: { type: 'boolean', default: false },
    },
  });
  const limit = values.limit === undefined ? null : Number(values.limit);
  if (limit !== null && (!Number.isInteger(limit) || limit < 1)) {
    fail('--limit must be a positive integer');
  }
  if (values.write && !values.recheck) {
    fail('--write goes with --recheck; a plain backfill always writes');
  }
  return {
    limit,
    slugs: values.slug ?? null,
    recheck: values.recheck,
    write: values.write,
  };
}

// A dry run cannot write by accident: the server refuses every write on this pool.
export function openPool(connectionString: string, readOnly: boolean) {
  return new pg.Pool({
    connectionString,
    ...(readOnly && { options: '-c default_transaction_read_only=on' }),
  });
}

async function main(): Promise<void> {
  const { limit, slugs, recheck, write } = readArgs();
  const missing = ['DATABASE_URL', 'MAL_CLIENT_ID'].filter(
    (name) => !process.env[name]?.trim(),
  );
  if (missing.length > 0) {
    fail(
      `set ${missing.join(' and ')} (for example in apps/api/.env) and run again`,
    );
  }
  let mal;
  let jev;
  let deepseek;
  try {
    mal = loadMalConfig(process.env);
    jev = loadJevConfig(process.env);
    deepseek = loadDeepSeekConfig(process.env);
  } catch (error) {
    if (error instanceof EnvError) fail(error.message);
    throw error;
  }
  if (!mal) fail('set MAL_CLIENT_ID');

  Logger.overrideLogger(['error', 'warn']);
  const dryRun = recheck && !write;
  const pool = openPool(process.env.DATABASE_URL ?? '', dryRun);
  try {
    const store = new PostgresMalStore(pool);
    const client = createMalClient({
      clientId: mal.clientId,
      baseUrl: mal.baseUrl,
    });
    const guesser = createNameGuesser(deepseek);
    const guessStore = new PostgresNameGuessStore(pool);
    const guesses: NameGuessStore = dryRun
      ? { find: (slug) => guessStore.find(slug), save: async () => {} }
      : guessStore;
    const filler = new MalFiller(
      store,
      client,
      systemClock,
      createMalJudge(jev),
      null,
      createTrailerClient({ baseUrl: mal.trailerBaseUrl }),
      new MalFranchise(client, systemClock),
      guesser && { guesser, store: guesses },
    );
    if (recheck) {
      const rows = await findRecheckRows(pool, limit, slugs);
      console.log(
        `backfill-mal: rechecking ${rows.length} title(s), Jev ${jev ? 'on' : 'off'}, ` +
          (write ? 'writing' : 'dry run'),
      );
      const summary = await recheckMal(rows, {
        filler,
        store,
        pool,
        write,
        log: (line) => console.log(line),
      });
      console.log(
        `backfill-mal: rechecked ${summary.rechecked}, filled ${summary.filled}, ` +
          `replaced ${summary.replaced}, kept ${summary.kept}, differs ${summary.differs}, ` +
          `failed ${summary.failed}, tie-breaks ${summary.tieBreaks}`,
      );
      return;
    }
    const rows = await findBackfillRows(pool, limit, slugs);
    console.log(
      `backfill-mal: ${rows.length} title(s) without a MAL match, ` +
        `Jev ${jev ? 'on' : 'off'}`,
    );
    const summary = await backfillMal(rows, {
      filler,
      store,
      log: (line) => console.log(line),
    });
    console.log(
      `backfill-mal: looked up ${summary.lookedUp}, ok ${summary.ok}, ` +
        `none ${summary.none}, failed ${summary.failed}, settled ${summary.settled}`,
    );
  } finally {
    await pool.end();
  }
}

if (import.meta.main) await main();
