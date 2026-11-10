import { z } from 'zod';

/** `/phim/<slug>-a<id>/...` is the only place the site exposes a title's numeric id. */
const TITLE_PATH_ID = /^\/phim\/(?:[^/]*-)?a(\d+)(?:\/|$)/;

export function titleIdFromPath(path: string): string | undefined {
  const digits = TITLE_PATH_ID.exec(path)?.[1];
  return digits === undefined ? undefined : `a${digits}`;
}

const TitleIdSchema = z.string().regex(/^a\d+$/, 'expected a<number>');
const TitlePathSchema = z
  .string()
  .regex(TITLE_PATH_ID, 'expected /phim/<slug>-a<id>/');
const NonEmpty = z.string().min(1);

export const GenreSchema = z.object({
  path: NonEmpty,
  name: NonEmpty,
});
export type Genre = z.infer<typeof GenreSchema>;

// Cards differ by home section: "this season" and "hot update" carry no genres, year, description or studio.
// Those stay optional. A parser omits a field it cannot find instead of filling a placeholder.
export const TitleSchema = z.object({
  id: TitleIdSchema,
  path: TitlePathSchema,
  name: NonEmpty,
  image: NonEmpty,
  rating: z.number().min(0).max(10).optional(),
  episodeLabel: NonEmpty.optional(),
  genres: z.array(GenreSchema).min(1).optional(),
  year: z.number().int().min(1900).max(2100).optional(),
  description: NonEmpty.optional(),
  studio: NonEmpty.optional(),
  quality: NonEmpty.optional(),
  /** Absolute release date (`YYYY-MM-DD`) from a pre-release card. */
  releaseTime: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export type Title = z.infer<typeof TitleSchema>;

export const EpisodeSchema = z.object({
  id: NonEmpty,
  name: NonEmpty,
  path: NonEmpty.optional(),
  /** Player kind (`data-play`) and the opaque token (`data-hash`) the playback request needs. */
  play: NonEmpty.optional(),
  hash: NonEmpty.optional(),
});
export type Episode = z.infer<typeof EpisodeSchema>;

export const TitleDetailSchema = TitleSchema.extend({
  otherName: NonEmpty.optional(),
  banner: NonEmpty.optional(),
  watchPath: NonEmpty.optional(),
  ratingCount: z.number().int().min(0).optional(),
  views: z.number().int().min(0).optional(),
  /** "Anime bộ" or "Anime lẻ". */
  format: NonEmpty.optional(),
  country: NonEmpty.optional(),
  director: NonEmpty.optional(),
  language: NonEmpty.optional(),
  /** "Mùa Thu - 2026". */
  seasonLabel: NonEmpty.optional(),
  airingStatus: NonEmpty.optional(),
  ageRating: NonEmpty.optional(),
  followers: z.number().int().min(0).optional(),
  trailer: NonEmpty.optional(),
  /** Other parts of the same franchise (TV series, OVA, 2nd season). */
  parts: z.array(z.object({ path: NonEmpty, name: NonEmpty })),
  episodes: z.array(EpisodeSchema),
  related: z.array(TitleSchema),
});
export type TitleDetail = z.infer<typeof TitleDetailSchema>;

export const ShelfSchema = z.object({
  id: NonEmpty,
  titles: z.array(TitleSchema),
});
export type Shelf = z.infer<typeof ShelfSchema>;

/** The six lists of the home page, keyed by the section the old app named them after. */
export const HomeSchema = z.object({
  carousel: z.array(TitleSchema),
  thisSeason: z.array(TitleSchema),
  lastUpdate: z.array(TitleSchema),
  preRelease: z.array(TitleSchema),
  nominate: z.array(TitleSchema),
  hotUpdate: z.array(TitleSchema),
});
export type Home = z.infer<typeof HomeSchema>;

export const RankEntrySchema = z.object({
  rank: z.number().int().min(1),
  id: TitleIdSchema,
  path: TitlePathSchema,
  name: NonEmpty,
  image: NonEmpty,
  otherName: NonEmpty.optional(),
  episodeLabel: NonEmpty.optional(),
  rating: z.number().min(0).max(10).optional(),
});
export type RankEntry = z.infer<typeof RankEntrySchema>;

export const RankListSchema = z.object({
  entries: z.array(RankEntrySchema),
});
export type RankList = z.infer<typeof RankListSchema>;

export const ScheduleDaySchema = z.object({
  /** Weekday label as printed, for example "Chủ Nhật". */
  weekday: NonEmpty,
  day: z.number().int().min(1).max(31),
  month: z.number().int().min(1).max(12),
  titles: z.array(TitleSchema).min(1),
});
export type ScheduleDay = z.infer<typeof ScheduleDaySchema>;

export const SearchSuggestionSchema = z.object({
  id: TitleIdSchema,
  path: TitlePathSchema,
  name: NonEmpty,
  image: NonEmpty,
  status: NonEmpty.optional(),
});
export type SearchSuggestion = z.infer<typeof SearchSuggestionSchema>;
