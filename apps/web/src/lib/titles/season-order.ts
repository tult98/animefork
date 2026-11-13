import type { Season } from './watch.ts';

// A partial MAL date is read as the first day of its period.
function padDate(date: string): string {
  return `${date}${'-01-01'.slice(Math.max(0, date.length - 4))}`;
}

// Side entries are watched apart from the main story. A label with none of these words counts as main line.
const SIDE_ENTRY = /\b(movie|special|ova|ona)\b/i;

// The main line comes first, then the side entries in source order.
// Within the main line, dated seasons fill the slots dated ones held, ordered by date. A season with no date keeps its place.
export function sortSeasons(
  seasons: Season[],
  startDates: Map<string, string | null | undefined>,
): Season[] {
  const main = seasons.filter((season) => !SIDE_ENTRY.test(season.name));
  const side = seasons.filter((season) => SIDE_ENTRY.test(season.name));
  const dated = main.flatMap((season, index) => {
    const date = startDates.get(season.slug);
    return date ? [{ season, index, date: padDate(date) }] : [];
  });
  const ordered = [...dated].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : a.index - b.index,
  );
  const result = [...main];
  dated.forEach((slot, i) => {
    result[slot.index] = (ordered[i] as (typeof dated)[number]).season;
  });
  return [...result, ...side];
}
