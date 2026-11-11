import { describe, expect, it } from 'vitest';
import { heroTitleSize } from './hero-title-size.ts';

describe('heroTitleSize', () => {
  it('keeps the full size up to 24 characters', () => {
    expect(heroTitleSize('Conan')).toEqual({ desktop: 56, phone: 36 });
    expect(heroTitleSize('x'.repeat(24))).toEqual({ desktop: 56, phone: 36 });
  });

  it('steps down at each tier edge', () => {
    expect(heroTitleSize('x'.repeat(25))).toEqual({ desktop: 44, phone: 28 });
    expect(heroTitleSize('x'.repeat(48))).toEqual({ desktop: 44, phone: 28 });
    expect(heroTitleSize('x'.repeat(49))).toEqual({ desktop: 36, phone: 22 });
    expect(heroTitleSize('x'.repeat(73))).toEqual({ desktop: 28, phone: 22 });
  });

  it('holds the floor for the longest names', () => {
    expect(heroTitleSize('x'.repeat(200))).toEqual({ desktop: 28, phone: 22 });
  });

  it('counts a character, not a UTF-16 unit', () => {
    expect(heroTitleSize('😀'.repeat(24))).toEqual({ desktop: 56, phone: 36 });
  });

  it('never grows with the length', () => {
    let last = Infinity;
    for (let n = 0; n <= 200; n++) {
      const { desktop } = heroTitleSize('x'.repeat(n));
      expect(desktop).toBeLessThanOrEqual(last);
      last = desktop;
    }
  });
});
