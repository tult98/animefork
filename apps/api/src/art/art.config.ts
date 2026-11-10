import { z } from 'zod';
import { parseEnv, type Env } from '../config/app.config.ts';

export const ART_CONFIG = Symbol('ArtConfig');

export interface ArtConfig {
  tmdbApiKey: string;
  tmdbApiBase: string | undefined;
}

const ArtEnvSchema = z.object({
  TMDB_API_KEY: z.string().min(1),
  TMDB_API_BASE: z.url().optional().or(z.literal('')),
});

export function loadArtConfig(env: Env): ArtConfig {
  const values = parseEnv(ArtEnvSchema, env);
  return {
    tmdbApiKey: values.TMDB_API_KEY,
    tmdbApiBase: values.TMDB_API_BASE || undefined,
  };
}
