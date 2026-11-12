// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { FixtureOverride } from '../../test/fixture-fetch.ts';
import {
  cards,
  current,
  openListing,
  order,
  pick,
} from '../../test/listing.ts';
import { stubLookup } from '../../test/lookup-stub.ts';

const JP_PATH = 'danh-sach/all/all/all/all/all/all/jp';
const FIRST = 'ushiro-no-shoumen-kamui-san-a6084';
const LAST = 'meitantei-conan-30-gou-satsujin-jiken-a6089';
const TOTAL = 10 + 12 + 11;
const PAGE = '/new-episodes';

describe('the new episodes listing', () => {
  it('lists every page of the source 30 at a time and reaches the last card', async () => {
    const bodies = stubLookup();
    await openListing(PAGE);
    await waitFor(() => expect(cards()).toHaveLength(30));
    expect(screen.queryByTestId('listing:count')).toBeNull();
    expect(screen.queryByTestId('listing:partial')).toBeNull();
    expect(bodies.flatMap((b) => b.titles)).toHaveLength(TOTAL);
    expect(order()[0]).toBe(FIRST);

    await userEvent.click(screen.getByTestId('listing:page:2'));
    await waitFor(() => expect(current()).toBe('2'));
    expect(order()).toHaveLength(TOTAL - 30);
    expect(order().at(-1)).toBe(LAST);
  });

  it('requests the jp list and never /anime-moi/', async () => {
    stubLookup();
    const requested: string[] = [];
    const record: FixtureOverride = (url) => {
      requested.push(url);
      return undefined;
    };
    await openListing(PAGE, { overrides: [record] });
    expect(requested).toContain(`/fixtures/default/${JP_PATH}.html`);
    expect(requested.some((url) => url.includes('anime-moi'))).toBe(false);
  });

  it('puts the Tập mới badge on every card', async () => {
    stubLookup();
    await openListing(PAGE);
    await waitFor(() => expect(cards()).toHaveLength(30));
    expect(
      cards().filter((c) => c.textContent?.includes('Tập mới')),
    ).toHaveLength(30);
  });

  it('sorting by views reorders the list and returns to page 1', async () => {
    stubLookup();
    const { router } = await openListing(`${PAGE}?page=2`);
    expect(current()).toBe('2');

    await pick('views-desc');
    await waitFor(() => expect(current()).toBe('1'));
    expect(router.state.location.search).toMatchObject({ sort: 'views-desc' });
    expect(screen.getByTestId('listing:sort').textContent).toBe(
      'Xem nhiều nhất',
    );
    expect(order()[0]).not.toBe(FIRST);
  });

  it('a direct URL opens that page', async () => {
    stubLookup();
    await openListing(`${PAGE}?page=2`);
    expect(current()).toBe('2');
    expect(cards()).toHaveLength(TOTAL - 30);
    expect(screen.getByTestId('listing:next')).toHaveProperty('disabled', true);
  });

  describe('a source with 200 pages', () => {
    const CARD = /<li class="TPostMv">.*?<\/li>/s.exec(
      readFileSync(
        resolve(import.meta.dirname, `../__mockData__/default/${JP_PATH}.html`),
        'utf8',
      ),
    )![0];
    const SOURCE = `/fixtures/default/${JP_PATH}`;
    const SOURCE_PAGES = 200;
    const PER_PAGE = 30;

    const generatedPage = (n: number) => {
      const items = Array.from({ length: PER_PAGE }, (_, i) => {
        const id = (n - 1) * PER_PAGE + i + 1;
        return CARD.replaceAll(
          'ushiro-no-shoumen-kamui-san-a6084',
          `gen-${id}-a${id}`,
        ).replaceAll('Ushiro no Shoumen Kamui-san', `Phim ${id}`);
      });
      return `<html><body><ul class="MovieList">${items.join('')}</ul><div class="wp-pagenavi"><span class="pages">Trang ${n} của ${SOURCE_PAGES}</span></div></body></html>`;
    };

    const longSource = () => {
      const requested: string[] = [];
      const override: FixtureOverride = (url) => {
        if (url === `${SOURCE}.html`) {
          requested.push(url);
          return new Response(generatedPage(1));
        }
        const match = new RegExp(`^${SOURCE}/trang-(\\d+)\\.html$`).exec(url);
        if (!match) return undefined;
        requested.push(url);
        return new Response(generatedPage(Number(match[1])));
      };
      return { requested, override };
    };

    it('lists the newest 200 titles over 7 pages and fetches only the pages they need', async () => {
      stubLookup();
      const { requested, override } = longSource();
      await openListing(PAGE, { overrides: [override] });
      expect(cards()).toHaveLength(30);
      expect(screen.queryByTestId('listing:count')).toBeNull();
      expect(screen.queryByTestId('listing:partial')).toBeNull();
      expect(screen.getByTestId('listing:page:7')).toBeTruthy();
      expect(screen.queryByTestId('listing:page:8')).toBeNull();
      expect(order()).toEqual(
        Array.from({ length: 30 }, (_, i) => `gen-${i + 1}-a${i + 1}`),
      );

      await userEvent.click(screen.getByTestId('listing:page:7'));
      await waitFor(() => expect(current()).toBe('7'));
      expect(order()).toHaveLength(20);
      expect(order().at(-1)).toBe('gen-200-a200');

      expect([...new Set(requested)].sort()).toEqual(
        [
          `${SOURCE}.html`,
          ...Array.from(
            { length: 6 },
            (_, i) => `${SOURCE}/trang-${i + 2}.html`,
          ),
        ].sort(),
      );
    });

    it('sorting by views keeps the 200 titles and returns to page 1', async () => {
      const bodies = stubLookup();
      const { override } = longSource();
      await openListing(`${PAGE}?page=3`, { overrides: [override] });
      expect(current()).toBe('3');
      expect(bodies.flatMap((b) => b.titles)).toHaveLength(200);

      await pick('views-desc');
      await waitFor(() => expect(current()).toBe('1'));
      expect(screen.getByTestId('listing:page:7')).toBeTruthy();
      expect(screen.queryByTestId('listing:page:8')).toBeNull();
    });
  });
});
