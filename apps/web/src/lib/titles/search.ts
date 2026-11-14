import { z } from 'zod';
import { upstream, upstreamPath } from '../transport/index.ts';
import { parseSeason } from './home.ts';
import { parsePageCount } from './season-pages.ts';
import type { Title } from './title.ts';

export const DEFAULT_QUERY = '';
export const DEFAULT_SEARCH_PAGE = 1;

export const SearchSchema = z.looseObject({
  // The router JSON-parses search values, so a numeric query like "86" arrives as a number.
  q: z
    .preprocess(
      (value) => (typeof value === 'number' ? String(value) : value),
      z.string().trim(),
    )
    .catch(DEFAULT_QUERY)
    .default(DEFAULT_QUERY),
  page: z
    .number()
    .int()
    .min(1)
    .catch(DEFAULT_SEARCH_PAGE)
    .default(DEFAULT_SEARCH_PAGE),
});

export interface SearchResults {
  titles: Title[];
  pageCount: number;
}

export function searchPagePath(q: string, page: number): string {
  return `/tim-kiem/${encodeURIComponent(q)}/trang-${page}.html`;
}

export async function fetchSearchPage(
  q: string,
  page: number,
  signal?: AbortSignal,
): Promise<SearchResults> {
  const html = await upstream
    .get(upstreamPath(searchPagePath(q, page)), { signal })
    .text();
  // parseSeason rejects an empty list, but a search with no matches is an answer, not a failure.
  const hasCards = new DOMParser()
    .parseFromString(html, 'text/html')
    .querySelector('.TPostMv');
  return {
    titles: hasCards ? parseSeason(html) : [],
    pageCount: parsePageCount(html),
  };
}
