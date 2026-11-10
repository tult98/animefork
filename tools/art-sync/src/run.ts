import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { BaselineMatcher } from './matcher.ts';
import { createPostgresSink } from './postgres.ts';
import { syncAll, type ArtSink, type SyncReport } from './sync.ts';
import { createTmdbClient } from './tmdb.ts';
import { TitlesFileSchema } from './titles.ts';

export async function run(
  argv: string[],
  env: NodeJS.ProcessEnv,
  fetchImpl?: typeof fetch,
  createSink: (connectionString: string) => ArtSink = createPostgresSink,
): Promise<SyncReport & { mode: 'write' | 'dry-run' }> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { 'dry-run': { type: 'boolean', default: false } },
  });
  const file = positionals[0];
  if (!file) throw new Error('Usage: art-sync <titles.json> [--dry-run]');
  const apiKey = env.TMDB_API_KEY;
  if (!apiKey) throw new Error('TMDB_API_KEY is not set.');

  const titles = TitlesFileSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
  const databaseUrl = env.DATABASE_URL;
  const live = !values['dry-run'] && databaseUrl;

  const report = await syncAll(
    titles,
    {
      tmdb: createTmdbClient({ apiKey, fetch: fetchImpl }),
      matcher: new BaselineMatcher(),
    },
    live ? createSink(databaseUrl) : undefined,
  );
  return { mode: live ? 'write' : 'dry-run', ...report };
}
