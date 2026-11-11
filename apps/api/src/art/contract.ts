import { z } from 'zod';

export const MAX_TITLES_PER_LOOKUP = 50;

export const SLUG_PATTERN = /^[a-z0-9-]{1,400}$/;

export const TitleRatingsSchema = z.object({
  avs: z.object({ score: z.number(), voters: z.number().int() }).optional(),
  quality: z.string().min(1).optional(),
});

export type TitleRatings = z.infer<typeof TitleRatingsSchema>;

export const TitleInputSchema = z.object({
  slug: z.string().regex(SLUG_PATTERN),
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
    posterPath: z.string().min(1).nullable(),
    // Optional so a web build stays compatible with an API that predates the overview.
    overview: z.string().min(1).nullable().optional(),
    overviewTranslated: z.boolean().optional(),
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
  // Both optional so a web build stays compatible with an API that predates ratings.
  ratings: z.record(z.string(), TitleRatingsSchema).optional(),
  // Slugs whose AVS rating is missing or older than AVS_REFRESH_AFTER_MS; only a browser can refresh them.
  avsStale: z.array(z.string()).optional(),
});

export type LookupResponse = z.infer<typeof LookupResponseSchema>;

export const LOOKUP_PATH = '/v1/art/lookup';

export const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';
export const BACKDROP_SIZE = 'original';
export const CARD_BACKDROP_SIZE = 'w780';
export const POSTER_SIZE = 'w342';
export const STILL_SIZE = 'w300';

export type ImageSize =
  | typeof BACKDROP_SIZE
  | typeof CARD_BACKDROP_SIZE
  | typeof POSTER_SIZE
  | typeof STILL_SIZE;

export function tmdbImageUrl(path: string, size: ImageSize): string {
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
}

export const MAX_RATINGS_PER_SUBMIT = 50;

export const AVS_RATINGS_PATH = '/v1/ratings/avs';

export const AvsSubmissionSchema = z.object({
  slug: z.string().regex(SLUG_PATTERN),
  score: z.number().min(0).max(10),
  voters: z.number().int().min(0),
  quality: z.string().min(1).max(20).optional(),
});

export type AvsSubmission = z.infer<typeof AvsSubmissionSchema>;

export const AvsSubmitRequestSchema = z.object({
  items: z.array(AvsSubmissionSchema).min(1).max(MAX_RATINGS_PER_SUBMIT),
});

export type AvsSubmitRequest = z.infer<typeof AvsSubmitRequestSchema>;
