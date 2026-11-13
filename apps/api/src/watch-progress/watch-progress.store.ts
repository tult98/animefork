import { Inject, Injectable } from '@nestjs/common';
import type pg from 'pg';
import { PG_POOL } from '../database/migration-runner.ts';
import type { WatchProgressRow } from './watch-progress.ts';

export const WATCH_PROGRESS_STORE = Symbol('WatchProgressStore');

export interface WatchProgressStore {
  save(row: WatchProgressRow): Promise<WatchProgressRow>;
  latestPerSlug(userId: string, limit: number): Promise<WatchProgressRow[]>;
  forSlug(userId: string, slug: string): Promise<WatchProgressRow[]>;
}

interface WatchProgressDbRow {
  user_id: string;
  slug: string;
  episode_id: string;
  position_s: number;
  duration_s: number;
  completed: boolean;
  title_name: string;
  image: string;
  episode_label: string;
  season_slug: string | null;
  series_key: string | null;
  updated_at: Date;
}

const COLUMNS = `user_id, slug, episode_id, position_s, duration_s, completed,
  title_name, image, episode_label, season_slug, series_key, updated_at`;

function toRow(row: WatchProgressDbRow): WatchProgressRow {
  return {
    userId: row.user_id,
    slug: row.slug,
    episodeId: row.episode_id,
    positionS: row.position_s,
    durationS: row.duration_s,
    completed: row.completed,
    titleName: row.title_name,
    image: row.image,
    episodeLabel: row.episode_label,
    seasonSlug: row.season_slug,
    seriesKey: row.series_key,
    updatedAt: row.updated_at,
  };
}

@Injectable()
export class PostgresWatchProgressStore implements WatchProgressStore {
  private readonly pool: pg.Pool;

  constructor(@Inject(PG_POOL) pool: pg.Pool) {
    this.pool = pool;
  }

  async save(row: WatchProgressRow): Promise<WatchProgressRow> {
    const { rows } = await this.pool.query<WatchProgressDbRow>(
      `insert into watch_progress
         (user_id, slug, episode_id, position_s, duration_s, completed,
          title_name, image, episode_label, season_slug, series_key, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       on conflict (user_id, slug, episode_id) do update set
         position_s = excluded.position_s,
         duration_s = excluded.duration_s,
         completed = watch_progress.completed or excluded.completed,
         title_name = excluded.title_name,
         image = excluded.image,
         episode_label = excluded.episode_label,
         season_slug = excluded.season_slug,
         series_key = excluded.series_key,
         updated_at = excluded.updated_at
       returning ${COLUMNS}`,
      [
        row.userId,
        row.slug,
        row.episodeId,
        row.positionS,
        row.durationS,
        row.completed,
        row.titleName,
        row.image,
        row.episodeLabel,
        row.seasonSlug,
        row.seriesKey,
        row.updatedAt,
      ],
    );
    const stored = rows[0];
    if (!stored) throw new Error('watch progress upsert returned no row');
    return toRow(stored);
  }

  async latestPerSlug(
    userId: string,
    limit: number,
  ): Promise<WatchProgressRow[]> {
    const { rows } = await this.pool.query<WatchProgressDbRow>(
      `with keyed as (
         select ${COLUMNS},
                coalesce(series_key, max(series_key) over (partition by user_id, slug), slug) as series
           from watch_progress
          where user_id = $1
       )
       select ${COLUMNS} from (
         select distinct on (series) ${COLUMNS}
           from keyed
          order by series, updated_at desc, length(episode_id) desc, episode_id desc
       ) latest
        order by updated_at desc, length(episode_id) desc, episode_id desc
        limit $2`,
      [userId, limit],
    );
    return rows.map(toRow);
  }

  async forSlug(userId: string, slug: string): Promise<WatchProgressRow[]> {
    const { rows } = await this.pool.query<WatchProgressDbRow>(
      `select ${COLUMNS} from watch_progress
        where user_id = $1 and slug = $2
        order by length(episode_id), episode_id`,
      [userId, slug],
    );
    return rows.map(toRow);
  }
}
