import { getConnInfo } from '@hono/node-server/conninfo';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import type { z } from 'zod';
import { LOOKUP_PATH, LookupRequestSchema } from './contract.ts';
import { lookup, type LookupDeps } from './lookup.ts';

export const BODY_LIMIT_BYTES = 64 * 1024;
export const DEFAULT_RATE_PER_MINUTE = 60;
const MAX_BUCKETS = 10_000;

export interface AppOptions {
  deps: Omit<LookupDeps, 'now'>;
  allowedOrigins: string[];
  ratePerMinute?: number;
  trustProxy?: boolean;
  now?: () => Date;
  remoteAddress?: (c: Context) => string | undefined;
  log?: (message: string) => void;
}

export function parseOrigins(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

function nodeRemoteAddress(c: Context): string | undefined {
  try {
    return getConnInfo(c).remote.address;
  } catch {
    return undefined;
  }
}

export function createRateLimiter(perMinute: number, clock: () => number) {
  const ratePerMs = perMinute / 60_000;
  const buckets = new Map<string, { tokens: number; at: number }>();
  return (key: string): { ok: true } | { ok: false; retryAfterS: number } => {
    const now = clock();
    const bucket = buckets.get(key) ?? { tokens: perMinute, at: now };
    bucket.tokens = Math.min(
      perMinute,
      bucket.tokens + (now - bucket.at) * ratePerMs,
    );
    bucket.at = now;
    if (!buckets.has(key) && buckets.size >= MAX_BUCKETS) {
      for (const [k, b] of buckets) {
        if (b.tokens + (now - b.at) * ratePerMs >= perMinute) buckets.delete(k);
      }
    }
    buckets.set(key, bucket);
    if (bucket.tokens < 1) {
      return {
        ok: false,
        retryAfterS: Math.max(
          1,
          Math.ceil((1 - bucket.tokens) / ratePerMs / 1000),
        ),
      };
    }
    bucket.tokens -= 1;
    return { ok: true };
  };
}

function summarize(error: z.ZodError) {
  return error.issues.slice(0, 10).map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

export function createApp(options: AppOptions): Hono {
  const now = options.now ?? (() => new Date());
  const remoteAddress = options.remoteAddress ?? nodeRemoteAddress;
  const limit = createRateLimiter(
    options.ratePerMinute ?? DEFAULT_RATE_PER_MINUTE,
    () => now().getTime(),
  );
  const clientKey = (c: Context): string => {
    if (options.trustProxy) {
      const first = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
      if (first) return first;
    }
    return remoteAddress(c) ?? 'unknown';
  };

  const app = new Hono();
  app.get('/healthz', (c) => c.json({ ok: true }));

  app.use(
    '/v1/*',
    cors({
      origin: options.allowedOrigins,
      allowMethods: ['POST', 'OPTIONS'],
      allowHeaders: ['content-type'],
      maxAge: 600,
    }),
  );
  app.use('/v1/*', async (c, next) => {
    if (c.req.method === 'OPTIONS') return next();
    const verdict = limit(clientKey(c));
    if (!verdict.ok) {
      c.header('Retry-After', String(verdict.retryAfterS));
      return c.json({ error: 'rate_limited' }, 429);
    }
    return next();
  });

  app.post(
    LOOKUP_PATH,
    bodyLimit({
      maxSize: BODY_LIMIT_BYTES,
      onError: (c) => c.json({ error: 'body_too_large' }, 413),
    }),
    async (c) => {
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: 'invalid_json' }, 400);
      }
      const parsed = LookupRequestSchema.safeParse(body);
      if (!parsed.success) {
        return c.json(
          { error: 'invalid_request', issues: summarize(parsed.error) },
          400,
        );
      }
      return c.json(await lookup(parsed.data, { ...options.deps, now: now() }));
    },
  );

  app.onError((error, c) => {
    options.log?.(`request failed: ${error.message}`);
    return c.json({ error: 'unavailable' }, 503);
  });

  return app;
}
