import { describe, expect, it } from 'vitest';
import { titleLink } from './link.ts';

describe('titleLink', () => {
  it('turns a title path into the splat of the /phim/$ route', () => {
    expect(
      titleLink({ path: '/phim/ushiro-no-shoumen-kamui-san-a6084/' }),
    ).toEqual({
      to: '/phim/$',
      params: { _splat: 'ushiro-no-shoumen-kamui-san-a6084/' },
    });
  });

  it('keeps a path that does not start with the prefix', () => {
    expect(titleLink({ path: 'x-a1/' }).params._splat).toBe('x-a1/');
  });
});
