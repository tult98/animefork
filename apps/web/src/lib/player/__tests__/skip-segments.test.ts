import { describe, expect, it } from 'vitest';
import {
  activeSegment,
  episodeNumber,
  outroCountdown,
  scrubCaption,
  segmentTicks,
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

describe('segmentTicks', () => {
  it('notches both edges of the intro and the start of the outro', () => {
    expect(segmentTicks([INTRO, OUTRO], 1400)).toEqual([
      (30 / 1400) * 100,
      (120 / 1400) * 100,
      (1300 / 1400) * 100,
    ]);
  });

  it('leaves out a notch at the very start or past the end, and all of them without a duration', () => {
    const early: SkipSegment = { kind: 'intro', startS: 0, endS: 90 };
    expect(segmentTicks([early], 900)).toEqual([10]);
    expect(segmentTicks([INTRO, OUTRO], 0)).toEqual([]);
  });
});

describe('scrubCaption', () => {
  it('tells the intro and the outro apart from the rest of the episode', () => {
    expect(scrubCaption([INTRO, OUTRO], 65)).toBe('1:05 · Mở đầu');
    expect(scrubCaption([INTRO, OUTRO], 1310)).toBe('21:50 · Kết thúc');
    expect(scrubCaption([INTRO, OUTRO], 600)).toBe('10:00');
  });
});

describe('outroCountdown', () => {
  it('counts the seconds left in the video and fills from the start of the outro', () => {
    expect(outroCountdown(OUTRO, 1300, 1400)).toEqual({
      seconds: 100,
      fraction: 0,
    });
    const half = outroCountdown(OUTRO, 1350.2, 1400);
    expect(half.seconds).toBe(50);
    expect(half.fraction).toBeCloseTo(0.502);
    expect(outroCountdown(OUTRO, 1400, 1400)).toEqual({
      seconds: 0,
      fraction: 1,
    });
  });

  it('stays at zero when the clock is past the end or the duration is unknown', () => {
    expect(outroCountdown(OUTRO, 1500, 1400)).toEqual({
      seconds: 0,
      fraction: 1,
    });
    expect(outroCountdown(OUTRO, 1350, Number.NaN)).toEqual({
      seconds: 0,
      fraction: 0,
    });
  });
});
