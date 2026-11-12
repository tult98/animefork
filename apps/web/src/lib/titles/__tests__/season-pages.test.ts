// @vitest-environment jsdom
import fetchMock from 'fetch-mock';
import { describe, expect, it } from 'vitest';
import { FetchTransport, upstream } from '../../../test/fetch-transport.ts';
import {
  mockSeasonHtml,
  mockSeasonPage2Html,
  mockSeasonPage3Html,
} from '../__mockData__/index.ts';
import {
  fetchSeasonFirstPage,
  fetchSeasonRest,
  joinSeasonPages,
  limitTitles,
  MAX_SEASON_PAGES,
  pagesNeeded,
  parsePageCount,
  seasonPagePath,
} from '../season-pages.ts';
import type { Title } from '../title.ts';

const transport = new FetchTransport();

const pager = (text: string) =>
  `<div class="wp-pagenavi"><span class="pages">${text}</span></div>`;

describe('parsePageCount', () => {
  it('reads the total from the pager text', () => {
    expect(parsePageCount(pager('Trang 1 của 3'))).toBe(3);
    expect(parsePageCount(pager('Trang 2 của 3'))).toBe(3);
  });
  it('treats a missing pager as one page', () => {
    expect(parsePageCount('<ul></ul>')).toBe(1);
  });
  it('treats unreadable pager text as one page', () => {
    expect(parsePageCount(pager('Trang ? của abc'))).toBe(1);
    expect(parsePageCount(pager('Trang 1 của 0'))).toBe(1);
    expect(parsePageCount(pager(''))).toBe(1);
  });
  it('caps a runaway total', () => {
    expect(parsePageCount(pager('Trang 1 của 400'))).toBe(MAX_SEASON_PAGES);
  });
});

describe('seasonPagePath', () => {
  it('names the later pages under the season path', () => {
    expect(seasonPagePath('/season/autumn/2026/', 2)).toBe(
      '/season/autumn/2026/trang-2.html',
    );
    expect(seasonPagePath('/season/autumn/2026', 3)).toBe(
      '/season/autumn/2026/trang-3.html',
    );
  });
});

describe('joinSeasonPages', () => {
  const t = (path: string) => ({ path }) as Title;
  it('keeps page order and drops a repeated title', () => {
    expect(
      joinSeasonPages([[t('a'), t('b')], [t('b'), t('c')], [t('d')]]).map(
        (x) => x.path,
      ),
    ).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('the season pages', () => {
  const path = '/season/autumn/2026/';
  const page = (n: number) => seasonPagePath(path, n);

  it('shows the 2 titles of the first page and a page count of 3', async () => {
    fetchMock.get(upstream(path), mockSeasonHtml);
    const first = await fetchSeasonFirstPage(transport, path);
    expect(first.titles).toHaveLength(2);
    expect(first.pageCount).toBe(3);
  });

  it('lists the later pages in page order', async () => {
    fetchMock.get(upstream(page(2)), mockSeasonPage2Html);
    fetchMock.get(upstream(page(3)), mockSeasonPage3Html);
    const rest = await fetchSeasonRest(transport, path, 3);
    expect(rest.complete).toBe(true);
    expect(rest.titles.map((t) => t.name)).toEqual([
      'Season Three',
      'Season Four',
      'Season Five',
    ]);
  });

  it('keeps the titles of the pages that loaded when one fails', async () => {
    fetchMock.get(upstream(page(2)), 500);
    fetchMock.get(upstream(page(3)), mockSeasonPage3Html);
    const rest = await fetchSeasonRest(transport, path, 3);
    expect(rest.complete).toBe(false);
    expect(rest.titles.map((t) => t.name)).toEqual(['Season Five']);
  });

  it('loads nothing more when the season is one page', async () => {
    expect(await fetchSeasonRest(transport, path, 1)).toEqual({
      titles: [],
      complete: true,
    });
    expect(fetchMock.callHistory.called()).toBe(false);
  });

  it('fails when the first page fails', async () => {
    fetchMock.get(upstream('/season/none/1999/'), 404);
    await expect(
      fetchSeasonFirstPage(transport, '/season/none/1999/'),
    ).rejects.toThrow(/404/);
  });

  it('counts one page when the page has no pager', async () => {
    const html = mockSeasonHtml.replace(
      /<div class="wp-pagenavi">.*<\/div>/s,
      '',
    );
    fetchMock.get(upstream('/s/'), html);
    expect((await fetchSeasonFirstPage(transport, '/s/')).pageCount).toBe(1);
  });
});

describe('pagesNeeded', () => {
  it('without a limit takes every source page up to the cap', () => {
    expect(pagesNeeded(3, 22)).toBe(3);
    expect(pagesNeeded(50, 30)).toBe(MAX_SEASON_PAGES);
  });
  it('derives the pages from the first page card count', () => {
    expect(pagesNeeded(200, 30, 200)).toBe(7);
    expect(pagesNeeded(200, 20, 200)).toBe(10);
    expect(pagesNeeded(200, 22, 200)).toBe(MAX_SEASON_PAGES);
    expect(pagesNeeded(200, 50, 200)).toBe(4);
  });
  it('never exceeds the pages the source has', () => {
    expect(pagesNeeded(3, 30, 200)).toBe(3);
  });
  it('asks for one page when the first page had no cards', () => {
    expect(pagesNeeded(200, 0, 200)).toBe(1);
  });
  it('stops at the first page when the limit is smaller than it', () => {
    expect(pagesNeeded(200, 30, 10)).toBe(1);
  });
  it('treats a source total below one as one page', () => {
    expect(pagesNeeded(0, 30, 200)).toBe(1);
  });
});

describe('limitTitles', () => {
  const list = Array.from(
    { length: 5 },
    (_, i) => ({ path: `/${i}` }) as Title,
  );
  it('keeps the first titles in source order', () => {
    expect(limitTitles(list, 3).map((t) => t.path)).toEqual(['/0', '/1', '/2']);
  });
  it('returns everything when the limit exceeds the source', () => {
    expect(limitTitles(list, 200)).toHaveLength(5);
  });
  it('leaves the list alone without a limit', () => {
    expect(limitTitles(list)).toBe(list);
  });
});
