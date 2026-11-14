import { z } from 'zod';
import { parseEnv, type Env } from '../config/app.config.ts';

export const ART_CONFIG = Symbol('ArtConfig');

export const DEFAULT_JEV_MODEL = 'jev-latest';
export const DEFAULT_JEV_MIN_NOUL = 0.85;
export const DEFAULT_JEV_MIN_CHOICE = 0.85;
export const DEFAULT_JEV_MIN_CONFIDENCE = 0.5;
export const DEFAULT_JEV_MAL_MIN_NOUL = 0.8;
export const DEFAULT_JEV_MAL_MIN_CHOICE = 0.8;
// Fitted on the Conan, One Piece and Railgun movies MAL search never reached.
export const DEFAULT_JEV_FRANCHISE_MIN_CHOICE = 0.95;
export const DEFAULT_JEV_FRANCHISE_MIN_NOUL = 0.6;

export const DEFAULT_DEEPSEEK_API = 'https://api.deepseek.com';
export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-flash';

export interface DeepSeekConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface JevConfig {
  apiKey: string;
  model: string;
  minNoul: number;
  minChoice: number;
  minConfidence: number;
  malMinNoul: number;
  malMinChoice: number;
  franchiseMinChoice: number;
  franchiseMinNoul: number;
}

export interface ArtConfig {
  tmdbApiKey: string;
  tmdbApiBase: string | undefined;
  jev: JevConfig | undefined;
  deepseek: DeepSeekConfig | undefined;
}

const blankIsUnset = (value: unknown) => (value === '' ? undefined : value);
const optionalText = z.preprocess(blankIsUnset, z.string().optional());
const optionalFraction = z.preprocess(
  blankIsUnset,
  z.coerce.number().min(0).max(1).optional(),
);

const JevEnvSchema = z.object({
  TYPESAFE_API_KEY: optionalText,
  JEV_MODEL: optionalText,
  JEV_MIN_NOUL: optionalFraction,
  JEV_MIN_CHOICE: optionalFraction,
  JEV_MIN_CONFIDENCE: optionalFraction,
  JEV_MAL_MIN_NOUL: optionalFraction,
  JEV_MAL_MIN_CHOICE: optionalFraction,
  JEV_FRANCHISE_MIN_CHOICE: optionalFraction,
  JEV_FRANCHISE_MIN_NOUL: optionalFraction,
});

const ArtEnvSchema = JevEnvSchema.extend({
  TMDB_API_KEY: z.string().min(1),
  TMDB_API_BASE: z.url().optional().or(z.literal('')),
  DEEPSEEK_API_KEY: optionalText,
  DEEPSEEK_API_BASE: z.preprocess(blankIsUnset, z.url().optional()),
  DEEPSEEK_MODEL: optionalText,
});

function toJevConfig(
  values: z.infer<typeof JevEnvSchema>,
): JevConfig | undefined {
  const apiKey = values.TYPESAFE_API_KEY?.trim();
  return apiKey
    ? {
        apiKey,
        model: values.JEV_MODEL ?? DEFAULT_JEV_MODEL,
        minNoul: values.JEV_MIN_NOUL ?? DEFAULT_JEV_MIN_NOUL,
        minChoice: values.JEV_MIN_CHOICE ?? DEFAULT_JEV_MIN_CHOICE,
        minConfidence: values.JEV_MIN_CONFIDENCE ?? DEFAULT_JEV_MIN_CONFIDENCE,
        malMinNoul: values.JEV_MAL_MIN_NOUL ?? DEFAULT_JEV_MAL_MIN_NOUL,
        malMinChoice: values.JEV_MAL_MIN_CHOICE ?? DEFAULT_JEV_MAL_MIN_CHOICE,
        franchiseMinChoice:
          values.JEV_FRANCHISE_MIN_CHOICE ?? DEFAULT_JEV_FRANCHISE_MIN_CHOICE,
        franchiseMinNoul:
          values.JEV_FRANCHISE_MIN_NOUL ?? DEFAULT_JEV_FRANCHISE_MIN_NOUL,
      }
    : undefined;
}

export function loadJevConfig(env: Env): JevConfig | undefined {
  return toJevConfig(parseEnv(JevEnvSchema, env));
}

const DeepSeekEnvSchema = z.object({
  DEEPSEEK_API_KEY: optionalText,
  DEEPSEEK_API_BASE: z.preprocess(blankIsUnset, z.url().optional()),
  DEEPSEEK_MODEL: optionalText,
});

function toDeepSeekConfig(
  values: z.infer<typeof DeepSeekEnvSchema>,
): DeepSeekConfig | undefined {
  const apiKey = values.DEEPSEEK_API_KEY?.trim();
  return apiKey
    ? {
        apiKey,
        baseUrl: values.DEEPSEEK_API_BASE ?? DEFAULT_DEEPSEEK_API,
        model: values.DEEPSEEK_MODEL ?? DEFAULT_DEEPSEEK_MODEL,
      }
    : undefined;
}

export function loadDeepSeekConfig(env: Env): DeepSeekConfig | undefined {
  return toDeepSeekConfig(parseEnv(DeepSeekEnvSchema, env));
}

export function loadArtConfig(env: Env): ArtConfig {
  const values = parseEnv(ArtEnvSchema, env);
  return {
    tmdbApiKey: values.TMDB_API_KEY,
    tmdbApiBase: values.TMDB_API_BASE || undefined,
    jev: toJevConfig(values),
    deepseek: toDeepSeekConfig(values),
  };
}
