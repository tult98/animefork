import type { Season } from './watch.ts';

// A partial MAL date is read as the first day of its period.
function padDate(date: string): string {
  return `${date}${'-01-01'.slice(Math.max(0, date.length - 4))}`;
}

// Dated seasons fill the slots dated ones held, ordered by date. A season with no date keeps its place.
export function sortSeasons(
  seasons: Season[],
  startDates: Map<string, string | null | undefined>,
): Season[] {
  const dated = seasons.flatMap((season, index) => {
    const date = startDates.get(season.slug);
    return date ? [{ season, index, date: padDate(date) }] : [];
  });
  const ordered = [...dated].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : a.index - b.index,
  );
  const result = [...seasons];
  dated.forEach((slot, i) => {
    result[slot.index] = (ordered[i] as (typeof dated)[number]).season;
  });
  return result;
}
