// @vitest-environment jsdom
import fetchMock from '@fetch-mock/vitest';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MOCK_WATCH_SLUG,
  mockWatchHtml,
} from '../../../lib/titles/__mockData__/index.ts';
import { render, screen, within } from '../../../test/test-utils.tsx';
import { WatchScreen } from '../watch-screen.tsx';

// The watch page has 3 episodes: "Tập 1_BD_Full" (72839), "Tập 2" (73010) and "Tập 3" (73386).
beforeEach(() => {
  vi.stubEnv('VITE_API_URL', 'https://api.test');
  fetchMock
    .get('path:/v1/auth/me', 401)
    .get('path:/phim/tonikaku-kawaii-a3860/xem-phim.html', mockWatchHtml)
    .post('path:/v1/art/lookup', { art: {} })
    .get('begin:https://api.test/v1/skip-times/', { segments: [] });
});

describe('the watch screen', () => {
  it('plays the first episode of the title and lists every episode with the playing one expanded', async () => {
    render(<WatchScreen slug={MOCK_WATCH_SLUG} />, { path: '/' });
    await expect(fetchMock).toBeFetched(
      'path:/phim/tonikaku-kawaii-a3860/xem-phim.html',
    );

    expect(await screen.findByTestId('player:title')).toHaveTextContent(
      'Tonikaku Kawaii [BD]',
    );
    expect(screen.getByTestId('player:episode-label')).toHaveTextContent(
      'Tập 1_BD_Full',
    );
    expect(screen.getByTestId('episode:1')).toHaveAttribute(
      'data-current',
      'true',
    );
    expect(screen.getByTestId('episode:1')).toHaveAttribute(
      'data-expanded',
      'true',
    );
    expect(screen.getByTestId('episode:now-playing')).toHaveTextContent(
      'Đang phát',
    );
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

  it('expands a clicked episode without leaving the playing one, and opens the episode when its play button is pressed', async () => {
    const { router } = render(<WatchScreen slug={MOCK_WATCH_SLUG} />, {
      path: '/',
    });
    await screen.findByTestId('player');

    const episode3 = screen.getByTestId('episode:3');
    await userEvent.click(within(episode3).getByTestId('episode:3:toggle'));
    expect(episode3).toHaveAttribute('data-expanded', 'true');
    expect(screen.getByTestId('episode:1')).toHaveAttribute(
      'data-expanded',
      'false',
    );
    expect(router.state.location.pathname).toBe('/');

    await userEvent.click(within(episode3).getByTestId('episode:3:play'));
    expect(router.state.location.pathname).toBe(
      '/watch/tonikaku-kawaii-a3860/73386',
    );
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
});
