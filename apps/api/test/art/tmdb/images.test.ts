import { describe, expect, it } from 'vitest';
import { pickBackdrop } from '../../../src/art/tmdb/images.ts';

describe('pickBackdrop', () => {
  it('prefers Vietnamese art, then English, then textless, whatever the votes', () => {
    const votes = { vote_count: 10, width: 1920, height: 1080 };
    const textless = {
      ...votes,
      file_path: '/textless.jpg',
      iso_639_1: null,
      vote_average: 10,
    };
    const english = {
      ...votes,
      file_path: '/en.jpg',
      iso_639_1: 'en',
      vote_average: 6,
    };
    const vietnamese = {
      ...votes,
      file_path: '/vi.jpg',
      iso_639_1: 'vi',
      vote_average: 1,
    };

    expect(pickBackdrop([textless, english, vietnamese])).toEqual({
      path: '/vi.jpg',
      lang: 'vi',
    });
    expect(pickBackdrop([textless, english])).toEqual({
      path: '/en.jpg',
      lang: 'en',
    });
    expect(pickBackdrop([textless])).toEqual({
      path: '/textless.jpg',
      lang: null,
    });
  });

  it('picks inside one language by rating, then by vote count, then by width', () => {
    const first = {
      file_path: '/first.jpg',
      iso_639_1: 'vi',
      vote_average: 5,
      vote_count: 2,
      width: 1280,
      height: 720,
    };

    expect(
      pickBackdrop([
        first,
        { ...first, file_path: '/rated.jpg', vote_average: 6 },
      ])?.path,
    ).toBe('/rated.jpg');
    expect(
      pickBackdrop([
        first,
        { ...first, file_path: '/voted.jpg', vote_count: 9 },
      ])?.path,
    ).toBe('/voted.jpg');
    expect(
      pickBackdrop([first, { ...first, file_path: '/wide.jpg', width: 1920 }])
        ?.path,
    ).toBe('/wide.jpg');
  });

  it('picks nothing when the only art is in another language', () => {
    const picked = pickBackdrop([
      {
        file_path: '/ja.jpg',
        iso_639_1: 'ja',
        vote_average: 10,
        vote_count: 90,
        width: 1920,
        height: 1080,
      },
    ]);

    expect(picked).toBeNull();
  });
});
