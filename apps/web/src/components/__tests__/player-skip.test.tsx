// @vitest-environment jsdom
import fetchMock from '@fetch-mock/vitest';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '../../test/test-utils.tsx';
import { Player } from '../player/player.tsx';

beforeEach(() => void vi.stubEnv('VITE_API_URL', 'https://api.test'));

const segments = [
  { kind: 'intro', startS: 30, endS: 120 },
  { kind: 'outro', startS: 1300, endS: 1400 },
];

// jsdom has no media engine, so the test gives the video a clock and moves it itself.
function videoClock(video: HTMLVideoElement) {
  let time = 0;
  Object.defineProperties(video, {
    duration: { get: () => 1400, configurable: true },
    currentTime: {
      get: () => time,
      set: (value: number) => (time = value),
      configurable: true,
    },
  });
  return {
    now: () => time,
    moveTo: (seconds: number) => {
      time = seconds;
      act(() => {
        video.dispatchEvent(new Event('durationchange'));
        video.dispatchEvent(new Event('timeupdate'));
      });
    },
  };
}

describe('skipping the intro and the outro in the player', () => {
  it('offers to skip the intro while it plays and jumps to its end', async () => {
    fetchMock
      .get('path:/v1/auth/me', 401)
      .get('path:/v1/skip-times/tonikaku-kawaii-a3860/3', { segments });
    render(
      <Player
        slug="tonikaku-kawaii-a3860"
        seasonSlug="tonikaku-kawaii-a3860"
        title="Tonikaku Kawaii"
        episode={{ id: '73386', hash: 'h', play: 'api', label: 'Tập 3' }}
        startS={0}
        onBack={() => {}}
        episodesPanel={() => null}
      />,
    );
    await expect(fetchMock).toBeFetched(
      'path:/v1/skip-times/tonikaku-kawaii-a3860/3',
    );
    const clock = videoClock(
      screen.getByTestId('player:video') as HTMLVideoElement,
    );

    clock.moveTo(10);
    expect(screen.queryByTestId('player:skip')).not.toBeInTheDocument();

    clock.moveTo(45);
    expect(screen.getByTestId('player:skip')).toHaveTextContent(
      'Bỏ qua phần mở đầu',
    );

    await userEvent.click(screen.getByTestId('player:skip'));
    expect(clock.now()).toBe(120);
  });

  it('offers to play the next episode during the outro instead of skipping it', async () => {
    fetchMock
      .get('path:/v1/auth/me', 401)
      .get('path:/v1/skip-times/tonikaku-kawaii-a3860/3', { segments });
    const onNext = vi.fn();
    render(
      <Player
        slug="tonikaku-kawaii-a3860"
        seasonSlug="tonikaku-kawaii-a3860"
        title="Tonikaku Kawaii"
        episode={{ id: '73386', hash: 'h', play: 'api', label: 'Tập 3' }}
        startS={0}
        nextEpisode={{
          episode: {
            id: '73387',
            hash: 'h',
            play: 'api',
            label: 'Tập 4',
            name: 'Trận chiến bắt đầu',
          },
          number: 4,
        }}
        onNext={onNext}
        onBack={() => {}}
        episodesPanel={() => null}
      />,
    );
    await expect(fetchMock).toBeFetched(
      'path:/v1/skip-times/tonikaku-kawaii-a3860/3',
    );
    const clock = videoClock(
      screen.getByTestId('player:video') as HTMLVideoElement,
    );

    clock.moveTo(1350.4);
    const card = screen.getByTestId('player:outro-card');
    expect(card).toHaveTextContent('Tập tiếp theo');
    expect(card).toHaveTextContent('Phát sau 50 giây');
    expect(card).toHaveTextContent('Tập 4: Trận chiến bắt đầu');
    expect(screen.getByTestId('player:skip')).toHaveTextContent('Phát ngay');
    expect(screen.queryByTestId('player:next-card')).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId('player:skip'));
    expect(onNext).toHaveBeenCalledOnce();
    expect(clock.now()).toBe(1350.4);
  });

  it('goes to the next episode when the video ends', async () => {
    fetchMock
      .get('path:/v1/auth/me', 401)
      .get('path:/v1/skip-times/tonikaku-kawaii-a3860/3', { segments });
    const onNext = vi.fn();
    render(
      <Player
        slug="tonikaku-kawaii-a3860"
        seasonSlug="tonikaku-kawaii-a3860"
        title="Tonikaku Kawaii"
        episode={{ id: '73386', hash: 'h', play: 'api', label: 'Tập 3' }}
        startS={0}
        nextEpisode={{
          episode: { id: '73387', hash: 'h', play: 'api', label: 'Tập 4' },
          number: 4,
        }}
        onNext={onNext}
        onBack={() => {}}
        episodesPanel={() => null}
      />,
    );
    await expect(fetchMock).toBeFetched(
      'path:/v1/skip-times/tonikaku-kawaii-a3860/3',
    );
    const video = screen.getByTestId('player:video');
    const clock = videoClock(video as HTMLVideoElement);

    clock.moveTo(1399);
    expect(onNext).not.toHaveBeenCalled();

    act(() => void video.dispatchEvent(new Event('ended')));
    expect(onNext).toHaveBeenCalledOnce();
  });

  it('stays on the last episode when the video ends', async () => {
    fetchMock
      .get('path:/v1/auth/me', 401)
      .get('path:/v1/skip-times/tonikaku-kawaii-a3860/12', { segments });
    render(
      <Player
        slug="tonikaku-kawaii-a3860"
        seasonSlug="tonikaku-kawaii-a3860"
        title="Tonikaku Kawaii"
        episode={{ id: '74002', hash: 'h', play: 'api', label: 'Tập 12' }}
        startS={0}
        onBack={() => {}}
        episodesPanel={() => null}
      />,
    );
    await expect(fetchMock).toBeFetched(
      'path:/v1/skip-times/tonikaku-kawaii-a3860/12',
    );
    const video = screen.getByTestId('player:video');

    act(() => void video.dispatchEvent(new Event('ended')));
    expect(screen.getByTestId('player')).toHaveAttribute('data-state', 'ended');
  });

  it('skips the outro of the last episode, which has no next one', async () => {
    fetchMock
      .get('path:/v1/auth/me', 401)
      .get('path:/v1/skip-times/tonikaku-kawaii-a3860/12', { segments });
    render(
      <Player
        slug="tonikaku-kawaii-a3860"
        seasonSlug="tonikaku-kawaii-a3860"
        title="Tonikaku Kawaii"
        episode={{ id: '74002', hash: 'h', play: 'api', label: 'Tập 12' }}
        startS={0}
        onBack={() => {}}
        episodesPanel={() => null}
      />,
    );
    await expect(fetchMock).toBeFetched(
      'path:/v1/skip-times/tonikaku-kawaii-a3860/12',
    );
    const clock = videoClock(
      screen.getByTestId('player:video') as HTMLVideoElement,
    );

    clock.moveTo(1350);
    expect(screen.getByTestId('player:skip')).toHaveTextContent(
      'Bỏ qua phần kết',
    );
    expect(screen.queryByTestId('player:outro-card')).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId('player:skip'));
    expect(clock.now()).toBe(1400);
  });

  it('does not look up an episode that has no number', async () => {
    fetchMock.get('path:/v1/auth/me', 401);
    render(
      <Player
        slug="tonikaku-kawaii-a3860"
        seasonSlug="tonikaku-kawaii-a3860"
        title="Tonikaku Kawaii"
        episode={{
          id: '72839',
          hash: 'h',
          play: 'api',
          label: 'Tập 1_BD_Full',
        }}
        startS={0}
        onBack={() => {}}
        episodesPanel={() => null}
      />,
    );
    await expect(fetchMock).toBeFetched('path:/v1/auth/me');

    expect(screen.getByTestId('player:episode-label')).toHaveTextContent(
      'Tập 1_BD_Full',
    );
    expect(fetchMock).not.toHaveFetched('begin:https://api.test/v1/skip-times');
  });

  it('plays on without a skip button when the lookup fails', async () => {
    fetchMock
      .get('path:/v1/auth/me', 401)
      .get('path:/v1/skip-times/tonikaku-kawaii-a3860/3', 500);
    render(
      <Player
        slug="tonikaku-kawaii-a3860"
        seasonSlug="tonikaku-kawaii-a3860"
        title="Tonikaku Kawaii"
        episode={{ id: '73386', hash: 'h', play: 'api', label: 'Tập 3' }}
        startS={0}
        onBack={() => {}}
        episodesPanel={() => null}
      />,
    );
    await expect(fetchMock).toBeFetched(
      'path:/v1/skip-times/tonikaku-kawaii-a3860/3',
    );
    const clock = videoClock(
      screen.getByTestId('player:video') as HTMLVideoElement,
    );

    clock.moveTo(45);
    expect(screen.getByTestId('player')).toBeVisible();
    expect(screen.queryByTestId('player:skip')).not.toBeInTheDocument();
  });
});
