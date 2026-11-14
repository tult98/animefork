import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ART_STORE, type ArtStore } from '../../src/art/art.store.ts';
import { buildApp } from '../test-app.ts';

describe('art store', () => {
  it('keeps the first match of a title when a failure and a second match are saved after it', async () => {
    const { app } = await buildApp();
    const store = app.get<ArtStore>(ART_STORE);
    const slug = `tonikaku-kawaii-${randomUUID()}`;
    const matched = {
      source_slug: slug,
      tmdb_kind: 'tv' as const,
      tmdb_id: 100,
      tmdb_season: 1,
      match_scope: 'season' as const,
      backdrop_path: '/first.jpg',
      backdrop_lang: 'en',
      poster_path: null,
      poster_lang: null,
      source_name: 'Tonikaku Kawaii',
      source_year: null,
      source_episode_count: null,
      matched_by: 'baseline' as const,
    };
    await store.saveMatched({
      title: matched,
      episodes: [
        { source_slug: slug, episode_number: 1, still_path: '/e1.jpg' },
      ],
    });

    await store.saveMiss({ slug, name: 'Tonikaku Kawaii' }, 'failed', 'late');
    await store.saveMatched({
      title: { ...matched, tmdb_id: 9, backdrop_path: '/second.jpg' },
      episodes: [
        { source_slug: slug, episode_number: 1, still_path: '/other.jpg' },
      ],
    });

    expect((await store.find([slug])).get(slug)).toMatchObject({
      status: 'matched',
      tmdbId: 100,
      backdropPath: '/first.jpg',
    });
    expect(await store.episodesPage(slug, 1, 100)).toEqual(
      new Map([[1, '/e1.jpg']]),
    );
  });
});
