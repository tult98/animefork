import { describe, expect, it } from 'vitest';
import { episodeProgress } from './episode-progress.ts';

const mal = (over: object) => ({
  id: 1,
  score: null,
  voters: null,
  rank: null,
  popularity: null,
  members: null,
  airing: 'currently_airing' as const,
  episodes: 12,
  startDate: null,
  startSeason: null,
  broadcast: null,
  ...over,
});

describe('episodeProgress', () => {
  it('adds the total to an airing title', () => {
    expect(episodeProgress({ episodeLabel: 'Tập 6', mal: mal({}) })).toBe(
      'Tập 6/12',
    );
  });

  it('leaves the label alone when the total is unknown', () => {
    expect(
      episodeProgress({
        episodeLabel: 'Tập 1035',
        mal: mal({ episodes: null }),
      }),
    ).toBe('Tập 1035');
  });

  it('leaves the label alone off air, without MAL, or when it is not a number', () => {
    expect(
      episodeProgress({
        episodeLabel: 'Tập 12',
        mal: mal({ airing: 'finished_airing' }),
      }),
    ).toBe('Tập 12');
    expect(episodeProgress({ episodeLabel: 'Tập 6', mal: undefined })).toBe(
      'Tập 6',
    );
    expect(episodeProgress({ episodeLabel: 'Full', mal: mal({}) })).toBe(
      'Full',
    );
  });

  it('does not show a count past the total', () => {
    expect(episodeProgress({ episodeLabel: 'Tập 13', mal: mal({}) })).toBe(
      'Tập 13',
    );
  });
});
