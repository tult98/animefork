import { Logger } from '@nestjs/common';
import { parseArgs } from 'node:util';
import pg from 'pg';
import { loadDeepSeekConfig, loadJevConfig } from '../art/art.config.ts';
import { systemClock } from '../common/clock.ts';
import { EnvError } from '../config/app.config.ts';
import { createMalClient } from '../mal/mal.client.ts';
import { loadMalConfig } from '../mal/mal.config.ts';
import { MalFiller } from '../mal/mal.filler.ts';
import { MalFranchise } from '../mal/mal.franchise.ts';
import { createMalJudge } from '../mal/mal.jev.ts';
import { PostgresMalStore, type MalStore } from '../mal/mal.store.ts';
import { PostgresNameGuessStore } from '../mal/name-guess.store.ts';
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
    await filler.fill(
      evalInput(row),
      row.names_at ?? undefined,
      async () => [
        ...row.taken_mal_ids,
        ...(matchedNow.get(row.source_name) ?? []),
      ],
    );
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
      order by m.attempted_at nulls first, a.source_slug
      limit $1`,
    [limit],
  );
  return rows;
}

function fail(message: string): never {
  console.error(`backfill-mal: ${message}`);
  process.exit(1);
}

function readLimit(): number | null {
  const { values } = parseArgs({ options: { limit: { type: 'string' } } });
  const limit = values.limit === undefined ? null : Number(values.limit);
  if (limit !== null && (!Number.isInteger(limit) || limit < 1)) {
    fail('--limit must be a positive integer');
  }
  return limit;
}

async function main(): Promise<void> {
  const limit = readLimit();
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
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const store = new PostgresMalStore(pool);
    const client = createMalClient({
      clientId: mal.clientId,
      baseUrl: mal.baseUrl,
    });
    const guesser = createNameGuesser(deepseek);
    const filler = new MalFiller(
      store,
      client,
      systemClock,
      createMalJudge(jev),
      null,
      createTrailerClient({ baseUrl: mal.trailerBaseUrl }),
      new MalFranchise(client, systemClock),
      guesser && { guesser, store: new PostgresNameGuessStore(pool) },
    );
    const rows = await findBackfillRows(pool, limit);
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
