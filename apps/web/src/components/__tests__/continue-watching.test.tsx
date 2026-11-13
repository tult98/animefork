// @vitest-environment jsdom
import fetchMock from '@fetch-mock/vitest';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { homeHtml, newEpisodesHtml, seasonHtml } from '../__mockData__/home.ts';
import { render, screen, within } from '../../test/test-utils.tsx';
import { Home } from '../home.tsx';

const user = { id: 'u1', email: 'mai@example.com' };

// A history row as the API sends it. Only what a test changes differs.
const row = {
  slug: 'alpha',
  episodeId: '7',
  episodeLabel: 'Tập 7',
  titleName: 'Phim alpha',
  image: 'https://img.test/alpha.jpg',
  seasonSlug: null,
  positionS: 720,
  durationS: 1440,
  completed: false,
  updatedAt: '2026-11-10T10:00:00.000Z',
};

beforeEach(() => {
  vi.stubEnv('VITE_API_URL', 'https://api.test');
  // The art lookup is not under test here, so it answers with nothing.
  fetchMock
    .get('path:/', homeHtml)
    .get('path:/danh-sach/all/all/all/all/all/all/jp/', newEpisodesHtml)
    .get('path:/danh-sach/all/all/autumn/2026/all/all/jp/', seasonHtml)
    .post('path:/v1/art/lookup', 500);
});

