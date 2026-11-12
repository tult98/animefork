// @vitest-environment jsdom
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { hold } from '../../test/fixture-fetch.ts';
import { mal, stubLookup } from '../../test/lookup-stub.ts';
import { current, order, pick, search } from '../../test/listing.ts';
import { renderApp } from '../../test/render-app.tsx';

const PSYREN = 'psyren-a6115';
const BLACK_CLOVER = 'black-clover-2nd-season-a6073';
const AO_NO_HAKO = 'ao-no-hako-2nd-season-a6078';
const KYOUFU = 'kyoufu-collector-a6136';
const DOUMO = 'doumo-suki-na-hito-ni-horegusuri-wo-irai-sareta-majo-desu-a6113';
const CONAN = 'meitantei-conan-30-gou-satsujin-jiken-a6089';
const KASHITA = 'kashita-maryoku-wa-revo-barai-de-kyousei-choushuu-a6103';

const RATINGS = {
  [PSYREN]: mal(7.9, 50000),
  [BLACK_CLOVER]: mal(8.4, 400000),
  [AO_NO_HAKO]: mal(null, null),
  'shuiro-no-kamen-a6135': mal(8.9, 30000),
  'hotaru-no-yomeiri-a6134': mal(7.0, 150000),
  'tensei-kizoku-kantei-skill-de-nariagaru-3rd-season-a6077': mal(7.2, 90000),
  [KYOUFU]: mal(6.5, 20000),
};

const TOTAL = 22 + 9;
const PAGE_2 = '/danh-sach/all/all/autumn/2026/all/all/jp/trang-2.html';
const COUNT = `Mùa thu 2026 · ${TOTAL} phim`;

const ready = async (path = '/airing-this-season') => {
  const app = await renderApp(path);
  await screen.findByTestId('listing:grid');
  await waitFor(() =>
    expect(screen.getByTestId('listing:count').textContent).toBe(COUNT),
  );
  return app;
};

