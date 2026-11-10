import { describe, expect, it } from 'vitest';
import {
  EpisodeArtRowSchema,
  TitleArtRowSchema,
  tmdbImageUrl,
} from '../src/schema.ts';

describe('art row schemas', () => {
  it('accepts a title row with no backdrop', () => {
    const row = TitleArtRowSchema.parse({
      source_slug: 'tonikaku-kawaii-a3860',
      tmdb_id: 1,
      tmdb_season: 1,
      backdrop_path: null,
      backdrop_lang: null,
    });
    expect(row.backdrop_path).toBeNull();
  });

  it('rejects an episode row with episode number zero', () => {
    expect(() =>
      EpisodeArtRowSchema.parse({
        source_slug: 's',
        episode_number: 0,
        still_path: '/a.jpg',
      }),
    ).toThrow();
  });
});

describe('tmdbImageUrl', () => {
  it('joins size and path', () => {
    expect(tmdbImageUrl('/a.jpg', 'w300')).toBe(
      'https://image.tmdb.org/t/p/w300/a.jpg',
    );
  });
});
