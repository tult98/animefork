import { z } from 'zod';
import type { Title } from './title.ts';

export type SortKey =
  'recent' | 'score-desc' | 'score-asc' | 'views-desc' | 'voters-desc';

export const SORT_LABELS: Record<SortKey, string> = {
  recent: 'Tập mới nhất',
  'score-desc': 'Điểm: cao đến thấp',
  'score-asc': 'Điểm: thấp đến cao',
  'views-desc': 'Xem nhiều nhất',
  'voters-desc': 'Nhiều lượt bình chọn',
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

export function listingScore(title: Title): number {
  const mal = title.mal?.score;
  return mal == null ? title.rating : (title.rating + mal) / 2;
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

const SORTERS: Record<SortKey, (a: Row, b: Row) => number> = {
  recent: (a, b) => a.index - b.index,
  'score-desc': byValue(listingScore, -1),
  'score-asc': byValue(listingScore, 1),
  'views-desc': byValue((t) => t.views, -1),
  'voters-desc': byValue((t) => t.avsVoters, -1),
};

export function arrange(
  titles: readonly Title[],
  { sort }: Pick<ListSearch, 'sort'>,
): Title[] {
  const rows: Row[] = titles.map((title, index) => ({ title, index }));
  return rows.sort(SORTERS[sort]).map((row) => row.title);
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
