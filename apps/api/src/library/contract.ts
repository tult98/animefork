import { z } from 'zod';
import {
  MAX_IMAGE_LENGTH,
  MAX_SLUG_LENGTH,
  MAX_TITLE_NAME_LENGTH,
} from '../watch-progress/contract.ts';

export const LIBRARY_PATH = '/v1/library';
export const LIBRARY_RATING_PATH = '/v1/library/ratings/:slug';
export const LIBRARY_PLAYLISTS_PATH = '/v1/library/playlists';
export const LIBRARY_PLAYLIST_ITEM_PATH =
  '/v1/library/playlists/:id/items/:slug';

export const LIBRARY_LIST_LIMIT = 500;

export const MAX_PLAYLIST_NAME_LENGTH = 100;
export const MAX_GENRES = 50;
export const MAX_GENRE_LENGTH = 100;

export function libraryRatingPath(slug: string): string {
  return `${LIBRARY_PATH}/ratings/${encodeURIComponent(slug)}`;
}

export function libraryPlaylistItemPath(id: string, slug: string): string {
  return `${LIBRARY_PLAYLISTS_PATH}/${encodeURIComponent(id)}/items/${encodeURIComponent(slug)}`;
}

export const SlugParamSchema = z.string().min(1).max(MAX_SLUG_LENGTH);

const TitleSnapshotSchema = z.object({
  titleName: z.string().min(1).max(MAX_TITLE_NAME_LENGTH),
  image: z.string().max(MAX_IMAGE_LENGTH),
  genres: z.array(z.string().min(1).max(MAX_GENRE_LENGTH)).max(MAX_GENRES),
});

export const RatingSchema = z.enum(['like', 'dislike']);

export type Rating = z.infer<typeof RatingSchema>;

export const SetRatingRequestSchema = TitleSnapshotSchema.extend({
  rating: RatingSchema,
});

export type SetRatingRequest = z.infer<typeof SetRatingRequestSchema>;

export const AddPlaylistItemRequestSchema = TitleSnapshotSchema;

export type AddPlaylistItemRequest = z.infer<
  typeof AddPlaylistItemRequestSchema
>;

export const CreatePlaylistRequestSchema = z.object({
  name: z.string().trim().min(1).max(MAX_PLAYLIST_NAME_LENGTH),
});

export type CreatePlaylistRequest = z.infer<typeof CreatePlaylistRequestSchema>;

export const LibraryRatingSchema = z.object({
  slug: z.string(),
  rating: RatingSchema,
  titleName: z.string(),
  image: z.string(),
  genres: z.array(z.string()),
  updatedAt: z.string(),
});

export type LibraryRating = z.infer<typeof LibraryRatingSchema>;

export const LibraryPlaylistItemSchema = z.object({
  slug: z.string(),
  titleName: z.string(),
  image: z.string(),
  genres: z.array(z.string()),
  addedAt: z.string(),
});

export type LibraryPlaylistItem = z.infer<typeof LibraryPlaylistItemSchema>;

export const PlaylistSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
});

export type PlaylistSummary = z.infer<typeof PlaylistSummarySchema>;

export const LibraryPlaylistSchema = PlaylistSummarySchema.extend({
  items: z.array(LibraryPlaylistItemSchema),
});

export type LibraryPlaylist = z.infer<typeof LibraryPlaylistSchema>;

export const LibraryResponseSchema = z.object({
  ratings: z.array(LibraryRatingSchema),
  playlists: z.array(LibraryPlaylistSchema),
});

export type LibraryResponse = z.infer<typeof LibraryResponseSchema>;
