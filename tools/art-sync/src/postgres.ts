import pg from 'pg';
import {
  EPISODE_ART_TABLE,
  TITLE_ART_TABLE,
  type EpisodeArtRow,
  type TitleArtRow,
} from './schema.ts';
import type { ArtSink } from './sync.ts';

export function createPostgresSink(connectionString: string): ArtSink {
  return {
    async write(titles: TitleArtRow[], episodes: EpisodeArtRow[]) {
      const client = new pg.Client({ connectionString });
      await client.connect();
      try {
        await client.query('begin');
        if (titles.length > 0) {
          await client.query(
            `insert into ${TITLE_ART_TABLE}
               (source_slug, tmdb_id, tmdb_season, backdrop_path, backdrop_lang)
             select * from unnest($1::text[], $2::int[], $3::int[], $4::text[], $5::text[])
             on conflict (source_slug) do update set
               tmdb_id = excluded.tmdb_id,
               tmdb_season = excluded.tmdb_season,
               backdrop_path = excluded.backdrop_path,
               backdrop_lang = excluded.backdrop_lang,
               matched_at = now()`,
            [
              titles.map((t) => t.source_slug),
              titles.map((t) => t.tmdb_id),
              titles.map((t) => t.tmdb_season),
              titles.map((t) => t.backdrop_path ?? null),
              titles.map((t) => t.backdrop_lang ?? null),
            ],
          );
        }
        if (episodes.length > 0) {
          await client.query(
            `insert into ${EPISODE_ART_TABLE} (source_slug, episode_number, still_path)
             select * from unnest($1::text[], $2::int[], $3::text[])
             on conflict (source_slug, episode_number) do update set
               still_path = excluded.still_path`,
            [
              episodes.map((e) => e.source_slug),
              episodes.map((e) => e.episode_number),
              episodes.map((e) => e.still_path),
            ],
          );
        }
        await client.query('commit');
      } catch (error) {
        await client.query('rollback').catch(() => undefined);
        throw error;
      } finally {
        await client.end();
      }
    },
  };
}
