// @vitest-environment jsdom
import fetchMock from '@fetch-mock/vitest';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MOCK_WATCH_SLUG,
  mockWatchHtml,
} from '../../../lib/titles/__mockData__/index.ts';
import { intersectAll, render, screen } from '../../../test/test-utils.tsx';
import { WatchScreen } from '../watch-screen.tsx';

// The watch page has 3 episodes: "Tập 1" (72839), "Tập 2" (73010) and "Tập 3" (73386).
beforeEach(() => {
  vi.stubEnv('VITE_API_URL', 'https://api.test');
  fetchMock
    .get('path:/v1/auth/me', 401)
    .get('path:/phim/tonikaku-kawaii-a3860/xem-phim.html', mockWatchHtml)
    .post('path:/v1/art/lookup', { art: {} })
    .get('begin:https://api.test/v1/skip-times/', { segments: [] });
});

describe('the watch screen', () => {
  it('plays the first episode of the title and lists every episode with the playing one marked', async () => {
    render(<WatchScreen slug={MOCK_WATCH_SLUG} />, { path: '/' });
    await expect(fetchMock).toBeFetched(
      'path:/phim/tonikaku-kawaii-a3860/xem-phim.html',
    );

    expect(await screen.findByTestId('player:title')).toHaveTextContent(
      'Tonikaku Kawaii [BD]',
    );
    expect(screen.getByTestId('player:episode-label')).toHaveTextContent(
      'Tập 1',
    );
    expect(screen.getByTestId('episode:1')).toHaveAttribute(
      'data-current',
      'true',
    );
    expect(screen.getByTestId('episode:1')).toHaveTextContent('Đang phát');
    expect(screen.getByTestId('episode:now-playing')).toBeInTheDocument();
    expect(screen.getByTestId('episode:2')).toHaveAttribute(
      'data-current',
      'false',
    );
    expect(screen.getByTestId('episode:3')).toHaveAttribute(
      'data-current',
      'false',
    );
    expect(screen.getByTestId('player:next-card')).toHaveTextContent('Tập 2');
  });

  it('opens the episode that is clicked in the list', async () => {
    const { router } = render(<WatchScreen slug={MOCK_WATCH_SLUG} />, {
      path: '/',
    });
    await screen.findByTestId('player');

    await userEvent.click(screen.getByTestId('episode:3'));
    expect(router.state.location.pathname).toBe(
      '/watch/tonikaku-kawaii-a3860/73386',
    );
  });

  it('goes to the seasons of the title and back to its episodes', async () => {
    render(<WatchScreen slug={MOCK_WATCH_SLUG} />, { path: '/' });

    await userEvent.click(await screen.findByTestId('player:seasons'));
    expect(screen.getByTestId('player:seasons-panel')).toHaveTextContent(
      'Chọn phần',
    );
    expect(screen.queryByTestId('episode:1')).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId('player:seasons-back'));
    expect(screen.getByTestId('episode:1')).toBeInTheDocument();
  });

  it('says the episode cannot be played when it is not on the title', async () => {
    render(<WatchScreen slug={MOCK_WATCH_SLUG} episodeId="1" />, {
      path: '/',
    });
    await expect(fetchMock).toBeFetched(
      'path:/phim/tonikaku-kawaii-a3860/xem-phim.html',
    );

    expect(await screen.findByTestId('watch:not-found')).toHaveTextContent(
      'Không phát được tập này',
    );
    expect(screen.queryByTestId('player')).not.toBeInTheDocument();
  });

  it('shows the picked episode of the URL as playing', async () => {
    render(<WatchScreen slug={MOCK_WATCH_SLUG} episodeId="73010" />, {
      path: '/',
    });

    expect(await screen.findByTestId('player:episode-label')).toHaveTextContent(
      'Tập 2',
    );
    expect(screen.getByTestId('episode:2')).toHaveAttribute(
      'data-current',
      'true',
    );
    expect(screen.getByTestId('player:next-card')).toHaveTextContent('Tập 3');
    await expect(fetchMock).toBeFetched(
      'https://api.test/v1/skip-times/tonikaku-kawaii-a3860/2',
    );
  });

  it('names the playing episode past the 100th from its page of episode info, and lists 50 episodes and more on scroll', async () => {
    const episodes = Array.from(
      { length: 150 },
      (_, i) =>
        `<li class="episode"><a data-id="${i + 1}" title="Tập ${i + 1}" data-play="api" data-hash="h${i + 1}">${i + 1}</a></li>`,
    ).join('');
    fetchMock
      .get(
        'path:/phim/long-show-a1/xem-phim.html',
        mockWatchHtml.replace(
          /<ul class="list-episode">.*?<\/ul>/s,
          `<ul class="list-episode">${episodes}</ul>`,
        ),
      )
      .get(
        'path:/v1/episodes/long-show-a1',
        {
          status: 'ready',
          episodes: [{ number: 2, title: 'Two', titleVi: null, aired: null }],
        },
        { query: { from: '1', limit: '100' } },
      )
      .get(
        'path:/v1/episodes/long-show-a1',
        {
          status: 'ready',
          episodes: [
            { number: 120, title: 'The Last', titleVi: null, aired: null },
          ],
        },
        { query: { from: '101', limit: '100' } },
      );
    render(<WatchScreen slug="long-show-a1" episodeId="120" />, {
      path: '/',
    });
    await expect(fetchMock).toBeFetched('path:/v1/episodes/long-show-a1', {
      query: { from: '101' },
    });

    expect(await screen.findByTestId('player:episode-name')).toHaveTextContent(
      'The Last',
    );
    expect(screen.getByTestId('episode:50')).toBeInTheDocument();
    expect(screen.queryByTestId('episode:51')).not.toBeInTheDocument();
    expect(screen.getByTestId('episode:2')).toHaveTextContent('Two');

    intersectAll();
    expect(screen.getByTestId('episode:100')).toBeInTheDocument();
    expect(screen.queryByTestId('episode:101')).not.toBeInTheDocument();
  });
});
