import { Logger } from '@nestjs/common';
import { parseArgs } from 'node:util';
import pg from 'pg';
import { loadJevConfig } from '../src/art/art.config.ts';
import { tmdbAliases } from '../src/art/tmdb/aliases.ts';
import { createTmdbClient, type TmdbClient } from '../src/art/tmdb/tmdb.ts';
import { systemClock } from '../src/common/clock.ts';
import { EnvError } from '../src/config/app.config.ts';
import { createMalClient } from '../src/mal/mal.client.ts';
import { loadMalConfig } from '../src/mal/mal.config.ts';
import { MalFiller } from '../src/mal/mal.filler.ts';
import { createMalJudge } from '../src/mal/mal.jev.ts';
import { PostgresMalStore, type MalStore } from '../src/mal/mal.store.ts';
import { createTrailerClient } from '../src/mal/trailer.client.ts';
import { evalInput, type SourceRow } from './eval-mal.ts';

// The store and the filler pull in Nest decorators, which node's type stripping cannot run,
// so the package script loads this file through @swc-node/register.

export interface BackfillMalRow extends Omit<SourceRow, 'status' | 'mal_id'> {
  attempted_at: Date;
  tmdb_id: number | null;
  names_at: Date | null;
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
  tmdb: TmdbClient | null;
  log: (line: string) => void;
}

export async function backfillMal(
  rows: BackfillMalRow[],
  { filler, store, tmdb, log }: BackfillMalDeps,
): Promise<BackfillMalSummary> {
  const summary = { lookedUp: 0, ok: 0, none: 0, failed: 0, settled: 0 };
  for (const row of rows) {
    const slug = row.source_slug;
    const tmdbId = row.tmdb_id;
    await filler.fill(
      evalInput(row),
      tmdb && tmdbId !== null ? () => tmdbAliases(tmdb, tmdbId) : undefined,
      row.names_at ?? undefined,
    );
    summary.lookedUp++;
    const stored = (await store.find([slug])).get(slug);
    // The filler leaves a row it finds settled untouched.
    if (
      !stored ||
      stored.attemptedAt.getTime() === row.attempted_at.getTime()
    ) {
      summary.settled++;
      log(`${slug} settled`);
    } else if (stored.status === 'ok') {
      summary.ok++;
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
  try {
    mal = loadMalConfig(process.env);
    jev = loadJevConfig(process.env);
  } catch (error) {
    if (error instanceof EnvError) fail(error.message);
    throw error;
  }
  if (!mal) fail('set MAL_CLIENT_ID');
  const tmdbKey = process.env.TMDB_API_KEY?.trim();
  const tmdb = tmdbKey
    ? createTmdbClient({
        apiKey: tmdbKey,
        baseUrl: process.env.TMDB_API_BASE?.trim() || undefined,
      })
    : null;

  Logger.overrideLogger(['error', 'warn']);
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const store = new PostgresMalStore(pool);
    const filler = new MalFiller(
      store,
      createMalClient({ clientId: mal.clientId, baseUrl: mal.baseUrl }),
      systemClock,
      createMalJudge(jev),
      // Episode lists fill on the title's next lookup, through ensureEpisodes.
      null,
      createTrailerClient({ baseUrl: mal.trailerBaseUrl }),
    );
    const { rows } = await pool.query<BackfillMalRow>(
      `select m.source_slug, m.attempted_at,
              a.source_name, a.source_year, a.source_episode_count,
              case when a.status = 'matched' then a.tmdb_id end as tmdb_id,
              n.names as other_names, n.updated_at as names_at
         from title_mal m
         join title_art a on a.source_slug = m.source_slug
         left join title_names n on n.source_slug = m.source_slug
        where m.status <> 'ok' and a.source_name is not null
        order by m.attempted_at
        limit $1`,
      [limit],
    );
    console.log(
      `backfill-mal: ${rows.length} title(s) without a MAL match, ` +
        `Jev ${jev ? 'on' : 'off'}, TMDB aliases ${tmdb ? 'on' : 'off'}`,
    );
    const summary = await backfillMal(rows, {
      filler,
      store,
      tmdb,
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
