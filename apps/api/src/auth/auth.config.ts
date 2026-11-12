import { z } from 'zod';
import { parseEnv, parseOrigins, type Env } from '../config/app.config.ts';

export const AUTH_CONFIG = Symbol('AuthConfig');

export const DEFAULT_SESSION_TTL_DAYS = 30;
export const DEFAULT_MAIL_FROM = 'Animefork <no-reply@localhost>';

export interface AuthConfig {
  sessionTtlDays: number;
  cookieSecure: boolean;
  webBaseUrl: string | undefined;
  mailFrom: string;
}

const blankIsUnset = (value: unknown) => (value === '' ? undefined : value);

const AuthEnvSchema = z.object({
  SESSION_TTL_DAYS: z.preprocess(
    blankIsUnset,
    z.coerce.number().int().positive().default(DEFAULT_SESSION_TTL_DAYS),
  ),
  COOKIE_SECURE: z.preprocess(blankIsUnset, z.enum(['0', '1']).optional()),
  WEB_BASE_URL: z.preprocess(blankIsUnset, z.url().optional()),
  ALLOWED_ORIGINS: z.string().optional(),
  MAIL_FROM: z.preprocess(blankIsUnset, z.string().default(DEFAULT_MAIL_FROM)),
});

export function loadAuthConfig(env: Env): AuthConfig {
  const values = parseEnv(AuthEnvSchema, env);
  return {
    sessionTtlDays: values.SESSION_TTL_DAYS,
    cookieSecure: values.COOKIE_SECURE !== '0',
    webBaseUrl: values.WEB_BASE_URL ?? parseOrigins(values.ALLOWED_ORIGINS)[0],
    mailFrom: values.MAIL_FROM,
  };
}