describe('the listing of the airing season', () => {
  it('counts every page of the season and shows 30 at a time', async () => {
    const bodies = stubLookup(RATINGS);
    await ready();
    expect(order()).toHaveLength(30);
    expect(screen.queryByTestId('listing:partial')).toBeNull();
    expect(bodies.flatMap((b) => b.titles)).toHaveLength(TOTAL);
    expect(order()[0]).toBe(PSYREN);

    await userEvent.click(screen.getByTestId('listing:page:2'));
    await waitFor(() => expect(current()).toBe('2'));
    expect(order()).toHaveLength(TOTAL - 30);
    expect(order().at(-1)).toBe(CONAN);
    expect(screen.getByTestId('listing:count').textContent).toBe(COUNT);
  });

  describe('paging', () => {
    it('next and prev move one page and push history', async () => {
      stubLookup(RATINGS);
      const { router } = await ready();
      const before = router.history.length;

      await userEvent.click(screen.getByTestId('listing:next'));
      await waitFor(() => expect(current()).toBe('2'));
      expect(search(router).page).toBe(2);
      expect(router.history.length).toBe(before + 1);
      expect(screen.getByTestId('listing:next')).toHaveProperty(
        'disabled',
        true,
      );

      await userEvent.click(screen.getByTestId('listing:prev'));
      await waitFor(() => expect(current()).toBe('1'));
      expect(search(router).page).toBeUndefined();

      act(() => router.history.back());
      await waitFor(() => expect(current()).toBe('2'));
      act(() => router.history.back());
      await waitFor(() => expect(current()).toBe('1'));
    });

    it('a numbered button scrolls the grid into view', async () => {
      stubLookup(RATINGS);
      await ready();
      const scrollIntoView = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoView;
      await userEvent.click(screen.getByTestId('listing:page:2'));
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
      expect(scrollIntoView.mock.contexts[0]).toBe(
        screen.getByTestId('listing:grid').parentElement,
      );
    });

    it('changing the sort goes back to page 1 by replacing the entry', async () => {
      stubLookup(RATINGS);
      const { router } = await ready();
      await userEvent.click(screen.getByTestId('listing:page:2'));
      await waitFor(() => expect(current()).toBe('2'));
      const before = router.history.length;

      await pick('rating-desc');
      await waitFor(() => expect(current()).toBe('1'));
      expect(search(router).page).toBeUndefined();
      expect(order()[0]).toBe(BLACK_CLOVER);
      expect(router.history.length).toBe(before);
    });

    it('a direct URL opens that page', async () => {
      stubLookup(RATINGS);
      await ready('/airing-this-season?page=2');
      expect(current()).toBe('2');
      expect(order()).toHaveLength(TOTAL - 30);
      expect(screen.getByTestId('listing:next')).toHaveProperty(
        'disabled',
        true,
      );
    });

    it('a page past the end clamps to the last page', async () => {
      stubLookup(RATINGS);
      await ready('/airing-this-season?page=99');
      expect(current()).toBe('2');
      expect(order()).toHaveLength(TOTAL - 30);
    });

    it('a bad page value falls back to page 1', async () => {
      stubLookup(RATINGS);
      await ready('/airing-this-season?page=-4&sort=az');
      expect(current()).toBe('1');
      expect(screen.getByTestId('listing:sort').textContent).toBe(
        'Tập mới nhất',
      );
    });
  });

  describe.each([
    'mal-asc',
    'avs-desc',
    'score-desc',
    'score-asc',
    'voters-desc',
  ])('an old sort value %s', (old) => {
    it('falls back to the default sort', async () => {
      stubLookup(RATINGS);
      await ready(`/airing-this-season?sort=${old}`);
      expect(order()).toHaveLength(30);
      expect(screen.getByTestId('listing:sort').textContent).toBe(
        'Tập mới nhất',
      );
      expect(order()[0]).toBe(PSYREN);
    });
  });

  describe('sorts', () => {
    it('Tập mới nhất is the upstream order', async () => {
      stubLookup(RATINGS);
      await ready();
      expect(order().slice(0, 3)).toEqual([PSYREN, DOUMO, KYOUFU]);
    });

    it('rating and views reorder the list and write the URL', async () => {
      stubLookup(RATINGS);
      const { router } = await ready();

      await pick('rating-desc');
      await waitFor(() => expect(order()[0]).toBe(BLACK_CLOVER));
      expect(search(router).sort).toBe('rating-desc');

      await pick('rating-asc');
      await waitFor(() => expect(order()[0]).toBe(KASHITA));

      await pick('views-desc');
      await waitFor(() => expect(order()[0]).toBe(BLACK_CLOVER));

      await pick('recent');
      await waitFor(() => expect(order()[0]).toBe(PSYREN));
      expect(search(router).sort).toBeUndefined();
    });

    it('writing the sort replaces the history entry', async () => {
      stubLookup(RATINGS);
      const { router } = await ready();
      const before = router.history.length;
      await pick('rating-asc');
      await waitFor(() => expect(search(router).sort).toBe('rating-asc'));
      expect(router.history.length).toBe(before);
    });

    it('opens on the sort the URL names', async () => {
      stubLookup(RATINGS);
      await ready('/airing-this-season?sort=rating-asc');
      expect(screen.getByTestId('listing:sort').textContent).toBe(
        'Đánh giá: thấp đến cao',
      );
      expect(order()[0]).toBe(KASHITA);
    });
  });

  it('waits for every season page before enabling the control and showing the count', async () => {
    stubLookup(RATINGS);
    const { override, release } = hold(PAGE_2);
    await renderApp('/airing-this-season', {
      overrides: [override],
    });
    await screen.findByTestId('listing:grid');
    expect(order()).toHaveLength(22);
    expect(screen.getByTestId('listing:sort')).toHaveProperty('disabled', true);
    expect(screen.queryByTestId('listing:pager')).toBeNull();
    expect(screen.queryByTestId('listing:count')).toBeNull();

    release();
    await waitFor(() => expect(order()).toHaveLength(30));
    expect(screen.getByTestId('listing:next')).toHaveProperty(
      'disabled',
      false,
    );
    expect(screen.getByTestId('listing:count').textContent).toBe(COUNT);
  });

  it('shows the skeleton, not a partial grid, when the sort or page is not the default', async () => {
    stubLookup(RATINGS);
    const { override, release } = hold(PAGE_2);
    await renderApp('/airing-this-season?sort=views-desc', {
      overrides: [override],
    });
    await screen.findByTestId('listing:loading');
    expect(screen.queryByTestId('listing:grid')).toBeNull();

    release();
    await screen.findByTestId('listing:grid');
    expect(order()).toHaveLength(30);
  });

  it('stays closed while the list loads', async () => {
    stubLookup(RATINGS);
    const { override, release } = hold(PAGE_2);
    await renderApp('/airing-this-season', {
      overrides: [override],
    });
    await screen.findByTestId('listing:grid');
    await userEvent.click(screen.getByTestId('listing:sort'));
    expect(screen.queryByRole('menu')).toBeNull();
    release();
    await waitFor(() =>
      expect(screen.getByTestId('listing:sort')).toHaveProperty(
        'disabled',
        false,
      ),
    );
  });

  it('lists the scraped season when the lookup fails', async () => {
    stubLookup(RATINGS, { fail: true });
    await ready();
    expect(order()).toHaveLength(30);

    await pick('rating-desc');
    await waitFor(() =>
      expect(screen.getByTestId('listing:sort').textContent).toBe(
        'Đánh giá: cao đến thấp',
      ),
    );
  });

  it('keeps the pages it has and says the list is incomplete when a later page fails', async () => {
    stubLookup(RATINGS);
    await renderApp('/airing-this-season', {
      overrides: [
        (url) =>
          url.endsWith(PAGE_2)
            ? new Response('no', { status: 500 })
            : undefined,
      ],
    });
    const partial = await screen.findByTestId('listing:partial');
    expect(partial.textContent).toBe('Chưa tải hết danh sách.');
    await waitFor(() =>
      expect(screen.getByTestId('listing:count').textContent).toBe(
        'Mùa thu 2026 · 22 phim',
      ),
    );
    expect(screen.queryByTestId('error-screen')).toBeNull();
  });
});
