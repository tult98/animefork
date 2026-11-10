import { z } from 'zod';

export const MAX_TITLES_PER_LOOKUP = 50;

export const TitleInputSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{1,120}$/),
  name: z.string().min(1).max(200),
  seasonName: z.string().min(1).max(100).optional(),
  year: z.number().int().min(1900).max(2100).optional(),
  episodeCount: z.number().int().min(1).max(2000).optional(),
});

export type TitleInput = z.infer<typeof TitleInputSchema>;

export const LookupRequestSchema = z.object({
  titles: z.array(TitleInputSchema).min(1).max(MAX_TITLES_PER_LOOKUP),
  episodes: z.boolean().optional(),
});

export type LookupRequest = z.infer<typeof LookupRequestSchema>;

export const ArtEntrySchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ready'),
    backdropPath: z.string().min(1).nullable(),
    backdropLang: z.string().min(1).nullable(),
    stills: z
      .record(z.string().regex(/^[1-9]\d*$/), z.string().min(1))
      .optional(),
  }),
  z.object({ status: z.literal('pending') }),
  z.object({ status: z.literal('none') }),
]);

export type ArtEntry = z.infer<typeof ArtEntrySchema>;

export const LookupResponseSchema = z.object({
  art: z.record(z.string(), ArtEntrySchema),
});

export type LookupResponse = z.infer<typeof LookupResponseSchema>;

export const LOOKUP_PATH = '/v1/art/lookup';

export const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';
export const BACKDROP_SIZE = 'w1280';
export const CARD_BACKDROP_SIZE = 'w780';
export const STILL_SIZE = 'w300';

export type ImageSize =
  typeof BACKDROP_SIZE | typeof CARD_BACKDROP_SIZE | typeof STILL_SIZE;

export function tmdbImageUrl(path: string, size: ImageSize): string {
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
}
