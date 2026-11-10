import { describe, expect, it } from 'vitest';
import { pickBackdrop } from '../src/backdrop.ts';
import type { TmdbImage } from '../src/tmdb.ts';

function image(over: Partial<TmdbImage> & { file_path: string }): TmdbImage {
  return {
    iso_639_1: null,
    vote_average: 0,
    vote_count: 0,
    width: 1000,
    height: 500,
    ...over,
  };
}

describe('pickBackdrop', () => {
  it('prefers vi over en over textless whatever the votes', () => {
    const images = [
      image({ file_path: '/none.jpg', vote_average: 10 }),
      image({ file_path: '/en.jpg', iso_639_1: 'en', vote_average: 6 }),
      image({ file_path: '/vi.jpg', iso_639_1: 'vi', vote_average: 1 }),
    ];
    expect(pickBackdrop(images)).toEqual({ path: '/vi.jpg', lang: 'vi' });
    expect(pickBackdrop(images.slice(0, 2))).toEqual({
      path: '/en.jpg',
      lang: 'en',
    });
    expect(pickBackdrop(images.slice(0, 1))).toEqual({
      path: '/none.jpg',
      lang: null,
    });
  });

  it('ranks inside a tier by votes, then vote count, then width', () => {
    const base = { iso_639_1: 'vi' };
    expect(
      pickBackdrop([
        image({ file_path: '/a.jpg', ...base, vote_average: 5 }),
        image({ file_path: '/b.jpg', ...base, vote_average: 6 }),
      ])?.path,
    ).toBe('/b.jpg');
    expect(
      pickBackdrop([
        image({ file_path: '/a.jpg', ...base, vote_average: 5, vote_count: 2 }),
        image({ file_path: '/b.jpg', ...base, vote_average: 5, vote_count: 9 }),
      ])?.path,
    ).toBe('/b.jpg');
    expect(
      pickBackdrop([
        image({ file_path: '/a.jpg', ...base, width: 1280 }),
        image({ file_path: '/b.jpg', ...base, width: 1920 }),
      ])?.path,
    ).toBe('/b.jpg');
  });

  it('ignores other languages and returns null when nothing qualifies', () => {
    expect(
      pickBackdrop([image({ file_path: '/ja.jpg', iso_639_1: 'ja' })]),
    ).toBeNull();
    expect(pickBackdrop([])).toBeNull();
  });
});
