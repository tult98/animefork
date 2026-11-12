// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Transport } from '../../transport/index.ts';
import { ReplayTransport } from '../../transport/replay-transport.ts';
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

const publicDir = resolve(import.meta.dirname, '../../../../public');
const diskFetch: typeof fetch = async (input) => {
  try {
    return new Response(readFileSync(`${publicDir}${String(input)}`, 'utf8'));
  } catch {
    return new Response('missing', { status: 404 });
  }
};
const replay = () =>
  new ReplayTransport({ baseUrl: '/fixtures/default', fetchImpl: diskFetch });

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

  it('reads the first page with its page count', async () => {
    const first = await fetchSeasonFirstPage(replay(), path);
    expect(first.titles).toHaveLength(22);
    expect(first.pageCount).toBe(3);
  });

  it('fetches the rest in page order', async () => {
    const rest = await fetchSeasonRest(replay(), path, 3);
    expect(rest.complete).toBe(true);
    expect(rest.titles).toHaveLength(8 + 3);
    expect(rest.titles[0]?.name).toBe(
      'Yasei no Last Boss ga Arawareta! 2nd Season',
    );
    expect(rest.titles.at(-1)?.name).toContain('Cửu Kiếp Phần Thiên');
  });

  it('keeps the pages it has when one fails', async () => {
    const real = replay();
    const flaky: Transport = {
      post: real.post.bind(real),
      get: (req) =>
        req.url.endsWith('trang-2.html')
          ? Promise.resolve({ status: 500, data: '' })
          : real.get(req),
    };
    const rest = await fetchSeasonRest(flaky, path, 3);
    expect(rest.complete).toBe(false);
    expect(rest.titles).toHaveLength(3);
  });

  it('asks for nothing more when the season is one page', async () => {
    const get = (): Promise<{ status: number; data: string }> =>
      Promise.reject(new Error('unexpected request'));
    const none: Transport = { get, post: get };
    expect(await fetchSeasonRest(none, path, 1)).toEqual({
      titles: [],
      complete: true,
    });
  });

  it('fails when the first page fails', async () => {
    await expect(
      fetchSeasonFirstPage(replay(), '/season/none/1999/'),
    ).rejects.toThrow(/404/);
  });

  it('is one page without a pager', async () => {
    const html = readFileSync(
      `${publicDir}/fixtures/default/season/autumn/2026.html`,
      'utf8',
    ).replace(/<div class="wp-pagenavi">.*<\/div>/s, '');
    const single: Transport = {
      post: () => Promise.reject(new Error('unused')),
      get: async () => ({ status: 200, data: html }),
    };
    expect((await fetchSeasonFirstPage(single, '/s/')).pageCount).toBe(1);
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
