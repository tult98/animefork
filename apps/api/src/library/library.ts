import type { Rating } from './contract.ts';

export interface RatingRow {
  userId: string;
  slug: string;
  rating: Rating;
  titleName: string;
  image: string;
  genres: string[];
  updatedAt: Date;
}

export interface PlaylistRow {
  id: string;
  name: string;
}

export interface PlaylistItemRow {
  playlistId: string;
  slug: string;
  titleName: string;
  image: string;
  genres: string[];
  addedAt: Date;
}
