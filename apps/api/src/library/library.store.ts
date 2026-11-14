import { Inject, Injectable } from '@nestjs/common';
import type pg from 'pg';
import { PG_POOL } from '../database/migration-runner.ts';
import type { Rating } from './contract.ts';
import type { PlaylistItemRow, PlaylistRow, RatingRow } from './library.ts';

export const LIBRARY_STORE = Symbol('LibraryStore');

export interface LibraryStore {
  setRating(row: RatingRow): Promise<RatingRow>;
  clearRating(userId: string, slug: string): Promise<void>;
  ratings(userId: string, limit: number): Promise<RatingRow[]>;
  // Returns null when the user already has a playlist with this name, ignoring case.
  createPlaylist(
    userId: string,
    name: string,
    createdAt: Date,
  ): Promise<PlaylistRow | null>;
  playlists(userId: string): Promise<PlaylistRow[]>;
  playlistItems(userId: string, limit: number): Promise<PlaylistItemRow[]>;
  // Both item writes return false when the user does not own the playlist.
  addItem(userId: string, item: PlaylistItemRow): Promise<boolean>;
  removeItem(
    userId: string,
    playlistId: string,
    slug: string,
  ): Promise<boolean>;
}

interface RatingDbRow {
  user_id: string;
  slug: string;
  rating: Rating;
  title_name: string;
  image: string;
  genres: string[];
  updated_at: Date;
}

interface PlaylistDbRow {
  id: string;
  name: string;
}

interface PlaylistItemDbRow {
  playlist_id: string;
  slug: string;
  title_name: string;
  image: string;
  genres: string[];
  added_at: Date;
}

const RATING_COLUMNS =
  'user_id, slug, rating, title_name, image, genres, updated_at';

function toRating(row: RatingDbRow): RatingRow {
  return {
    userId: row.user_id,
    slug: row.slug,
    rating: row.rating,
    titleName: row.title_name,
    image: row.image,
    genres: row.genres,
    updatedAt: row.updated_at,
  };
}

function toItem(row: PlaylistItemDbRow): PlaylistItemRow {
  return {
    playlistId: row.playlist_id,
    slug: row.slug,
    titleName: row.title_name,
    image: row.image,
    genres: row.genres,
    addedAt: row.added_at,
  };
}

@Injectable()
export class PostgresLibraryStore implements LibraryStore {
  private readonly pool: pg.Pool;

  constructor(@Inject(PG_POOL) pool: pg.Pool) {
    this.pool = pool;
  }

  async setRating(row: RatingRow): Promise<RatingRow> {
    const { rows } = await this.pool.query<RatingDbRow>(
      `insert into user_title_ratings
         (user_id, slug, rating, title_name, image, genres, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (user_id, slug) do update set
         rating = excluded.rating,
         title_name = excluded.title_name,
         image = excluded.image,
         genres = excluded.genres,
         updated_at = excluded.updated_at
       returning ${RATING_COLUMNS}`,
      [
        row.userId,
        row.slug,
        row.rating,
        row.titleName,
        row.image,
        row.genres,
        row.updatedAt,
      ],
    );
    const stored = rows[0];
    if (!stored) throw new Error('rating upsert returned no row');
    return toRating(stored);
  }

  async clearRating(userId: string, slug: string): Promise<void> {
    await this.pool.query(
      'delete from user_title_ratings where user_id = $1 and slug = $2',
      [userId, slug],
    );
  }

  async ratings(userId: string, limit: number): Promise<RatingRow[]> {
    const { rows } = await this.pool.query<RatingDbRow>(
      `select ${RATING_COLUMNS} from user_title_ratings
        where user_id = $1
        order by updated_at desc, slug
        limit $2`,
      [userId, limit],
    );
    return rows.map(toRating);
  }

  async createPlaylist(
    userId: string,
    name: string,
    createdAt: Date,
  ): Promise<PlaylistRow | null> {
    const { rows } = await this.pool.query<PlaylistDbRow>(
      `insert into playlists (user_id, name, created_at)
       values ($1, $2, $3)
       on conflict do nothing
       returning id, name`,
      [userId, name, createdAt],
    );
    return rows[0] ?? null;
  }

  async playlists(userId: string): Promise<PlaylistRow[]> {
    const { rows } = await this.pool.query<PlaylistDbRow>(
      `select id, name from playlists
        where user_id = $1
        order by created_at, id`,
      [userId],
    );
    return rows;
  }

  async playlistItems(
    userId: string,
    limit: number,
  ): Promise<PlaylistItemRow[]> {
    const { rows } = await this.pool.query<PlaylistItemDbRow>(
      `select playlist_id, slug, title_name, image, genres, added_at from (
         select i.*,
                row_number() over (
                  partition by i.playlist_id order by i.added_at desc, i.slug
                ) as position
           from playlist_items i
           join playlists p on p.id = i.playlist_id
          where p.user_id = $1
       ) ranked
        where position <= $2
        order by added_at desc, slug`,
      [userId, limit],
    );
    return rows.map(toItem);
  }

  async addItem(userId: string, item: PlaylistItemRow): Promise<boolean> {
    const owned = await this.pool.query(
      'select 1 from playlists where id = $1 and user_id = $2',
      [item.playlistId, userId],
    );
    if (owned.rowCount === 0) return false;
    await this.pool.query(
      `insert into playlist_items
         (playlist_id, slug, title_name, image, genres, added_at)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (playlist_id, slug) do nothing`,
      [
        item.playlistId,
        item.slug,
        item.titleName,
        item.image,
        item.genres,
        item.addedAt,
      ],
    );
    return true;
  }

  async removeItem(
    userId: string,
    playlistId: string,
    slug: string,
  ): Promise<boolean> {
    const owned = await this.pool.query(
      'select 1 from playlists where id = $1 and user_id = $2',
      [playlistId, userId],
    );
    if (owned.rowCount === 0) return false;
    await this.pool.query(
      'delete from playlist_items where playlist_id = $1 and slug = $2',
      [playlistId, slug],
    );
    return true;
  }
}
