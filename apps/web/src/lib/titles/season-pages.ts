import type { Transport } from '../transport/index.ts';
import { expectOk } from '../transport/index.ts';
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

export async function fetchSeasonFirstPage(
  transport: Transport,
  seasonPath: string,
  signal?: AbortSignal,
): Promise<SeasonFirstPage> {
  const res = await transport.get({ url: seasonPath, signal });
  expectOk(res, seasonPath);
  return { titles: parseSeason(res.data), pageCount: parsePageCount(res.data) };
}

export async function fetchSeasonRest(
  transport: Transport,
  seasonPath: string,
  pageCount: number,
  signal?: AbortSignal,
): Promise<SeasonRest> {
  const settled = await Promise.allSettled(
    Array.from({ length: pageCount - 1 }, async (_, index) => {
      const url = seasonPagePath(seasonPath, index + 2);
      const res = await transport.get({ url, signal });
      expectOk(res, url);
      return parseSeason(res.data);
    }),
  );
  const pages = settled.flatMap((page) =>
    page.status === 'fulfilled' ? [page.value] : [],
  );
  return { titles: pages.flat(), complete: pages.length === settled.length };
}
