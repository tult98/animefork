// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  aborted,
  failing,
  hold,
  type FixtureOverride,
} from '../../test/fixture-fetch.ts';
import { renderApp } from '../../test/render-app.tsx';

const KAMUI = 'ushiro-no-shoumen-kamui-san-a6084';
const SEASON_ROUTE = /\/danh-sach\/all\/all\/autumn\//;
const JP_LIST = '/danh-sach/all/all/all/all/all/all/jp.html';
const NOW = new Date('2026-11-11T12:00:00Z');

const shelf = (id: string) => screen.getByTestId(`shelf:${id}`);
const maybeShelf = (id: string) => screen.queryByTestId(`shelf:${id}`);
const card = (id: string, slug = KAMUI) =>
  within(shelf(id)).getByTestId(`card:/phim/${slug}/`);
const slugs = (id: string) =>
  within(shelf(id))
    .getAllByRole('listitem')
    .map((item) =>
      item
        .querySelector('[data-testid^="card:/phim/"]')!
        .getAttribute('data-testid')!
        .replace(/^card:\/phim\/|\/$/g, ''),
    );

// Shelves in the order they sit on the page, the hero first.
const rendered = () =>
  [...document.querySelectorAll('[data-testid]')]
    .map((el) => el.getAttribute('data-testid')!)
    .filter((id) => id === 'hero' || /^shelf:[a-z0-9-]+$/.test(id))
    .map((id) => id.replace(/^shelf:/, ''));

async function openHome(overrides: FixtureOverride[] = []) {
  const app = await renderApp('/', { overrides });
  await screen.findByTestId('hero');
  return app;
}

async function openHomeWithSeason(overrides: FixtureOverride[] = []) {
  const app = await openHome(overrides);
  await screen.findByTestId('shelf:airing-this-season');
  return app;
}

