import { describe, expect, it } from 'vitest';
import type { WatchProgressEpisode } from '../../../../../api/src/watch-progress/contract.ts';
import { progressByEpisode, progressOf } from '../model.ts';
import { resumePoint, seekTarget, startPosition } from '../resume.ts';

const episodes = ['1', '2', '3', '4'].map((id) => ({ id }));
const row = (
  episodeId: string,
  positionS: number,
  completed = false,
): WatchProgressEpisode => ({
  episodeId,
  positionS,
  durationS: 1400,
  completed,
});

describe('resumePoint', () => {
  it('starts at the first episode with no rows', () => {
    expect(resumePoint(episodes, [])).toEqual({ episodeId: '1', positionS: 0 });
  });

  it('returns the last episode in page order that has a row, with its position', () => {
    expect(resumePoint(episodes, [row('3', 300), row('2', 900)])).toEqual({
      episodeId: '3',
      positionS: 300,
    });
  });

  it('offers the next episode at 0 once the last watched one is completed', () => {
    expect(resumePoint(episodes, [row('2', 1390, true)])).toEqual({
      episodeId: '3',
      positionS: 0,
    });
  });

  it('wraps to the first episode when the last one is completed', () => {
    expect(resumePoint(episodes, [row('4', 1390, true)])).toEqual({
      episodeId: '1',
      positionS: 0,
    });
  });

  it('has nothing to resume on a page without episodes', () => {
    expect(resumePoint([], [row('1', 5)])).toBeUndefined();
  });

  it('ignores rows for episodes that are not on the page', () => {
    expect(resumePoint(episodes, [row('2', 100), row('99', 500)])).toEqual({
      episodeId: '2',
      positionS: 100,
    });
    expect(resumePoint(episodes, [row('99', 500)])).toEqual({
      episodeId: '1',
      positionS: 0,
    });
  });
});

describe('startPosition', () => {
  it('uses the saved position', () => {
    expect(startPosition('2', [row('2', 120)])).toBe(120);
  });

  it('starts a completed episode over', () => {
    expect(startPosition('2', [row('2', 1390, true)])).toBe(0);
  });

  it('is 0 without a row', () => {
    expect(startPosition('2', [row('1', 50)])).toBe(0);
  });
});

describe('seekTarget', () => {
  it('rewinds 5 seconds and never goes below 0', () => {
    expect(seekTarget(120)).toBe(115);
    expect(seekTarget(3)).toBe(0);
    expect(seekTarget(0)).toBe(0);
  });
});

describe('progressOf', () => {
  it('is unwatched without a row or at position 0', () => {
    expect(progressOf(undefined)).toEqual({ kind: 'unwatched' });
    expect(progressOf(row('1', 0))).toEqual({ kind: 'unwatched' });
  });

  it('carries the saved fraction while in progress', () => {
    expect(progressOf(row('1', 700))).toEqual({
      kind: 'inProgress',
      fraction: 0.5,
    });
  });

  it('is watched when completed, whatever the position', () => {
    expect(progressOf(row('1', 10, true))).toEqual({ kind: 'watched' });
  });

  it('maps rows by episode id', () => {
    expect(progressByEpisode([row('1', 700)]).get('1')).toEqual({
      kind: 'inProgress',
      fraction: 0.5,
    });
  });
});
