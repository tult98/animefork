import { describe, expect, it } from 'vitest';
import {
  activeSegment,
  episodeNumber,
  type SkipSegment,
} from '../skip-segments.ts';

const INTRO: SkipSegment = { kind: 'intro', startS: 30, endS: 120 };
const OUTRO: SkipSegment = { kind: 'outro', startS: 1300, endS: 1400 };

describe('activeSegment', () => {
  it('includes the start and excludes the end', () => {
    expect(activeSegment([INTRO], 30)).toBe(INTRO);
    expect(activeSegment([INTRO], 119.99)).toBe(INTRO);
    expect(activeSegment([INTRO], 120)).toBeUndefined();
    expect(activeSegment([INTRO], 29.99)).toBeUndefined();
  });

  it('picks the segment that contains the time', () => {
    expect(activeSegment([INTRO, OUTRO], 1350)).toBe(OUTRO);
    expect(activeSegment([INTRO, OUTRO], 600)).toBeUndefined();
  });

  it('finds nothing without segments', () => {
    expect(activeSegment([], 10)).toBeUndefined();
  });

  it('finds an intro that starts at zero', () => {
    const early: SkipSegment = { kind: 'intro', startS: 0, endS: 90 };
    expect(activeSegment([early], 0)).toBe(early);
  });
});

describe('episodeNumber', () => {
  it('reads a plain episode label', () => {
    expect(episodeNumber('Tập 66')).toBe(66);
    expect(episodeNumber('Tập 1')).toBe(1);
  });

  it('gives no number to a special, a combined label or a zero', () => {
    for (const label of [
      'Full',
      'OVA',
      'Tập 1_BD_Full',
      'Tập 12.5',
      'Tập 0',
      'Tập',
      'Tập 10000',
      '',
    ]) {
      expect(episodeNumber(label), label).toBeUndefined();
    }
  });
});
