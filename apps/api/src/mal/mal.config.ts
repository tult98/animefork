import { z } from 'zod';
import { parseEnv, type Env } from '../config/app.config.ts';

export const MAL_CONFIG = Symbol('MalConfig');

export const DEFAULT_MAL_API = 'https://api.myanimelist.net/v2';

export const DEFAULT_TENRAI_API = 'https://api.tenrai.org/v1';

export interface MalConfig {
  clientId: string;
  baseUrl: string;
  trailerBaseUrl: string;
}

const blankIsUnset = (value: unknown) => (value === '' ? undefined : value);

const MalEnvSchema = z.object({
  MAL_CLIENT_ID: z.preprocess(blankIsUnset, z.string().optional()),
  MAL_API_BASE: z.preprocess(blankIsUnset, z.url().optional()),
  TENRAI_API_BASE: z.preprocess(blankIsUnset, z.url().optional()),
});

// Without a client id MyAnimeList is simply off: lookups answer no MAL data and never call it.
export function loadMalConfig(env: Env): MalConfig | undefined {
  const values = parseEnv(MalEnvSchema, env);
  const clientId = values.MAL_CLIENT_ID?.trim();
  return clientId
    ? {
        clientId,
        baseUrl: values.MAL_API_BASE ?? DEFAULT_MAL_API,
        trailerBaseUrl: values.TENRAI_API_BASE ?? DEFAULT_TENRAI_API,
      }
    : undefined;
}
