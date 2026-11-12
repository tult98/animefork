import { z } from 'zod';

export const WATCH_PROGRESS_PATH = '/v1/watch-progress';
export const WATCH_PROGRESS_SLUG_PATH = '/v1/watch-progress/:slug';

export const WATCH_PROGRESS_SHELF_LIMIT = 20;

export const MAX_SLUG_LENGTH = 200;
export const MAX_EPISODE_ID_LENGTH = 20;
export const MAX_TITLE_NAME_LENGTH = 300;
export const MAX_IMAGE_LENGTH = 2048;
export const MAX_EPISODE_LABEL_LENGTH = 100;

export function watchProgressSlugPath(slug: string): string {
  return `${WATCH_PROGRESS_PATH}/${encodeURIComponent(slug)}`;
}

const SlugSchema = z.string().min(1).max(MAX_SLUG_LENGTH);

export const SaveWatchProgressRequestSchema = z.object({
  slug: SlugSchema,
  episodeId: z.string().regex(/^\d+$/).max(MAX_EPISODE_ID_LENGTH),
  positionS: z.number().min(0),
  durationS: z.number().positive(),
  titleName: z.string().min(1).max(MAX_TITLE_NAME_LENGTH),
  image: z.string().max(MAX_IMAGE_LENGTH),
  episodeLabel: z.string().max(MAX_EPISODE_LABEL_LENGTH),
  seasonSlug: SlugSchema.nullish(),
});

export type SaveWatchProgressRequest = z.infer<
  typeof SaveWatchProgressRequestSchema
>;

export const WatchProgressShelfItemSchema = z.object({
  slug: z.string(),
  episodeId: z.string(),
  episodeLabel: z.string(),
  titleName: z.string(),
  image: z.string(),
  seasonSlug: z.string().nullable(),
  positionS: z.number(),
  durationS: z.number(),
  completed: z.boolean(),
  updatedAt: z.string(),
});

export type WatchProgressShelfItem = z.infer<
  typeof WatchProgressShelfItemSchema
>;

export const WatchProgressShelfResponseSchema = z.object({
  items: z.array(WatchProgressShelfItemSchema),
});

export type WatchProgressShelfResponse = z.infer<
  typeof WatchProgressShelfResponseSchema
>;

export const WatchProgressEpisodeSchema = z.object({
  episodeId: z.string(),
  positionS: z.number(),
  durationS: z.number(),
  completed: z.boolean(),
});

export type WatchProgressEpisode = z.infer<typeof WatchProgressEpisodeSchema>;

export const SaveWatchProgressResponseSchema = WatchProgressEpisodeSchema;

export type SaveWatchProgressResponse = z.infer<
  typeof SaveWatchProgressResponseSchema
>;

export const WatchProgressEpisodesResponseSchema = z.object({
  items: z.array(WatchProgressEpisodeSchema),
});

export type WatchProgressEpisodesResponse = z.infer<
  typeof WatchProgressEpisodesResponseSchema
>;
