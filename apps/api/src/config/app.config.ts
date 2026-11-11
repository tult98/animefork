import { z } from 'zod';

export type Env = Record<string, string | undefined>;

export const ENV = Symbol('Env');
export const APP_CONFIG = Symbol('AppConfig');

export const DEFAULT_PORT = 3100;
export const DEFAULT_RATE_LIMIT_PER_MINUTE = 60;

export interface AppConfig {
  databaseUrl: string;
  port: number;
  allowedOrigins: string[];
  trustProxy: boolean;
  rateLimitPerMinute: number;
}

const AppEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().min(1).max(65535).default(DEFAULT_PORT),
  ALLOWED_ORIGINS: z.string().optional(),
  TRUST_PROXY: z.string().optional(),
  RATE_LIMIT_PER_MINUTE: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_RATE_LIMIT_PER_MINUTE),
});

export class EnvError extends Error {
  constructor(names: string[]) {
    super(`missing or invalid env: ${names.join(', ')}`);
    this.name = 'EnvError';
  }
}

export function parseEnv<S extends z.ZodType>(schema: S, env: Env): z.infer<S> {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    throw new EnvError(parsed.error.issues.map((i) => i.path.join('.')));
  }
  return parsed.data;
}

export function parseOrigins(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

export function loadAppConfig(env: Env): AppConfig {
  const values = parseEnv(AppEnvSchema, env);
  return {
    databaseUrl: values.DATABASE_URL,
    port: values.PORT,
    allowedOrigins: parseOrigins(values.ALLOWED_ORIGINS),
    trustProxy: values.TRUST_PROXY === '1',
    rateLimitPerMinute: values.RATE_LIMIT_PER_MINUTE,
  };
}
