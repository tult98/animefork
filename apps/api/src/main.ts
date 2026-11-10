import { serve } from '@hono/node-server';
import pg from 'pg';
import { z } from 'zod';
import {
  createApp,
  DEFAULT_RATE_PER_MINUTE,
  parseOrigins,
} from './art/art.controller.ts';
import { ArtFiller } from './art/art.filler.ts';
import { BaselineMatcher } from './art/tmdb/matcher.ts';
import { migrate, PostgresStore } from './art/art.store.ts';
import { createTmdbClient } from './art/tmdb/tmdb.ts';

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  TMDB_API_KEY: z.string().min(1),
  TMDB_API_BASE: z.string().url().optional().or(z.literal('')),
  PORT: z.coerce.number().int().min(1).max(65535).default(3300),
  ART_ALLOWED_ORIGINS: z.string().optional(),
  ART_TRUST_PROXY: z.string().optional(),
  ART_RATE_PER_MINUTE: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_RATE_PER_MINUTE),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  const names = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
  console.error(`art-api: missing or invalid env: ${names}`);
  process.exit(1);
}
const env = parsed.data;
const log = (message: string) => console.log(`art-api: ${message}`);

const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
await migrate(pool);

const store = new PostgresStore(pool);
const filler = new ArtFiller({
  store,
  sync: {
    tmdb: createTmdbClient({
      apiKey: env.TMDB_API_KEY,
      baseUrl: env.TMDB_API_BASE || undefined,
    }),
    matcher: new BaselineMatcher(),
  },
  log,
});
const allowedOrigins = parseOrigins(env.ART_ALLOWED_ORIGINS);
const app = createApp({
  deps: { store, filler },
  allowedOrigins,
  ratePerMinute: env.ART_RATE_PER_MINUTE,
  trustProxy: env.ART_TRUST_PROXY === '1',
  log,
});

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  log(
    `listening on ${info.port}, CORS origins: ${allowedOrigins.join(', ') || 'none'}`,
  );
});

function shutdown() {
  log('shutting down');
  server.close(() => {
    void pool.end().then(() => process.exit(0));
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
