import { Logger } from '@nestjs/common';
import { parseArgs } from 'node:util';
import pg from 'pg';
import { loadArtConfig } from '../art/art.config.ts';
import {
  ArtFiller,
  DEFAULT_FILL_CONCURRENCY,
  describeError,
} from '../art/art.filler.ts';
import { PostgresArtStore, type ArtStore } from '../art/art.store.ts';
import type { TitleStatus } from '../art/retry.ts';
import { findFromMal, type MalFacts } from '../art/tmdb/from-mal.ts';
import { createMatcher, startsLongAfter } from '../art/tmdb/jev.ts';
import type { MatchScope } from '../art/tmdb/matcher.ts';
import { syncTitle, type SyncDeps } from '../art/tmdb/sync.ts';
import {
  createTmdbClient,
  type TmdbClient,
  type TmdbKind,
} from '../art/tmdb/tmdb.ts';
import { createTranslator } from '../art/translator.ts';
import { systemClock } from '../common/clock.ts';
import { EnvError } from '../config/app.config.ts';
import { createMalClient, type MalClient } from '../mal/mal.client.ts';
import { loadMalConfig } from '../mal/mal.config.ts';
import { PostgresMalStore, type MalStore } from '../mal/mal.store.ts';
import { evalInput, type SourceRow } from './eval-mal.ts';

// The store and the filler pull in Nest decorators, which node's type stripping cannot run,
// so the package script loads this file through @swc-node/register.

const JEV_GUARD_VERSION = 5;

export interface BackfillArtRow extends Omit<SourceRow, 'status' | 'mal_id'> {
  tmdb_kind: TmdbKind;
  tmdb_id: number;
  match_scope: MatchScope;
}

export interface BackfillArtSummary {
  lookedAt: number;
  kept: number;
  rematched: number;
  cleared: number;
  failed: number;
}

export interface BackfillArtDeps {
  sync: SyncDeps;
  store: ArtStore;
  filler: ArtFiller;
  write: boolean;
  log: (line: string) => void;
}

async function seriesStartsAfter(
  row: BackfillArtRow,
  tmdb: TmdbClient,
): Promise<boolean> {
  if (row.source_year === null) return false;
  const series = await tmdb.tvDetail(row.tmdb_id);
  return startsLongAfter(series.first_air_date, row.source_year);
}

export async function backfillArt(
  rows: BackfillArtRow[],
  { sync, store, filler, write, log }: BackfillArtDeps,
): Promise<BackfillArtSummary> {
  const summary = {
    lookedAt: 0,
    kept: 0,
    rematched: 0,
    cleared: 0,
    failed: 0,
  };
  for (const row of rows) {
    const slug = row.source_slug;
    const was = `${row.tmdb_kind}:${row.tmdb_id}/${row.match_scope}`;
    summary.lookedAt++;
    try {
      const outcome = await syncTitle(evalInput(row), sync);
      if (outcome.kind === 'skipped') {
        const { reason, sideEntry } = outcome.skipped;
        const seriesOnSideEntry =
          row.tmdb_kind === 'tv' &&
          (sideEntry === true || (await seriesStartsAfter(row, sync.tmdb)));
        log(
          `${seriesOnSideEntry ? 'cleared' : 'kept'} ${slug} ${was} -> no_match ${reason}`,
        );
        if (seriesOnSideEntry && write)
          await store.clearMatch(slug, 'no_match', reason);
        summary[seriesOnSideEntry ? 'cleared' : 'kept']++;
        continue;
      }
      const { title } = outcome.matched;
      const now = `${title.tmdb_kind}:${title.tmdb_id}/${title.match_scope}`;
      const movesToOwnMovie =
        title.tmdb_kind === 'movie' &&
        (title.tmdb_kind !== row.tmdb_kind || title.tmdb_id !== row.tmdb_id);
      log(`${movesToOwnMovie ? 'rematched' : 'kept'} ${slug} ${was} -> ${now}`);
      if (movesToOwnMovie && write) {
        await store.saveMatched(outcome.matched, { overwriteMatch: true });
        await filler.fillOverview(slug, title.tmdb_kind, title.tmdb_id);
      }
      summary[movesToOwnMovie ? 'rematched' : 'kept']++;
    } catch (error) {
      log(`failed ${slug} ${was} -> ${describeError(error)}`);
      summary.failed++;
    }
  }
  return summary;
}

export interface BackfillMalArtRow extends Omit<
  SourceRow,
  'status' | 'mal_id'
