import { z } from 'zod';
import { ratingRanks } from './rating-rank.ts';
import type { Title } from './title.ts';

export type SortKey = 'recent' | 'rating-desc' | 'rating-asc' | 'views-desc';

export const SORT_LABELS: Record<SortKey, string> = {
  recent: 'Tập mới nhất',
  'rating-desc': 'Đánh giá: cao đến thấp',
  'rating-asc': 'Đánh giá: thấp đến cao',
  'views-desc': 'Xem nhiều nhất',
};

export const DEFAULT_SORT: SortKey = 'recent';
export const DEFAULT_PAGE = 1;

const SortSchema = z
  .enum(Object.keys(SORT_LABELS) as [SortKey, ...SortKey[]])
  .catch(DEFAULT_SORT)
  .default(DEFAULT_SORT);

const PageSchema = z
  .number()
  .int()
  .min(1)
  .catch(DEFAULT_PAGE)
  .default(DEFAULT_PAGE);
export const ListSearchSchema = z.looseObject({
  sort: SortSchema,
  page: PageSchema,
});

export type ListSearch = z.infer<typeof ListSearchSchema>;

interface Row {
  title: Title;
  index: number;
}

function byValue(
  value: (title: Title) => number | null | undefined,
  direction: 1 | -1,
) {
  return (a: Row, b: Row) => {
    const x = value(a.title) ?? null;
    const y = value(b.title) ?? null;
    if (x === null || y === null) {
      return x === y ? a.index - b.index : x === null ? 1 : -1;
    }
    return direction * (x - y) || a.index - b.index;
  };
}

const byRating = (titles: readonly Title[], direction: 1 | -1) => {
  const ranks = ratingRanks(titles);
  return (a: Row, b: Row) =>
    direction * (ranks[a.index]! - ranks[b.index]!) || a.index - b.index;
};

const SORTERS: Record<
  SortKey,
  (titles: readonly Title[]) => (a: Row, b: Row) => number
> = {
  recent: () => (a, b) => a.index - b.index,
  'rating-desc': (titles) => byRating(titles, -1),
  'rating-asc': (titles) => byRating(titles, 1),
  'views-desc': () => byValue((t) => t.views, -1),
};

export function arrange(
  titles: readonly Title[],
  { sort }: Pick<ListSearch, 'sort'>,
): Title[] {
  const rows: Row[] = titles.map((title, index) => ({ title, index }));
  return rows.sort(SORTERS[sort](titles)).map((row) => row.title);
}

const SEASON_NAMES: Record<string, string> = {
  winter: 'Mùa đông',
  spring: 'Mùa xuân',
  summer: 'Mùa hè',
  autumn: 'Mùa thu',
  fall: 'Mùa thu',
};

export function seasonLabel(seasonPath: string | null): string | null {
  const match = /^\/season\/([a-z]+)\/(\d{4})\/?$/.exec(seasonPath ?? '');
  const name = match?.[1] ? SEASON_NAMES[match[1]] : undefined;
  return name ? `${name} ${match?.[2]}` : null;
}
