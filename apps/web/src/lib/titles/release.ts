import type { MalSeason } from '../../../../api/src/art/contract.ts';
import { formatCountdown } from './countdown.ts';
import type { Title } from './title.ts';

const DAY_MS = 86_400_000;
const SEASON_MONTHS = 3;

const SEASON_FIRST_MONTH: Record<MalSeason, number> = {
  winter: 0,
  spring: 3,
  summer: 6,
  fall: 9,
};

const SEASON_NAME: Record<MalSeason, string> = {
  winter: 'đông',
  spring: 'xuân',
  summer: 'hè',
  fall: 'thu',
};

const START_DATE = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;

export interface ReleaseInfo {
  label: string;
  // The earliest instant the information allows, so the nearest titles sort first.
  sortKey: number;
  // The first instant the information no longer leaves room for a release, so the title is out by then.
  endsAt: number;
}

type ReleaseSource = Pick<Title, 'releasesAt' | 'year' | 'mal'>;

function parseStartDate(
  startDate: string | null | undefined,
): { year: number; month?: number; day?: number } | null {
  const match = START_DATE.exec(startDate ?? '');
  if (!match) return null;
  return {
    year: Number(match[1]),
    ...(match[2] && { month: Number(match[2]) }),
    ...(match[3] && { day: Number(match[3]) }),
  };
}

export function releaseInfo(
  title: ReleaseSource,
  now: number,
): ReleaseInfo | null {
  if (title.releasesAt !== undefined) {
    return {
      label: formatCountdown(title.releasesAt, now),
      sortKey: title.releasesAt,
      endsAt: title.releasesAt,
    };
  }
  const date = parseStartDate(title.mal?.startDate);
  if (date?.month !== undefined && date.day !== undefined) {
    const day = Date.UTC(date.year, date.month - 1, date.day);
    return {
      label: formatCountdown(day, now),
      sortKey: day,
      endsAt: day + DAY_MS,
    };
  }
  if (date?.month !== undefined) {
    return {
      label: `${date.month}/${date.year}`,
      sortKey: Date.UTC(date.year, date.month - 1, 1),
      endsAt: Date.UTC(date.year, date.month, 1),
    };
  }
  const season = title.mal?.startSeason;
  if (season) {
    const first = SEASON_FIRST_MONTH[season.season];
    return {
      label: `Mùa ${SEASON_NAME[season.season]} ${season.year}`,
      sortKey: Date.UTC(season.year, first, 1),
      endsAt: Date.UTC(season.year, first + SEASON_MONTHS, 1),
    };
  }
  const year = title.year ?? date?.year;
  if (year === undefined) return null;
  return {
    label: String(year),
    sortKey: Date.UTC(year, 0, 1),
    endsAt: Date.UTC(year + 1, 0, 1),
  };
}