> {
  status: TitleStatus;
  tmdb_kind: TmdbKind | null;
  tmdb_id: number | null;
  match_scope: MatchScope | null;
  mal_id: number;
  mal_title: string | null;
  mal_media_type: string | null;
  mal_english: string | null;
  mal_synonyms: string[];
  mal_start_date: string | null;
  mal_episodes: number | null;
}

export interface BackfillMalArtSummary {
  lookedAt: number;
  kept: number;
  rematched: number;
  filled: number;
  failed: number;
}

export interface BackfillMalArtDeps {
  tmdb: TmdbClient;
  mal: MalClient;
  malStore: MalStore;
  store: ArtStore;
  filler: ArtFiller;
  write: boolean;
  log: (line: string) => void;
}

export async function selectMalArtRows(
  pool: pg.Pool,
  slugs: string[],
  limit: number | null,
): Promise<BackfillMalArtRow[]> {
  const { rows } = await pool.query<BackfillMalArtRow>(
    `select a.source_slug, a.source_name, a.source_year, a.source_episode_count,
            n.names as other_names, a.status,
            case when a.status = 'matched' then a.tmdb_kind end as tmdb_kind,
            a.tmdb_id,
            case when a.status = 'matched' then a.match_scope end as match_scope,
            m.mal_id, m.matched_title as mal_title, m.mal_media_type, m.mal_english,
            m.mal_synonyms, m.mal_start_date, m.mal_episodes
       from title_art a
       join title_mal m on m.source_slug = a.source_slug
       left join title_names n on n.source_slug = a.source_slug
      where m.status = 'ok' and m.mal_id is not null and a.source_name is not null
        and (cardinality($1::text[]) = 0 or a.source_slug = any($1::text[]))
      order by a.source_slug
      limit $2`,
    [slugs, limit],
  );
  return rows;
}

async function ensureMalFacts(
  row: BackfillMalArtRow,
  { mal, malStore, write }: BackfillMalArtDeps,
): Promise<MalFacts | string> {
  let facts = {
    title: row.mal_title,
    mediaType: row.mal_media_type,
    english: row.mal_english,
    synonyms: row.mal_synonyms,
    startDate: row.mal_start_date,
    episodes: row.mal_episodes,
  };
  if (facts.mediaType === null) {
    const entry = await mal.entry(row.mal_id);
    if (!entry) return `MAL ${row.mal_id} is gone`;
    const { candidate } = entry;
    facts = {
      title: candidate.title,
      mediaType: candidate.mediaType ?? null,
      english: candidate.english ?? null,
      synonyms: candidate.synonyms,
      startDate: candidate.startDate,
      episodes: candidate.episodes ?? null,
    };
    if (write) await malStore.saveFacts(row.source_slug, facts);
  }
  const { title, mediaType, startDate } = facts;
  if (title === null || mediaType === null || startDate === null) {
    return `MAL ${row.mal_id} has no media type or start date`;
  }
  return { ...facts, malId: row.mal_id, title, mediaType, startDate };
}

export async function backfillArtFromMal(
  rows: BackfillMalArtRow[],
  deps: BackfillMalArtDeps,
): Promise<BackfillMalArtSummary> {
  const { tmdb, store, filler, write, log } = deps;
  const summary = { lookedAt: 0, kept: 0, rematched: 0, filled: 0, failed: 0 };
  for (const row of rows) {
    const slug = row.source_slug;
    const was =
      row.tmdb_id === null
        ? row.status
        : `${row.tmdb_kind}:${row.tmdb_id}/${row.match_scope}`;
    summary.lookedAt++;
    try {
      const facts = await ensureMalFacts(row, deps);
      const outcome =
        typeof facts === 'string'
          ? null
          : await findFromMal(evalInput(row), facts, tmdb);
      if (outcome?.kind !== 'matched') {
        const reason =
          typeof facts === 'string' ? facts : outcome?.skipped.reason;
        log(`kept ${slug} ${was} -> ${reason}`);
        summary.kept++;
        continue;
      }
      const { title } = outcome.matched;
      const moved =
        title.tmdb_kind !== row.tmdb_kind || title.tmdb_id !== row.tmdb_id;
      const verdict =
        row.tmdb_id === null ? 'filled' : moved ? 'rematched' : 'kept';
      log(
        `${verdict} ${slug} ${was} -> ${title.tmdb_kind}:${title.tmdb_id}/${title.match_scope}`,
      );
      if (write) {
        await store.saveMatched(outcome.matched, { overwriteMatch: true });
        if (moved) {
          await filler.fillOverview(slug, title.tmdb_kind, title.tmdb_id);
        }
      }
      summary[verdict]++;
    } catch (error) {
      log(`failed ${slug} ${was} -> ${describeError(error)}`);
      summary.failed++;
    }
  }
  return summary;
}

