import { describe, expect, it } from 'vitest';
import { titleWatchLink, watchLink } from './link.ts';

describe('watchLink', () => {
  it('targets the watch route with an optional episode id', () => {
    expect(watchLink('x-a1', '72839')).toEqual({
      to: '/watch/$slug/{-$episode}',
      params: { slug: 'x-a1', episode: '72839' },
    });
    expect(watchLink('x-a1').params.episode).toBeUndefined();
  });
});

describe('titleWatchLink', () => {
  it('points a title at its watch page without the trailing slash', () => {
    expect(
      titleWatchLink({ path: '/phim/ushiro-no-shoumen-kamui-san-a6084/' }),
    ).toEqual({
      to: '/watch/$slug/{-$episode}',
      params: { slug: 'ushiro-no-shoumen-kamui-san-a6084', episode: undefined },
    });
  });
});
