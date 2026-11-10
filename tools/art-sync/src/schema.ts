import { z } from 'zod';

// Single source of truth for the art tables (tools/art-sync/db/migrations). The sync tool writes these rows and apps/web reads them.
export const TitleArtRowSchema = z.object({
  source_slug: z.string().min(1),
  tmdb_id: z.number().int(),
  tmdb_season: z.number().int(),
  backdrop_path: z.string().min(1).nullable(),
  backdrop_lang: z.string().min(1).nullable(),
});

export const EpisodeArtRowSchema = z.object({
  source_slug: z.string().min(1),
  episode_number: z.number().int().positive(),
  still_path: z.string().min(1),
});

export type TitleArtRow = z.infer<typeof TitleArtRowSchema>;
export type EpisodeArtRow = z.infer<typeof EpisodeArtRowSchema>;

export const TITLE_ART_TABLE = 'title_art';
export const EPISODE_ART_TABLE = 'episode_art';

export const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';
export const BACKDROP_SIZE = 'w1280';
export const STILL_SIZE = 'w300';

export function tmdbImageUrl(
  path: string,
  size: typeof BACKDROP_SIZE | typeof STILL_SIZE,
): string {
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
}