function fail(message: string): never {
  console.error(`backfill-art: ${message}`);
  process.exit(1);
}

function readFlags(): {
  slugs: string[];
  limit: number | null;
  write: boolean;
  mal: boolean;
} {
  const { values } = parseArgs({
    options: {
      slug: { type: 'string', multiple: true, default: [] },
      limit: { type: 'string' },
      write: { type: 'boolean', default: false },
      mal: { type: 'boolean', default: false },
    },
  });
  const limit = values.limit === undefined ? null : Number(values.limit);
  if (limit !== null && (!Number.isInteger(limit) || limit < 1)) {
    fail('--limit must be a positive integer');
  }
  return { slugs: values.slug, limit, write: values.write, mal: values.mal };
}

async function main(): Promise<void> {
  const { slugs, limit, write, mal } = readFlags();
  const required = [
    'DATABASE_URL',
    'TMDB_API_KEY',
    mal ? 'MAL_CLIENT_ID' : 'TYPESAFE_API_KEY',
  ];
  const missing = required.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    fail(
      `set ${missing.join(' and ')} (for example in apps/api/.env) and run again`,
    );
  }
  let config;
  let malConfig;
  try {
    config = loadArtConfig(process.env);
    malConfig = loadMalConfig(process.env);
  } catch (error) {
    if (error instanceof EnvError) fail(error.message);
    throw error;
  }

  Logger.overrideLogger(['error', 'warn']);
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ...(!write && { options: '-c default_transaction_read_only=on' }),
  });
  try {
    const store = new PostgresArtStore(pool);
    const sync: SyncDeps = {
      tmdb: createTmdbClient({
        apiKey: config.tmdbApiKey,
        baseUrl: config.tmdbApiBase,
      }),
      matcher: createMatcher(config.jev),
    };
    const filler = new ArtFiller(
      store,
      sync,
      DEFAULT_FILL_CONCURRENCY,
      systemClock,
      createTranslator(config.deepseek),
    );
    const mode = write ? 'writing' : 'dry run, pass --write to save';
    if (mal) {
      if (!malConfig) fail('set MAL_CLIENT_ID and run again');
      const rows = await selectMalArtRows(pool, slugs, limit);
      console.log(
        `backfill-art: ${rows.length} title(s) with a MAL match, ${mode}`,
      );
      const summary = await backfillArtFromMal(rows, {
        tmdb: sync.tmdb,
        mal: createMalClient({
          clientId: malConfig.clientId,
          baseUrl: malConfig.baseUrl,
        }),
        malStore: new PostgresMalStore(pool),
        store,
        filler,
        write,
        log: (line) => console.log(line),
      });
      console.log(
        `backfill-art: looked at ${summary.lookedAt}, kept ${summary.kept}, ` +
          `rematched ${summary.rematched}, filled ${summary.filled}, failed ${summary.failed}`,
      );
      return;
    }
    const { rows } = await pool.query<BackfillArtRow>(
      `select a.source_slug, a.source_name, a.source_year,
              a.source_episode_count, a.tmdb_kind, a.tmdb_id, a.match_scope,
              n.names as other_names
         from title_art a
         left join title_names n on n.source_slug = a.source_slug
        where a.status = 'matched' and a.matched_by = 'jev'
          and a.matcher_version < $1 and a.source_name is not null
          and (cardinality($2::text[]) = 0 or a.source_slug = any($2::text[]))
        order by a.attempted_at
        limit $3`,
      [JEV_GUARD_VERSION, slugs, limit],
    );
    console.log(
      `backfill-art: ${rows.length} Jev match(es) below matcher version ${JEV_GUARD_VERSION}, ${mode}`,
    );
    const summary = await backfillArt(rows, {
      sync,
      store,
      filler,
      write,
      log: (line) => console.log(line),
    });
    console.log(
      `backfill-art: looked at ${summary.lookedAt}, kept ${summary.kept}, ` +
        `rematched ${summary.rematched}, cleared ${summary.cleared}, failed ${summary.failed}`,
    );
  } finally {
    await pool.end();
  }
}

if (import.meta.main) await main();
