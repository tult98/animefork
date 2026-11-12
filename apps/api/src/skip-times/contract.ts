import { z } from 'zod';
import { SLUG_PATTERN } from '../art/contract.ts';

export const SKIP_TIMES_PATH = '/v1/skip-times/:slug/:episode';

export function skipTimesPath(slug: string, episode: number): string {
  return `/v1/skip-times/${encodeURIComponent(slug)}/${episode}`;
}

export const SkipTimesSlugSchema = z.string().regex(SLUG_PATTERN);

export const SkipTimesEpisodeSchema = z
  .string()
  .regex(/^[1-9]\d{0,3}$/)
  .transform(Number);

export const SkipSegmentSchema = z.object({
  kind: z.enum(['intro', 'outro']),
  startS: z.number().min(0),
  endS: z.number().positive(),
});

export type SkipSegment = z.infer<typeof SkipSegmentSchema>;

export const SkipTimesResponseSchema = z.object({
  segments: z.array(SkipSegmentSchema),
});

export type SkipTimesResponse = z.infer<typeof SkipTimesResponseSchema>;