describe('home', () => {
  it('renders the hero and the four shelves in order', async () => {
    await openHomeWithSeason();
    expect(rendered()).toEqual([
      'hero',
      'new-episodes',
      'top-10-today',
      'airing-this-season',
      'upcoming',
    ]);
    expect(screen.queryByTestId('error-screen')).toBeNull();
  });

  it('fills each shelf and follows the dedupe rules', async () => {
    await openHomeWithSeason();
    const hero = [...document.querySelectorAll('[data-testid^="hero:slide:"]')]
      .length;
    expect(hero).toBe(10);
    expect(slugs('new-episodes')).toHaveLength(10);
    expect(slugs('top-10-today')).toHaveLength(10);
    expect(slugs('airing-this-season')).toHaveLength(12);
    expect(slugs('upcoming')).toHaveLength(10);

    const news = new Set(slugs('new-episodes'));
    expect(slugs('airing-this-season').filter((s) => news.has(s))).toEqual([]);
  });

  it('takes the new episodes from the jp list, never from /anime-moi/', async () => {
    const requested: string[] = [];
    await openHomeWithSeason([
      (url) => {
        requested.push(url);
        return undefined;
      },
    ]);
    expect(slugs('new-episodes')[0]).toBe(KAMUI);
    expect(requested).toContain(`/fixtures/default${JP_LIST}`);
    expect(requested.some((url) => url.includes('anime-moi'))).toBe(false);
  });

  it('shows a card as art and a badge, with the details in its accessible name', async () => {
    await openHomeWithSeason();
    const one = card('new-episodes');
    expect(
      within(one).getByRole('button', {
        name: 'Ushiro no Shoumen Kamui-san, Tập 19',
      }),
    ).toBeTruthy();
    expect(one.textContent).toContain('Tập mới');
    expect(one.textContent).toContain('Tập 19');
    expect(one.textContent).not.toContain('Ushiro no Shoumen Kamui-san');
    expect(one.textContent).not.toContain('8.8');
    expect(document.body.textContent).not.toMatch(/\bNaN\b/);
  });

  it('shows the Tập mới badge only on the new episodes shelf', async () => {
    await openHomeWithSeason();
    expect(shelf('new-episodes').textContent).toContain('Tập mới');
    expect(shelf('top-10-today').textContent).not.toContain('Tập mới');
    expect(shelf('airing-this-season').textContent).not.toContain('Tập mới');
  });

  it('numbers the top 10 from 1 to 10', async () => {
    await openHomeWithSeason();
    const items = within(shelf('top-10-today')).getAllByRole('listitem');
    expect(
      items.map(
        (item) => item.querySelector('[aria-hidden="true"]')?.textContent,
      ),
    ).toEqual(Array.from({ length: 10 }, (_, i) => String(i + 1)));
    expect(
      items[0]!.querySelector('[data-cover]')!.getAttribute('aria-label'),
    ).toMatch(/^Hạng 1: Black Clover 2nd Season/);
  });

  it('links each see-all to its listing, and the top 10 has none', async () => {
    await openHomeWithSeason();
    const targets = {
      'new-episodes': '/new-episodes',
      'airing-this-season': '/airing-this-season',
      upcoming: '/upcoming',
    };
    for (const [id, href] of Object.entries(targets)) {
      expect(
        screen.getByTestId(`shelf:${id}:see-all`).getAttribute('href'),
      ).toBe(href);
    }
    expect(screen.queryByTestId('shelf:top-10-today:see-all')).toBeNull();
  });

  it('moves focus to the next cover with ArrowRight and back with ArrowLeft', async () => {
    await openHomeWithSeason();
    const covers =
      shelf('new-episodes').querySelectorAll<HTMLElement>('[data-cover]');
    covers[0]!.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(covers[1]);
    await userEvent.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(covers[0]);
  });

  describe('loading', () => {
    it('shows the hero and shelf skeletons until the home page arrives', async () => {
      const { override, release } = hold('/fixtures/default/index.html');
      await renderApp('/', { overrides: [override] });
      const loading = await screen.findByTestId('home:loading');
      expect(loading.querySelectorAll('[aria-busy="true"]')).toHaveLength(3);
      expect(screen.queryByTestId('hero')).toBeNull();

      release();
      await screen.findByTestId('hero');
      expect(screen.queryByTestId('home:loading')).toBeNull();
    });

    it('holds the upcoming shelf back so the season shelf does not land above it later', async () => {
      const { override, release } = hold(SEASON_ROUTE);
      await openHome([override]);
      await screen.findByTestId('shelf:new-episodes');
      expect(maybeShelf('upcoming')).toBeNull();

      release();
      await screen.findByTestId('shelf:upcoming');
      expect(rendered()).toEqual([
        'hero',
        'new-episodes',
        'top-10-today',
        'airing-this-season',
        'upcoming',
      ]);
    });

    it('gives the season shelf its own loading state without blocking the rest', async () => {
      const { override, release } = hold(SEASON_ROUTE);
      await openHome([override]);
      await screen.findByTestId('shelf:new-episodes');
      expect(maybeShelf('top-10-today')).not.toBeNull();
      expect(
        screen.getByTestId('shelf:airing-this-season:loading'),
      ).toBeTruthy();
      expect(maybeShelf('airing-this-season')).toBeNull();

      release();
      await screen.findByTestId('shelf:airing-this-season');
      expect(
        screen.queryByTestId('shelf:airing-this-season:loading'),
      ).toBeNull();
    });
  });

  describe('when a request fails', () => {
    it('hides only the airing shelf when the season request fails', async () => {
      await openHome([failing(SEASON_ROUTE, 404)]);
      await waitFor(() => expect(maybeShelf('upcoming')).not.toBeNull());
      expect(
        screen.queryByTestId('shelf:airing-this-season:loading'),
      ).toBeNull();
      expect(rendered()).toEqual([
        'hero',
        'new-episodes',
        'top-10-today',
        'upcoming',
      ]);
      expect(screen.queryByTestId('error-screen')).toBeNull();
    });

    it.each([
      ['answers 500', failing(JP_LIST)],
      ['is aborted', aborted(JP_LIST)],
    ])(
      'drops the new episodes shelf when the jp list %s',
      async (_, override) => {
        await openHomeWithSeason([override]);
        expect(rendered()).toEqual([
          'hero',
          'top-10-today',
          'airing-this-season',
          'upcoming',
        ]);
        expect(screen.queryByTestId('home:loading')).toBeNull();
        expect(screen.queryByTestId('error-screen')).toBeNull();
      },
    );
  });

  describe('upcoming', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(NOW);
    });
    afterEach(() => vi.useRealTimers());

    it('shows countdown tags in order of the earliest instant', async () => {
      await openHomeWithSeason();
      const upcoming = shelf('upcoming');
      expect(upcoming.getAttribute('aria-label')).toBe('Sắp ra mắt');
      const tags = within(upcoming).getAllByTestId('card:countdown');
      expect(tags.map((tag) => tag.textContent)).toEqual([
        'Hôm nay',
        'Còn 5 ngày',
        'Còn 2 tuần',
        '2027',
        '2027',
        'Còn 3 tháng',
        '2028',
        '2029',
        '2030',
        '2099',
      ]);
      expect(
        card('upcoming', 'akatsuki-no-ryuu-a7009')
          .querySelector('[data-cover]')!
          .getAttribute('aria-label'),
      ).toBe('Akatsuki no Ryuu, PV/??, 2027');
      expect(
        within(shelf('new-episodes')).queryAllByTestId('card:countdown'),
      ).toHaveLength(0);
    });
  });

  describe('navigation', () => {
    it.each([
      ['new-episodes', '/new-episodes', 'Mới cập nhật'],
      ['airing-this-season', '/airing-this-season', 'Đang chiếu mùa này'],
      ['upcoming', '/upcoming', 'Sắp ra mắt'],
    ])('the see-all of %s lands on its listing', async (id, path, heading) => {
      const { router } = await openHomeWithSeason();
      await userEvent.click(screen.getByTestId(`shelf:${id}:see-all`));
      await waitFor(() => expect(router.state.location.pathname).toBe(path));
      expect(
        (await screen.findByRole('heading', { level: 1 })).textContent,
      ).toBe(heading);
    });

    it('lists the main pages in the header and opens one', async () => {
      const { router } = await openHomeWithSeason();
      for (const id of ['home', 'browse', 'schedule', 'rankings', 'my-list']) {
        expect(screen.getByTestId(`nav:${id}`)).toBeTruthy();
      }
      await userEvent.click(screen.getByTestId('nav:browse'));
      await screen.findByTestId('page:Browse');
      expect(router.state.location.pathname).toBe('/browse');
      expect(maybeShelf('new-episodes')).toBeNull();
    });
  });
});