describe('the continue watching row', () => {
  it('sits right after the hero for a signed-in viewer and takes its titles out of the other shelves', async () => {
    fetchMock.get('path:/v1/auth/me', { user }).get('path:/v1/watch-progress', {
      items: [row, { ...row, slug: 'hero-1-a1', titleName: 'Phim hero' }],
    });
    render(<Home />, { path: '/' });
    await expect(fetchMock).toBeFetched('path:/v1/watch-progress');

    const shelf = screen.getByTestId('shelf:continue-watching');
    expect(shelf).toHaveAccessibleName('Tiếp tục xem');
    expect(screen.getByTestId('hero').nextElementSibling).toBe(shelf);
    expect(within(shelf).getByTestId('card:continue:alpha')).toBeVisible();
    expect(within(shelf).getByTestId('card:continue:hero-1-a1')).toBeVisible();
    const hero = screen.getByTestId('hero');
    expect(hero).not.toHaveTextContent('Hero 1');
    expect(hero).toHaveTextContent('Hero 2');
  });

  it('shows one card for a series watched in two seasons, the newest one', async () => {
    fetchMock.get('path:/v1/auth/me', { user }).get('path:/v1/watch-progress', {
      items: [
        { ...row, slug: 'alpha-s2', episodeId: '3' },
        { ...row, slug: 'alpha', episodeId: '7' },
      ],
    });
    render(<Home />, { path: '/' });

    const shelf = await screen.findByTestId('shelf:continue-watching');
    expect(within(shelf).getByTestId('card:continue:alpha-s2')).toBeVisible();
    expect(
      within(shelf).queryByTestId('card:continue:alpha'),
    ).not.toBeInTheDocument();
  });

  it('shows a skeleton while a signed-in viewer waits', async () => {
    fetchMock
      .get('path:/v1/auth/me', { user })
      .get('path:/v1/watch-progress', { items: [row] }, { delay: 200 });
    render(<Home />, { path: '/' });

    expect(
      await screen.findByTestId('shelf:continue-watching:loading'),
    ).toBeVisible();
    expect(await screen.findByTestId('card:continue:alpha')).toBeVisible();
    expect(
      screen.queryByTestId('shelf:continue-watching:loading'),
    ).not.toBeInTheDocument();
  });

  it('shows nothing and asks for no history when signed out', async () => {
    fetchMock.get('path:/v1/auth/me', 401);
    render(<Home />, { path: '/' });
    await expect(fetchMock).toBeFetched(
      'path:/danh-sach/all/all/autumn/2026/all/all/jp/',
    );
    await expect(fetchMock).toBeFetched('path:/v1/auth/me');

    expect(
      screen.queryByTestId('shelf:continue-watching'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('shelf:continue-watching:loading'),
    ).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveFetched('path:/v1/watch-progress');
  });

  it.each([
    ['has no history', { items: [] }],
    ['fails', 500],
  ])('drops only the row when the viewer %s', async (_, answer) => {
    fetchMock
      .get('path:/v1/auth/me', { user })
      .get('path:/v1/watch-progress', answer);
    render(<Home />, { path: '/' });
    await expect(fetchMock).toBeFetched('path:/v1/watch-progress');
    await expect(fetchMock).toBeFetched(
      'path:/danh-sach/all/all/autumn/2026/all/all/jp/',
    );

    expect(
      screen.queryByTestId('shelf:continue-watching'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('shelf:continue-watching:loading'),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('error-screen')).not.toBeInTheDocument();
    expect(screen.getByTestId('shelf:new-episodes')).toBeVisible();
  });

  it('links an unfinished card to its episode with a progress bar, and a finished one to the title', async () => {
    fetchMock.get('path:/v1/auth/me', { user }).get('path:/v1/watch-progress', {
      items: [
        { ...row, positionS: 360 },
        { ...row, slug: 'beta', titleName: 'Phim beta', completed: true },
      ],
    });
    render(<Home />, { path: '/' });
    await expect(fetchMock).toBeFetched('path:/v1/watch-progress');

    const unfinished = screen.getByTestId('card:continue:alpha');
    expect(within(unfinished).getByRole('link')).toHaveAttribute(
      'href',
      '/watch/alpha/7',
    );
    expect(within(unfinished).getByRole('link')).toHaveAccessibleName(
      'Phim alpha, Tập 7, 6 / 24 phút',
    );
    expect(within(unfinished).getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '25',
    );
    expect(within(unfinished).getByRole('progressbar')).toHaveAttribute(
      'aria-valuetext',
      '6 / 24 phút',
    );

    const finished = screen.getByTestId('card:continue:beta');
    expect(within(finished).getByRole('link')).toHaveAttribute(
      'href',
      '/watch/beta',
    );
    expect(within(finished).getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '100',
    );
    expect(within(finished).getByRole('progressbar')).toHaveAttribute(
      'aria-valuetext',
      'Đã xem xong',
    );
  });

  it('opens a popover on hover with the episode, the time and a play link', async () => {
    fetchMock
      .get('path:/v1/auth/me', { user })
      .get('path:/v1/watch-progress', { items: [row] });
    render(<Home />, { path: '/' });
    await expect(fetchMock).toBeFetched('path:/v1/watch-progress');

    await userEvent.hover(screen.getByTestId('card:continue:alpha'));
    const preview = await screen.findByTestId('card:continue:alpha:preview');
    expect(within(preview).getByRole('heading')).toHaveTextContent(
      'Phim alpha',
    );
    expect(preview).toHaveTextContent('Tập 7');
    expect(preview).toHaveTextContent('12 / 24 phút');
    expect(
      within(preview).getByRole('link', { name: 'Phát Phim alpha' }),
    ).toHaveAttribute('href', '/watch/alpha/7');
  });

  it('opens the details modal from the popover', async () => {
    fetchMock
      .get('path:/v1/auth/me', { user })
      .get('path:/v1/watch-progress', { items: [row] })
      .get('path:/phim/alpha/xem-phim.html', 404);
    render(<Home />, { path: '/' });
    await expect(fetchMock).toBeFetched('path:/v1/watch-progress');

    await userEvent.hover(screen.getByTestId('card:continue:alpha'));
    await userEvent.click(
      await screen.findByTestId('card:continue:alpha:details'),
    );

    expect(await screen.findByTestId('details')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Phim alpha' })).toBeVisible();
  });
});
