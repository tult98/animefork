// @vitest-environment jsdom
import fetchMock from '@fetch-mock/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MOCK_WATCH_SLUG,
  mockWatchHtml,
} from '../../../lib/titles/__mockData__/index.ts';
import { act, render, screen, within } from '../../../test/test-utils.tsx';
import { WatchScreen } from '../watch-screen.tsx';

const user = {
  id: 'u1',
  email: 'mai@example.com',
  emailVerified: true,
  createdAt: '2026-01-01T00:00:00Z',
};

// The watch page has 3 episodes: "Tập 1" (72839), "Tập 2" (73010) and "Tập 3" (73386).
beforeEach(() => {
  vi.stubEnv('VITE_API_URL', 'https://api.test');
  fetchMock
    .get('path:/phim/tonikaku-kawaii-a3860/xem-phim.html', mockWatchHtml)
    .post('path:/v1/art/lookup', { art: {} })
    .get('begin:https://api.test/v1/skip-times/', { segments: [] });
});
afterEach(() => vi.useRealTimers());

// jsdom has no media engine, so the video reports the clock the test sets and the test fires its events.
function giveClock(video: HTMLVideoElement, duration: number) {
  const media = { time: 0, duration };
  Object.defineProperties(video, {
    duration: { get: () => media.duration, configurable: true },
    currentTime: {
      get: () => media.time,
      set: (value: number) => (media.time = value),
      configurable: true,
    },
  });
  return media;
}

const fire = (target: EventTarget, type: string) =>
  act(() => void target.dispatchEvent(new Event(type)));

