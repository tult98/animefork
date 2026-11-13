import { upstream, upstreamPath } from '../transport/index.ts';
import { parseSeason } from './home.ts';
import type { Title } from './title.ts';

export const MAX_SEASON_PAGES = 10;

const PAGER_TEXT = /(\d+)\s+của\s+(\d+)/;

export function parsePageCount(html: string): number {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const text = doc.querySelector('.wp-pagenavi .pages')?.textContent ?? '';
  const total = Number(PAGER_TEXT.exec(text)?.[2]);
  return Number.isInteger(total) && total >= 1
    ? Math.min(total, MAX_SEASON_PAGES)
    : 1;
}

export function seasonPagePath(seasonPath: string, page: number): string {
  return `${seasonPath.replace(/\/+$/, '')}/trang-${page}.html`;
}

export interface SeasonFirstPage {
  titles: Title[];
  pageCount: number;
}

export interface SeasonRest {
  titles: Title[];
  complete: boolean;
}

export function joinSeasonPages(pages: Title[][]): Title[] {
  const seen = new Set<string>();
  return pages.flat().filter((title) => {
    if (seen.has(title.path)) return false;
    seen.add(title.path);
    return true;
  });
}

export function pagesNeeded(
  sourcePageCount: number,
  firstPageCardCount: number,
  limit?: number,
): number {
  const available = Math.min(Math.max(1, sourcePageCount), MAX_SEASON_PAGES);
  if (limit === undefined) return available;
  if (firstPageCardCount <= 0) return 1;
  return Math.max(
    1,
    Math.min(available, Math.ceil(limit / firstPageCardCount)),
  );
}

export function limitTitles(titles: Title[], limit?: number): Title[] {
  return limit === undefined ? titles : titles.slice(0, Math.max(0, limit));
}

export async function fetchSeasonFirstPage(
  seasonPath: string,
  signal?: AbortSignal,
): Promise<SeasonFirstPage> {
  const html = await upstream.get(upstreamPath(seasonPath), { signal }).text();
  return { titles: parseSeason(html), pageCount: parsePageCount(html) };
}

export async function fetchSeasonRest(
  seasonPath: string,
  pageCount: number,
  signal?: AbortSignal,
): Promise<SeasonRest> {
  const settled = await Promise.allSettled(
    Array.from({ length: pageCount - 1 }, async (_, index) => {
      const url = upstreamPath(seasonPagePath(seasonPath, index + 2));
      return parseSeason(await upstream.get(url, { signal }).text());
    }),
  );
  const pages = settled.flatMap((page) =>
    page.status === 'fulfilled' ? [page.value] : [],
  );
  return { titles: pages.flat(), complete: pages.length === settled.length };
}
