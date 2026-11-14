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
import { MATCHER_VERSION } from '../art/retry.ts';
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
import { evalInput, type SourceRow } from './eval-mal.ts';

// The store and the filler pull in Nest decorators, which node's type stripping cannot run,
// so the package script loads this file through @swc-node/register.

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

function fail(message: string): never {
  console.error(`backfill-art: ${message}`);
  process.exit(1);
}

function readFlags(): {
  slugs: string[];
  limit: number | null;
  write: boolean;
} {
  const { values } = parseArgs({
    options: {
      slug: { type: 'string', multiple: true, default: [] },
      limit: { type: 'string' },
      write: { type: 'boolean', default: false },
    },
  });
  const limit = values.limit === undefined ? null : Number(values.limit);
  if (limit !== null && (!Number.isInteger(limit) || limit < 1)) {
    fail('--limit must be a positive integer');
  }
  return { slugs: values.slug, limit, write: values.write };
}

async function main(): Promise<void> {
  const { slugs, limit, write } = readFlags();
  const missing = ['DATABASE_URL', 'TMDB_API_KEY', 'TYPESAFE_API_KEY'].filter(
    (name) => !process.env[name]?.trim(),
  );
  if (missing.length > 0) {
    fail(
      `set ${missing.join(' and ')} (for example in apps/api/.env) and run again`,
    );
  }
  let config;
  try {
    config = loadArtConfig(process.env);
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
      [MATCHER_VERSION, slugs, limit],
    );
    console.log(
      `backfill-art: ${rows.length} Jev match(es) below matcher version ${MATCHER_VERSION}, ` +
        (write ? 'writing' : 'dry run, pass --write to save'),
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