describe('saving watch progress while watching', () => {
  it('saves what the continue-watching shelf needs when the viewer pauses, and marks the episode in progress without reading the rows again', async () => {
    fetchMock
      .get('path:/v1/auth/me', { user })
      .get('path:/v1/watch-progress/tonikaku-kawaii-a3860', { items: [] })
      .put('path:/v1/watch-progress', {
        episodeId: '72839',
        positionS: 61.5,
        durationS: 1400,
        completed: false,
      });
    render(<WatchScreen slug={MOCK_WATCH_SLUG} />, { path: '/' });
    await expect(fetchMock).toBeFetched(
      'path:/v1/watch-progress/tonikaku-kawaii-a3860',
    );
    const video = screen.getByTestId<HTMLVideoElement>('player:video');
    const media = giveClock(video, 1400);
    expect(screen.getByTestId('episode:1')).toHaveAttribute(
      'data-progress',
      'unwatched',
    );

    fire(video, 'canplay');
    fire(video, 'playing');
    media.time = 61.5;
    fire(video, 'timeupdate');
    fire(video, 'pause');

    await expect(fetchMock).toBeFetched('path:/v1/watch-progress', {
      method: 'put',
      body: {
        slug: 'tonikaku-kawaii-a3860',
        seasonSlug: 'tonikaku-kawaii-a3860',
        episodeId: '72839',
        positionS: 61.5,
        durationS: 1400,
        titleName: 'Tonikaku Kawaii [BD]',
        image: '/poster.svg',
        episodeLabel: 'Tập 1',
      },
    });
    expect(screen.getByTestId('episode:1')).toHaveAttribute(
      'data-progress',
      'inProgress',
    );
    expect(fetchMock).toHaveFetchedTimes(
      1,
      'path:/v1/watch-progress/tonikaku-kawaii-a3860',
    );
  });

  it('saves every 15 seconds of playing time and not before', async () => {
    fetchMock
      .get('path:/v1/auth/me', { user })
      .get('path:/v1/watch-progress/tonikaku-kawaii-a3860', { items: [] })
      .put('path:/v1/watch-progress', {
        episodeId: '72839',
        positionS: 20,
        durationS: 1400,
        completed: false,
      });
    render(<WatchScreen slug={MOCK_WATCH_SLUG} />, { path: '/' });
    await expect(fetchMock).toBeFetched(
      'path:/v1/watch-progress/tonikaku-kawaii-a3860',
    );
    const video = screen.getByTestId<HTMLVideoElement>('player:video');
    const media = giveClock(video, 1400);
    fire(video, 'canplay');

    // Only the timer is faked: the app's own waits keep running on real time.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    fire(video, 'playing');
    media.time = 20;
    fire(video, 'timeupdate');
    act(() => void vi.advanceTimersByTime(14_000));
    expect(fetchMock).not.toHaveFetched('path:/v1/watch-progress', {
      method: 'put',
    });

    act(() => void vi.advanceTimersByTime(1_000));
    vi.useRealTimers();
    await expect(fetchMock).toBeFetched('path:/v1/watch-progress', {
      method: 'put',
      body: {
        slug: 'tonikaku-kawaii-a3860',
        seasonSlug: 'tonikaku-kawaii-a3860',
        episodeId: '72839',
        positionS: 20,
        durationS: 1400,
        titleName: 'Tonikaku Kawaii [BD]',
        image: '/poster.svg',
        episodeLabel: 'Tập 1',
      },
    });
  });

  it('does not save the 0 of a video that has not started yet', async () => {
    fetchMock
      .get('path:/v1/auth/me', { user })
      .get('path:/v1/watch-progress/tonikaku-kawaii-a3860', { items: [] });
    render(<WatchScreen slug={MOCK_WATCH_SLUG} />, { path: '/' });
    await expect(fetchMock).toBeFetched(
      'path:/v1/watch-progress/tonikaku-kawaii-a3860',
    );
    const video = screen.getByTestId<HTMLVideoElement>('player:video');
    giveClock(video, 1400);

    fire(video, 'playing');
    fire(video, 'pause');
    act(() => void window.dispatchEvent(new Event('pagehide')));

    expect(fetchMock).not.toHaveFetched('path:/v1/watch-progress', {
      method: 'put',
    });
  });

  it('keeps the episode list and playback working when a save fails, and saves again on the next pause', async () => {
    fetchMock
      .get('path:/v1/auth/me', { user })
      .get('path:/v1/watch-progress/tonikaku-kawaii-a3860', { items: [] })
      .put('path:/v1/watch-progress', 500, { repeat: 1 })
      .put('path:/v1/watch-progress', {
        episodeId: '72839',
        positionS: 90,
        durationS: 1400,
        completed: false,
      });
    render(<WatchScreen slug={MOCK_WATCH_SLUG} />, { path: '/' });
    await expect(fetchMock).toBeFetched(
      'path:/v1/watch-progress/tonikaku-kawaii-a3860',
    );
    const video = screen.getByTestId<HTMLVideoElement>('player:video');
    const media = giveClock(video, 1400);
    fire(video, 'canplay');

    media.time = 30;
    fire(video, 'timeupdate');
    fire(video, 'pause');
    await expect(fetchMock).toBeFetched('path:/v1/watch-progress', {
      method: 'put',
      body: {
        slug: 'tonikaku-kawaii-a3860',
        seasonSlug: 'tonikaku-kawaii-a3860',
        episodeId: '72839',
        positionS: 30,
        durationS: 1400,
        titleName: 'Tonikaku Kawaii [BD]',
        image: '/poster.svg',
        episodeLabel: 'Tập 1',
      },
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByTestId('episode:1')).toHaveAttribute(
      'data-progress',
      'unwatched',
    );

    media.time = 90;
    fire(video, 'timeupdate');
    fire(video, 'pause');
    await vi.waitFor(() =>
      expect(screen.getByTestId('episode:1')).toHaveAttribute(
        'data-progress',
        'inProgress',
      ),
    );
    expect(fetchMock).toHaveFetchedTimes(2, 'path:/v1/watch-progress', {
      method: 'put',
    });
  });

  it('stops saving and drops the watched marks when the session has ended', async () => {
    fetchMock
      .get('path:/v1/auth/me', { user }, { repeat: 1 })
      .get('path:/v1/auth/me', 401)
      .get('path:/v1/watch-progress/tonikaku-kawaii-a3860', {
        items: [
          {
            episodeId: '72839',
            positionS: 1390,
            durationS: 1400,
            completed: true,
          },
        ],
      })
      .put('path:/v1/watch-progress', 401);
    render(<WatchScreen slug={MOCK_WATCH_SLUG} episodeId="73010" />, {
      path: '/',
    });
    await expect(fetchMock).toBeFetched(
      'path:/v1/watch-progress/tonikaku-kawaii-a3860',
    );
    const video = screen.getByTestId<HTMLVideoElement>('player:video');
    const media = giveClock(video, 1400);
    fire(video, 'canplay');
    expect(screen.getByTestId('episode:1:watched')).toHaveTextContent('Đã xem');

    media.time = 40;
    fire(video, 'timeupdate');
    fire(video, 'pause');
    await expect(fetchMock).toBeFetched('path:/v1/watch-progress', {
      method: 'put',
    });
    await vi.waitFor(() =>
      expect(screen.queryByTestId('episode:1:watched')).not.toBeInTheDocument(),
    );
    expect(fetchMock).toHaveFetchedTimes(2, 'path:/v1/auth/me');

    media.time = 80;
    fire(video, 'timeupdate');
    fire(video, 'pause');
    expect(fetchMock).toHaveFetchedTimes(1, 'path:/v1/watch-progress', {
      method: 'put',
    });
  });

  it('reads and saves nothing for a signed-out viewer', async () => {
    fetchMock.get('path:/v1/auth/me', 401);
    render(<WatchScreen slug={MOCK_WATCH_SLUG} />, { path: '/' });
    const video = await screen.findByTestId<HTMLVideoElement>('player:video');
    const media = giveClock(video, 1400);

    fire(video, 'canplay');
    fire(video, 'playing');
    media.time = 20;
    fire(video, 'timeupdate');
    fire(video, 'pause');
    act(() => void window.dispatchEvent(new Event('pagehide')));

    expect(fetchMock).not.toHaveFetched(
      'begin:https://api.test/v1/watch-progress',
    );
  });
});

describe('resuming where the viewer left off', () => {
  it('opens the last watched episode and seeks 5 seconds before the saved position', async () => {
    fetchMock
      .get('path:/v1/auth/me', { user })
      .get('path:/v1/watch-progress/tonikaku-kawaii-a3860', {
        items: [
          {
            episodeId: '72839',
            positionS: 1390,
            durationS: 1400,
            completed: true,
          },
          {
            episodeId: '73386',
            positionS: 300,
            durationS: 1400,
            completed: false,
          },
        ],
      });
    render(<WatchScreen slug={MOCK_WATCH_SLUG} />, { path: '/' });
    await expect(fetchMock).toBeFetched(
      'path:/v1/watch-progress/tonikaku-kawaii-a3860',
    );
    const video = screen.getByTestId<HTMLVideoElement>('player:video');
    const media = giveClock(video, 1400);

    expect(screen.getByTestId('player:episode-label')).toHaveTextContent(
      'Tập 3',
    );
    expect(media.time).toBe(0);
    fire(video, 'canplay');
    expect(media.time).toBe(295);
  });

  it('offers the next episode from its start once the last one is completed', async () => {
    fetchMock
      .get('path:/v1/auth/me', { user })
      .get('path:/v1/watch-progress/tonikaku-kawaii-a3860', {
        items: [
          {
            episodeId: '73010',
            positionS: 1390,
            durationS: 1400,
            completed: true,
          },
        ],
      });
    render(<WatchScreen slug={MOCK_WATCH_SLUG} />, { path: '/' });
    await expect(fetchMock).toBeFetched(
      'path:/v1/watch-progress/tonikaku-kawaii-a3860',
    );
    const video = screen.getByTestId<HTMLVideoElement>('player:video');
    const media = giveClock(video, 1400);
    fire(video, 'canplay');

    expect(screen.getByTestId('player:episode-label')).toHaveTextContent(
      'Tập 3',
    );
    expect(media.time).toBe(0);
  });

  it('keeps the episode of the URL and only seeks to its saved position', async () => {
    fetchMock
      .get('path:/v1/auth/me', { user })
      .get('path:/v1/watch-progress/tonikaku-kawaii-a3860', {
        items: [
          {
            episodeId: '73010',
            positionS: 200,
            durationS: 1400,
            completed: false,
          },
          {
            episodeId: '73386',
            positionS: 900,
            durationS: 1400,
            completed: false,
          },
        ],
      });
    render(<WatchScreen slug={MOCK_WATCH_SLUG} episodeId="73010" />, {
      path: '/',
    });
    await expect(fetchMock).toBeFetched(
      'path:/v1/watch-progress/tonikaku-kawaii-a3860',
    );
    const video = screen.getByTestId<HTMLVideoElement>('player:video');
    const media = giveClock(video, 1400);
    fire(video, 'canplay');

    expect(screen.getByTestId('player:episode-label')).toHaveTextContent(
      'Tập 2',
    );
    expect(media.time).toBe(195);
  });

  it('plays from the first episode when the saved progress cannot be read', async () => {
    fetchMock
      .get('path:/v1/auth/me', { user })
      .get('path:/v1/watch-progress/tonikaku-kawaii-a3860', 500);
    render(<WatchScreen slug={MOCK_WATCH_SLUG} />, { path: '/' });
    await expect(fetchMock).toBeFetched(
      'path:/v1/watch-progress/tonikaku-kawaii-a3860',
    );

    expect(screen.getByTestId('player:episode-label')).toHaveTextContent(
      'Tập 1',
    );
  });

  it('tells watched, in progress and unwatched episodes apart in the episode list', async () => {
    fetchMock
      .get('path:/v1/auth/me', { user })
      .get('path:/v1/watch-progress/tonikaku-kawaii-a3860', {
        items: [
          {
            episodeId: '72839',
            positionS: 1390,
            durationS: 1400,
            completed: true,
          },
          {
            episodeId: '73010',
            positionS: 350,
            durationS: 1400,
            completed: false,
          },
        ],
      });
    render(<WatchScreen slug={MOCK_WATCH_SLUG} episodeId="73386" />, {
      path: '/',
    });
    await expect(fetchMock).toBeFetched(
      'path:/v1/watch-progress/tonikaku-kawaii-a3860',
    );

    expect(screen.getByTestId('episode:1')).toHaveAttribute(
      'data-progress',
      'watched',
    );
    expect(screen.getByTestId('episode:1:watched')).toHaveTextContent('Đã xem');
    const episode2 = screen.getByTestId('episode:2');
    expect(episode2).toHaveAttribute('data-progress', 'inProgress');
    expect(episode2).toHaveTextContent('Đang xem dở');
    expect(within(episode2).getByTestId('episode:progress')).toHaveStyle({
      width: '25%',
    });
    expect(screen.getByTestId('episode:3')).toHaveAttribute(
      'data-progress',
      'unwatched',
    );
  });
});
