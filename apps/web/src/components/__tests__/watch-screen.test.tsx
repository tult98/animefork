// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { ArtEntry } from '../../../../api/src/art/contract.ts';
import type { FixtureOverride } from '../../test/fixture-fetch.ts';
import { advance, withFakeClock } from '../../test/clock.ts';
import { stubArt } from '../../test/lookup-stub.ts';
import { renderApp } from '../../test/render-app.tsx';

const SLUG = 'tonikaku-kawaii-a3860';
const SEASON_2 = 'tonikaku-kawaii-2nd-season-a4476';
const EPISODES = ['72839', '73010', '73386', '73701', '74002'];
const TMDB = 'https://image.tmdb.org/t/p';

async function openWatch(
  path = `/watch/${SLUG}`,
  overrides: FixtureOverride[] = [],
) {
  const app = await renderApp(path, { overrides });
  await screen.findByTestId('player');
  return app;
}

const pathname = (app: {
  router: { state: { location: { pathname: string } } };
}) => app.router.state.location.pathname;
const label = () => screen.getByTestId('player:episode-label').textContent;
const panel = () => screen.getByTestId('player:episodes-panel');
const row = (n: number) => screen.getByTestId(`episode:${n}`);

describe('the watch screen', () => {
  it('has no site chrome', async () => {
    await openWatch();
    expect(screen.queryByRole('banner')).toBeNull();
    expect(screen.queryByRole('contentinfo')).toBeNull();
  });

  it('says so for an episode that is not on the title', async () => {
    await renderApp(`/watch/${SLUG}/1`);
    await screen.findByTestId('watch:not-found');
  });

  it('shows the title and the first episode', async () => {
    await openWatch();
    expect(label()).toBe('Tập 1_BD_Full');
    expect(screen.getByTestId('player:title').textContent).toBe(
      'Tonikaku Kawaii [BD]',
    );
  });

  describe('the episodes panel', () => {
    it('lists the season with the playing episode current and expanded', async () => {
      await openWatch();
      expect(
        panel().querySelectorAll('[data-testid^="episode:"][data-current]'),
      ).toHaveLength(EPISODES.length);
      expect(row(1).getAttribute('data-current')).toBe('true');
      expect(row(1).getAttribute('data-expanded')).toBe('true');
      expect(screen.getByTestId('episode:now-playing').textContent).toContain(
        'Đang phát',
      );
      expect(
        screen.getByTestId('episode:now-playing').querySelector('img'),
      ).not.toBeNull();
    });

    it('expands a clicked episode, collapses the playing one, and does not navigate', async () => {
      const app = await openWatch();
      await userEvent.click(within(row(3)).getByTestId('episode:3:toggle'));
      expect(row(3).getAttribute('data-expanded')).toBe('true');
      expect(row(1).getAttribute('data-expanded')).toBe('false');
      expect(pathname(app)).not.toContain(EPISODES[2]);
    });

    it('plays the picked episode', async () => {
      const app = await openWatch();
      await userEvent.click(within(row(3)).getByTestId('episode:3:toggle'));
      await userEvent.click(within(row(3)).getByTestId('episode:3:play'));
      await waitFor(() =>
        expect(pathname(app)).toBe(`/watch/${SLUG}/${EPISODES[2]}`),
      );
      await waitFor(() => expect(label()).toBe('Tập 3'));
      expect(screen.getByTestId('player:title').textContent).toBe(
        'Tonikaku Kawaii [BD]',
      );
      expect(row(3).getAttribute('data-current')).toBe('true');
    });

    it('opens the seasons view from the back button and opens another season', async () => {
      const app = await openWatch();
      await userEvent.click(screen.getByTestId('player:seasons-back'));
      const seasons = await screen.findByTestId('player:seasons-panel');
      expect(
        screen.getByTestId(`season:${SLUG}`).getAttribute('data-current'),
      ).toBe('true');
      expect(seasons.textContent).toContain('Tonikaku Kawaii [BD]');

      await userEvent.click(screen.getByTestId(`season:${SEASON_2}`));
      await waitFor(() =>
        expect(
          panel().querySelectorAll('[data-testid^="episode:"][data-current]'),
        ).toHaveLength(3),
      );
      expect(panel().textContent).toContain('Phần 2');
      expect(row(1).getAttribute('data-current')).toBe('false');

      await userEvent.click(within(row(2)).getByTestId('episode:2:toggle'));
      await userEvent.click(within(row(2)).getByTestId('episode:2:play'));
      await waitFor(() =>
        expect(pathname(app)).toBe(`/watch/${SEASON_2}/91102`),
      );
      await waitFor(() => expect(label()).toBe('Tập 2'));
    });

    it('has no way back to a seasons list for a title with one season', async () => {
      await openWatch(`/watch/${SLUG}`, [
        async (url) => {
          if (!url.endsWith(`/phim/${SLUG}/xem-phim.html`)) return undefined;
          const real = await (
            await import('../../test/fixture-fetch.ts')
          ).fixtureFetch()(url);
          const body = (await real.text()).replace(
            /<div class="MovieInfo[^]*?<\/div><\/div>/,
            '',
          );
          return new Response(body);
        },
      ]);
      expect(panel()).toBeTruthy();
      expect(screen.queryByTestId('player:seasons-back')).toBeNull();
    });
  });

  describe('next episode', () => {
    it('advances, and is disabled on the last one', async () => {
      const app = await openWatch(`/watch/${SLUG}/${EPISODES[3]}`);
      await userEvent.click(screen.getByTestId('player:next'));
      await waitFor(() =>
        expect(pathname(app)).toMatch(new RegExp(`/${EPISODES[4]}$`)),
      );
      await waitFor(() => expect(label()).toBe('Tập 5'));
      expect(screen.getByTestId('player:next')).toHaveProperty(
        'disabled',
        true,
      );
    });

    it('shows the next episode card, and clicking it plays that episode', async () => {
      await openWatch();
      const card = screen.getByTestId('player:next-card');
      expect(card.textContent).toContain('Tập tiếp theo');
      expect(card.textContent).toContain('Tập 2');
      await userEvent.click(within(card).getByRole('button'));
      await waitFor(() => expect(label()).toBe('Tập 2'));
    });
  });

  describe('back', () => {
    it('returns home when there is no page before the player', async () => {
      const app = await openWatch();
      await userEvent.click(screen.getByTestId('player:next'));
      await waitFor(() => expect(label()).toBe('Tập 2'));
      await userEvent.click(screen.getByTestId('player:back'));
      await waitFor(() => expect(pathname(app)).toBe('/'));
      await waitFor(() => expect(screen.queryByTestId('player')).toBeNull());
    });
  });

  describe('episode art', () => {
    withFakeClock();

    const ready = (stills?: Record<string, string>): ArtEntry => ({
      status: 'ready',
      backdropPath: '/backdrop.jpg',
      backdropLang: 'vi',
      posterPath: null,
      ...(stills ? { stills } : {}),
    });
    const img = (n: number) =>
      row(n).querySelector(`[data-testid="episode:${n}:play"] img`);

    it('uses a TMDB still where one exists and the backdrop for the others', async () => {
      const bodies = stubArt(() => ({ [SLUG]: ready({ '3': '/e3.jpg' }) }));
      await openWatch();
      await userEvent.click(within(row(3)).getByTestId('episode:3:toggle'));
      await waitFor(() =>
        expect(img(3)!.getAttribute('src')).toBe(`${TMDB}/w300/e3.jpg`),
      );
      await userEvent.click(within(row(2)).getByTestId('episode:2:toggle'));
      await waitFor(() =>
        expect(img(2)!.getAttribute('src')).toBe(
          `${TMDB}/original/backdrop.jpg`,
        ),
      );
      expect(bodies[0]).toEqual({
        titles: [
          {
            slug: SLUG,
            name: 'Tonikaku Kawaii',
            otherNames: ['TONIKAWA: Over the Moon For You'],
          },
        ],
        episodes: true,
      });
    });

    it('swaps in the stills once a pending title is ready', async () => {
      const bodies = stubArt((_, call) => ({
        [SLUG]: call === 1 ? { status: 'pending' } : ready({ '3': '/e3.jpg' }),
      }));
      await openWatch();
      await userEvent.click(within(row(3)).getByTestId('episode:3:toggle'));
      await advance(3_000);
      await waitFor(() =>
        expect(img(3)!.getAttribute('src')).toBe(`${TMDB}/w300/e3.jpg`),
      );
      expect(bodies).toHaveLength(2);
    });
  });
});
