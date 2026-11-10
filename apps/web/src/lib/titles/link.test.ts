import { describe, expect, it } from 'vitest';
import { titleLink, titleWatchLink, watchLink } from './link.ts';

describe('titleLink', () => {
  it('turns an upstream title path into the splat of the /title/$ route', () => {
    expect(
      titleLink({ path: '/phim/ushiro-no-shoumen-kamui-san-a6084/' }),
    ).toEqual({
      to: '/title/$',
      params: { _splat: 'ushiro-no-shoumen-kamui-san-a6084/' },
    });
  });

  it('keeps a path that does not start with the prefix', () => {
    expect(titleLink({ path: 'x-a1/' }).params._splat).toBe('x-a1/');
  });
});

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
