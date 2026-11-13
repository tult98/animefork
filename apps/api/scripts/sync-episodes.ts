import { parseArgs } from 'node:util';
import pg from 'pg';
import { loadDeepSeekConfig } from '../src/art/art.config.ts';
import { EnvError } from '../src/config/app.config.ts';
import { createEpisodeSiteClient } from '../src/episodes/episode.client.ts';
import { createJikanClient } from '../src/episodes/jikan.client.ts';
import {
  MemoryEpisodeStore,
  PostgresEpisodeStore,
  type EpisodeStore,
} from '../src/episodes/episode.store.ts';
import { syncEpisodes } from '../src/episodes/episode.sync.ts';
import { createEpisodeTranslators } from '../src/episodes/episode.translate.ts';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function readFlags() {
  const { values } = parseArgs({
    options: {
      limit: { type: 'string' },
      'mal-id': { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
    strict: true,
  });
  const positive = (name: 'limit' | 'mal-id') => {
    const raw = values[name];
    if (raw === undefined) return undefined;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1)
      fail(`--${name} wants a positive integer`);
    return n;
  };
  return {
    limit: positive('limit'),
    malId: positive('mal-id'),
    dryRun: values['dry-run'],
  };
}

async function main(): Promise<void> {
  const { limit, malId, dryRun } = readFlags();
  // A dry run of one show reads Jikan and MAL only, so it works with no database.
  const needsDb = !(dryRun && malId !== undefined);
  if (needsDb && !process.env.DATABASE_URL?.trim()) {
    fail('set DATABASE_URL (for example in apps/api/.env) and run again');
  }
  let deepseek;
  try {
    deepseek = loadDeepSeekConfig(process.env);
  } catch (error) {
    if (error instanceof EnvError) fail(error.message);
    throw error;
  }

  const pool = needsDb
    ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
    : null;
  const store: EpisodeStore = pool
    ? new PostgresEpisodeStore(pool)
    : new MemoryEpisodeStore();
  try {
    const malIds = malId !== undefined ? [malId] : await store.matchedMalIds();
    if (malId !== undefined && pool) {
      const matched = await store.matchedMalIds();
      if (!matched.includes(malId)) {
        console.log(
          `mal ${malId} has no ok match in title_mal, fetching it anyway`,
        );
      }
    }
    console.log(`${dryRun ? 'dry run, ' : ''}${malIds.length} MAL entries`);
    const totals = await syncEpisodes(malIds, {
      store,
      lists: createJikanClient(),
      site: createEpisodeSiteClient(),
      translators: deepseek ? createEpisodeTranslators(deepseek) : null,
      log: (line) => console.log(line),
      dryRun,
      limit,
    });
    console.log(JSON.stringify(totals));
  } finally {
    await pool?.end();
  }
}

await main();
