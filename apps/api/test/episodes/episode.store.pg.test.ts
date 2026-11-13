import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DEFAULT_MIGRATIONS_DIR,
  MigrationRunner,
} from '../../src/database/migration-runner.ts';
import { PostgresEpisodeStore } from '../../src/episodes/episode.store.ts';

const url = process.env.DATABASE_URL;
const malId = 2_000_000_000 + (process.pid % 1_000_000);
const ep = (title: string) => ({
  number: 1,
  title,
  titleAlt: null,
  aired: '2026-10-03',
});

describe.skipIf(!url)('PostgresEpisodeStore against DATABASE_URL', () => {
  let pool: pg.Pool;
  let store: PostgresEpisodeStore;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url });
    await new MigrationRunner(pool, DEFAULT_MIGRATIONS_DIR).run();
    store = new PostgresEpisodeStore(pool);
  });

  afterAll(async () => {
    await pool.query(`delete from episode_info where mal_id = $1`, [malId]);
    await pool.query(`delete from episode_list_sync where mal_id = $1`, [
      malId,
    ]);
    await pool.end();
  });

  it('keeps a translation across a repeat listing and drops it when the title changes', async () => {
    await store.saveListed(malId, [ep('The Door to Hell')]);
    await store.saveSynopsis(malId, 1, 'A door opens.');
    await store.saveTranslation(malId, 1, {
      titleVi: 'Cánh cửa địa ngục',
      synopsisVi: 'Một cánh cửa mở ra.',
    });

    await store.saveListed(malId, [ep('The Door to Hell')]);
    expect((await store.find(malId)).get(1)).toEqual({
      malId,
      number: 1,
      title: 'The Door to Hell',
      titleVi: 'Cánh cửa địa ngục',
      synopsis: 'A door opens.',
      synopsisVi: 'Một cánh cửa mở ra.',
      synopsisFetched: true,
    });

    await store.saveListed(malId, [ep('The Door to Heaven')]);
    expect((await store.find(malId)).get(1)).toMatchObject({
      title: 'The Door to Heaven',
      titleVi: null,
      synopsisVi: 'Một cánh cửa mở ra.',
    });
  });

  it('keeps the latest list attempt per MAL id', async () => {
    const attemptedAt = new Date('2026-01-01T00:00:00Z');
    await store.saveListAttempt({
      malId,
      status: 'failed',
      airing: null,
      attemptedAt,
    });
    await store.saveListAttempt({
      malId,
      status: 'ok',
      airing: 'currently_airing',
      attemptedAt,
    });

    expect((await store.listAttempts([malId, malId + 1])).get(malId)).toEqual({
      malId,
      status: 'ok',
      airing: 'currently_airing',
      attemptedAt,
    });
  });
});
