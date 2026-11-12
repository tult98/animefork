import { describe, expect, it } from 'vitest';
import type { MalStats } from '../../../../../api/src/art/contract.ts';
import { releaseInfo } from '../release.ts';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 11, 12);
const mal = (over: Partial<MalStats>): MalStats => ({
  id: 1,
  score: null,
  voters: null,
  rank: null,
  popularity: null,
  members: null,
  airing: null,
  episodes: null,
  startDate: null,
  startSeason: null,
  ...over,
});

describe('releaseInfo', () => {
  describe('an exact moment', () => {
    it('counts down to releasesAt', () => {
      expect(
        releaseInfo({ releasesAt: NOW + 5 * DAY + 1, year: 2027 }, NOW),
      ).toEqual({
        label: 'Còn 5 ngày',
        sortKey: NOW + 5 * DAY + 1,
        endsAt: NOW + 5 * DAY + 1,
      });
    });

    it('beats everything MyAnimeList says', () => {
      const info = releaseInfo(
        {
          releasesAt: NOW + 14 * DAY,
          mal: mal({
            startDate: '2027-01',
            startSeason: { year: 2027, season: 'winter' },
          }),
        },
        NOW,
      );
      expect(info?.label).toBe('Còn 2 tuần');
    });

    it('counts down to a MyAnimeList start date that has a day', () => {
      const day = Date.UTC(2026, 11, 3);
      expect(
        releaseInfo({ mal: mal({ startDate: '2026-12-03' }) }, NOW),
      ).toEqual({ label: 'Còn 3 tuần', sortKey: day, endsAt: day + DAY });
    });

    it('still reads Hôm nay during the day of release', () => {
      const info = releaseInfo({ mal: mal({ startDate: '2026-11-11' }) }, NOW);
      expect(info?.label).toBe('Hôm nay');
      expect(info!.endsAt).toBeGreaterThan(NOW);
    });

    it('keeps the countdown wording of a far date', () => {
      expect(
        releaseInfo({ mal: mal({ startDate: '2030-06-01' }) }, NOW)?.label,
      ).toBe('2030');
    });
  });

  describe('a month', () => {
    it('reads m/yyyy and sorts at the first of the month', () => {
      expect(
        releaseInfo({ year: 2027, mal: mal({ startDate: '2027-01' }) }, NOW),
      ).toEqual({
        label: '1/2027',
        sortKey: Date.UTC(2027, 0, 1),
        endsAt: Date.UTC(2027, 1, 1),
      });
    });

    it('does not pad the month and rolls December into the next year', () => {
      const info = releaseInfo({ mal: mal({ startDate: '2027-12' }) }, NOW);
      expect(info?.label).toBe('12/2027');
      expect(info?.endsAt).toBe(Date.UTC(2028, 0, 1));
    });

    it('beats a season', () => {
      const info = releaseInfo(
        {
          mal: mal({
            startDate: '2027-02',
            startSeason: { year: 2027, season: 'winter' },
          }),
        },
        NOW,
      );
      expect(info?.label).toBe('2/2027');
    });
  });

  describe('a season', () => {
    it.each([
      ['winter', 'Mùa đông 2027', 0],
      ['spring', 'Mùa xuân 2027', 3],
      ['summer', 'Mùa hè 2027', 6],
      ['fall', 'Mùa thu 2027', 9],
    ] as const)('%s', (season, label, month) => {
      expect(
        releaseInfo(
          { year: 2027, mal: mal({ startSeason: { year: 2027, season } }) },
          NOW,
        ),
      ).toEqual({
        label,
        sortKey: Date.UTC(2027, month, 1),
        endsAt: Date.UTC(2027, month + 3, 1),
      });
    });

    it('beats a start date of only a year', () => {
      const info = releaseInfo(
        {
          year: 2027,
          mal: mal({
            startDate: '2027',
            startSeason: { year: 2027, season: 'summer' },
          }),
        },
        NOW,
      );
      expect(info?.label).toBe('Mùa hè 2027');
    });
  });

  describe('only a year', () => {
    it('reads the year and sorts at January 1st', () => {
      expect(releaseInfo({ year: 2027 }, NOW)).toEqual({
        label: '2027',
        sortKey: Date.UTC(2027, 0, 1),
        endsAt: Date.UTC(2028, 0, 1),
      });
    });

    it('takes a bare MyAnimeList year when the title has none', () => {
      expect(releaseInfo({ mal: mal({ startDate: '2028' }) }, NOW)?.label).toBe(
        '2028',
      );
    });

    it('is null with nothing to go on', () => {
      expect(releaseInfo({}, NOW)).toBeNull();
      expect(releaseInfo({ mal: mal({}) }, NOW)).toBeNull();
    });

    it('ignores a start date of the wrong shape', () => {
      expect(
        releaseInfo({ year: 2027, mal: mal({ startDate: 'soon' }) }, NOW)
          ?.label,
      ).toBe('2027');
    });
  });

  describe('where it ends', () => {
    it('keeps a month until it is over', () => {
      const info = releaseInfo({ mal: mal({ startDate: '2026-11' }) }, NOW);
      expect(info!.sortKey).toBeLessThan(NOW);
      expect(info!.endsAt).toBeGreaterThan(NOW);
    });

    it('is over for a season that has gone by', () => {
      const info = releaseInfo(
        { mal: mal({ startSeason: { year: 2026, season: 'summer' } }) },
        NOW,
      );
      expect(info!.endsAt).toBeLessThanOrEqual(NOW);
    });
  });
});
