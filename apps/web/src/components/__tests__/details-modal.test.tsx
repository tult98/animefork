// @vitest-environment jsdom
import fetchMock from '@fetch-mock/vitest';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockWatchHtml } from '../../lib/titles/__mockData__/index.ts';
import { render, screen, waitFor, within } from '../../test/test-utils.tsx';
import { homeHtml, newEpisodesHtml, seasonHtml } from '../__mockData__/home.ts';
import { Home } from '../home.tsx';

beforeEach(() => {
  fetchMock
    .get('path:/', homeHtml)
    .get('path:/danh-sach/all/all/all/all/all/all/jp/', newEpisodesHtml)
    .get('path:/danh-sach/all/all/autumn/2026/all/all/jp/', seasonHtml)
    .get('path:/phim/fresh-1-a1/xem-phim.html', mockWatchHtml);
});

const cover = (path: string) =>
  screen.getByTestId(`card:${path}`).querySelector('[data-cover]')!;

describe('the details modal', () => {
  it('opens from a card instead of navigating, with the title, a play link and its episodes', async () => {
    const { router } = render(<Home />, { path: '/' });
    await expect(fetchMock).toBeFetched(
      'path:/danh-sach/all/all/autumn/2026/all/all/jp/',
    );

    await userEvent.click(cover('/phim/fresh-1-a1/'));
    const modal = await screen.findByTestId('details');
    await expect(fetchMock).toBeFetched('path:/phim/fresh-1-a1/xem-phim.html');

    expect(within(modal).getByRole('heading', { level: 2 })).toHaveTextContent(
      'fresh 1',
    );
    expect(within(modal).getByTestId('details:play')).toHaveAttribute(
      'href',
      '/watch/fresh-1-a1',
    );
    expect(within(modal).getByTestId('details:episode:72839')).toBeVisible();
    expect(within(modal).getByTestId('details:episode:73386')).toBeVisible();
    expect(router.state.location.pathname).toBe('/');
  });

  it('names the episodes and gives their synopses from the episode info, the Vietnamese text first', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.test');
    fetchMock
      .post('path:/v1/art/lookup', { art: {} })
      .get('path:/v1/episodes/fresh-1-a1', {
        status: 'ready',
        episodes: [
          {
            number: 1,
            title: 'Fly Me',
            titleVi: 'Bay cùng tôi',
            aired: null,
            synopsis: 'A boy wakes.',
            synopsisVi: 'Một cậu bé thức dậy.',
          },
          {
            number: 2,
            title: 'Second',
            titleVi: null,
            aired: '2018-10-13',
            synopsis: 'He opens it.',
            synopsisVi: null,
          },
        ],
      });
    render(<Home />, { path: '/' });
    await expect(fetchMock).toBeFetched(
      'path:/danh-sach/all/all/autumn/2026/all/all/jp/',
    );

    await userEvent.click(cover('/phim/fresh-1-a1/'));
    const modal = await screen.findByTestId('details');
    await expect(fetchMock).toBeFetched('path:/v1/episodes/fresh-1-a1');

    expect(
      within(modal).getByTestId('details:episode:72839'),
    ).toHaveTextContent('Bay cùng tôi');
    expect(
      within(modal).getByTestId('details:episode:72839:synopsis'),
    ).toHaveTextContent('Một cậu bé thức dậy.');
    expect(
      within(modal).getByTestId('details:episode:73010:synopsis'),
    ).toHaveTextContent('He opens it.');
    expect(
      within(modal).getByTestId('details:episode:73010'),
    ).toHaveTextContent('Second');
    expect(
      within(modal).getByTestId('details:episode:73386'),
    ).toHaveTextContent('Tập 3');
    expect(
      within(modal).queryByTestId('details:episode:73386:synopsis'),
    ).not.toBeInTheDocument();
  });

  it('opens from the info button of a hero slide', async () => {
    fetchMock.get('path:/phim/hero-1-a1/xem-phim.html', mockWatchHtml);
    render(<Home />, { path: '/' });
    await expect(fetchMock).toBeFetched(
      'path:/danh-sach/all/all/autumn/2026/all/all/jp/',
    );

    await userEvent.click(
      within(screen.getByTestId('hero:slide:0')).getByTestId('hero:info'),
    );

    expect(await screen.findByTestId('details')).toHaveTextContent('Hero 1');
  });

  it('closes from its close button, and from the backdrop but not from its content', async () => {
    render(<Home />, { path: '/' });
    await expect(fetchMock).toBeFetched(
      'path:/danh-sach/all/all/autumn/2026/all/all/jp/',
    );
    await userEvent.click(cover('/phim/fresh-1-a1/'));
    const modal = await screen.findByTestId('details');
    await expect(fetchMock).toBeFetched('path:/phim/fresh-1-a1/xem-phim.html');

    await userEvent.click(within(modal).getByTestId('details:episodes'));
    expect(modal).toBeVisible();
    await userEvent.click(modal);
    await waitFor(() =>
      expect(screen.queryByTestId('details')).not.toBeInTheDocument(),
    );

    await userEvent.click(cover('/phim/fresh-1-a1/'));
    await userEvent.click(await screen.findByTestId('details:close'));
    await waitFor(() =>
      expect(screen.queryByTestId('details')).not.toBeInTheDocument(),
    );
  });

  it('switches season and plays an episode of it', async () => {
    fetchMock.get(
      'path:/phim/tonikaku-kawaii-sns-a4229/xem-phim.html',
      mockWatchHtml.replace('data-id="72839"', 'data-id="90001"'),
    );
    const { router } = render(<Home />, { path: '/' });
    await expect(fetchMock).toBeFetched(
      'path:/danh-sach/all/all/autumn/2026/all/all/jp/',
    );
    await userEvent.click(cover('/phim/fresh-1-a1/'));
    const modal = await screen.findByTestId('details');
    await expect(fetchMock).toBeFetched('path:/phim/fresh-1-a1/xem-phim.html');

    await userEvent.click(within(modal).getByTestId('details:season-button'));
    await userEvent.click(
      within(modal).getByTestId('details:season:tonikaku-kawaii-sns-a4229'),
    );
    await userEvent.click(
      await within(modal).findByTestId('details:episode:90001'),
    );

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        '/watch/tonikaku-kawaii-sns-a4229/90001',
      ),
    );
    expect(screen.queryByTestId('details')).not.toBeInTheDocument();
  });

  it('opens for an upcoming card without a play link or episodes, and its popover has no play button', async () => {
    const { router } = render(<Home />, { path: '/' });
    await expect(fetchMock).toBeFetched(
      'path:/danh-sach/all/all/autumn/2026/all/all/jp/',
    );

    await userEvent.hover(screen.getByTestId('card:/phim/soon-a1/'));
    const preview = await screen.findByTestId('card:/phim/soon-a1/:preview');
    expect(
      within(preview).queryByRole('link', { name: /^Phát / }),
    ).not.toBeInTheDocument();
    expect(
      within(preview).getByTestId('card:/phim/soon-a1/:details:tooltip'),
    ).toHaveTextContent('Thông tin');

    await userEvent.click(cover('/phim/soon-a1/'));
    const modal = await screen.findByTestId('details');
    expect(within(modal).getByRole('heading', { level: 2 })).toHaveTextContent(
      'soon',
    );
    expect(within(modal).queryByTestId('details:play')).not.toBeInTheDocument();
    expect(
      within(modal).queryByTestId('details:episodes'),
    ).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
    expect(fetchMock).not.toHaveFetched('path:/phim/soon-a1/xem-phim.html');
  });
});
