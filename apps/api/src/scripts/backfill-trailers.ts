import { parseArgs } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';
import pg from 'pg';
import { z } from 'zod';
import { EnvError, parseEnv } from '../config/app.config.ts';
import { DEFAULT_TENRAI_API } from '../mal/mal.config.ts';
import {
  createTrailerClient,
  type TrailerClient,
} from '../mal/trailer.client.ts';

// Tenrai allows 120 requests a minute without a key, and the running API shares that budget.
const DEFAULT_DELAY_MS = 600;

export interface BackfillRow {
  source_slug: string;
  mal_id: number;
}

export interface BackfillSummary {
  lookedUp: number;
  found: number;
  none: number;
  failed: number;
  written: number;
}

export interface BackfillDeps {
  pool: pg.Pool;
  trailers: TrailerClient;
  dryRun: boolean;
  delayMs: number;
  log: (line: string) => void;
}

async function writeTrailer(
  pool: pg.Pool,
  slug: string,
  youtubeId: string,
): Promise<boolean> {
  const { rowCount } = await pool.query(
    `update title_mal set mal_trailer_youtube_id = $2
      where source_slug = $1 and mal_trailer_youtube_id is null`,
    [slug, youtubeId],
  );
  return rowCount === 1;
}

export async function backfillTrailers(
  rows: BackfillRow[],
  { pool, trailers, dryRun, delayMs, log }: BackfillDeps,
): Promise<BackfillSummary> {
  const summary = { lookedUp: 0, found: 0, none: 0, failed: 0, written: 0 };
  for (const [i, row] of rows.entries()) {
    if (i > 0 && delayMs > 0) await sleep(delayMs);
    const id = await trailers.youtubeId(row.mal_id);
    summary.lookedUp++;
    let result: string;
    if (id === undefined) {
      summary.failed++;
      result = 'failed';
    } else if (id === null) {
      summary.none++;
      result = 'none';
    } else {
      summary.found++;
      if (dryRun) {
        result = `found ${id}`;
      } else if (await writeTrailer(pool, row.source_slug, id)) {
        summary.written++;
        result = `written ${id}`;
      } else {
        result = `found ${id}, already set`;
      }
    }
    log(`${row.source_slug} mal ${row.mal_id} ${result}`);
  }
  return summary;
}

const TenraiEnvSchema = z.object({
  TENRAI_API_BASE: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.url().optional(),
  ),
});

function fail(message: string): never {
  console.error(`backfill-trailers: ${message}`);
  process.exit(1);
}

function readFlags(): {
  limit: number | null;
  dryRun: boolean;
  delayMs: number;
} {
  const { values } = parseArgs({
    options: {
      limit: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      'delay-ms': { type: 'string', default: String(DEFAULT_DELAY_MS) },
    },
  });
  const limit = values.limit === undefined ? null : Number(values.limit);
  if (limit !== null && (!Number.isInteger(limit) || limit < 1)) {
    fail('--limit must be a positive integer');
  }
  const delayMs = Number(values['delay-ms']);
  if (!Number.isInteger(delayMs) || delayMs < 0) {
    fail('--delay-ms must be a non-negative integer');
  }
  return { limit, dryRun: values['dry-run'], delayMs };
}

async function main(): Promise<void> {
  const { limit, dryRun, delayMs } = readFlags();
  if (!process.env.DATABASE_URL?.trim()) {
    fail('set DATABASE_URL (for example in apps/api/.env) and run again');
  }
  let baseUrl: string;
  try {
    baseUrl =
      parseEnv(TenraiEnvSchema, process.env).TENRAI_API_BASE ??
      DEFAULT_TENRAI_API;
  } catch (error) {
    if (error instanceof EnvError) fail(error.message);
    throw error;
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await pool.query<BackfillRow>(
      `select source_slug, mal_id
         from title_mal
        where status = 'ok' and mal_id is not null
          and mal_trailer_youtube_id is null
        order by mal_members desc nulls last
        limit $1`,
      [limit],
    );
    console.log(
      `backfill-trailers: ${rows.length} title(s) without a trailer, ` +
        `${dryRun ? 'dry run, nothing written' : 'writing found ids'}, ` +
        `${delayMs}ms between lookups, ${baseUrl}`,
    );
    const summary = await backfillTrailers(rows, {
      pool,
      trailers: createTrailerClient({ baseUrl }),
      dryRun,
      delayMs,
      log: (line) => console.log(line),
    });
    console.log(
      `backfill-trailers: looked up ${summary.lookedUp}, found ${summary.found}, ` +
        `none ${summary.none}, failed ${summary.failed}, written ${summary.written}`,
    );
  } finally {
    await pool.end();
  }
}

if (import.meta.main) await main();
