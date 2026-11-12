// @vitest-environment jsdom
import { act, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { advance, withFakeClock } from '../../test/clock.ts';
import { jsonResponse, stubAuth, user } from '../../test/auth-stub.ts';
import {
  stubProgress,
  type ProgressStubOptions,
} from '../../test/progress-stub.ts';
import type { WatchProgressEpisode } from '../../../../api/src/watch-progress/contract.ts';
import { renderApp } from '../../test/render-app.tsx';

const SLUG = 'tonikaku-kawaii-a3860';
const EPISODES = ['72839', '73010', '73386', '73701', '74002'];

interface Media {
  duration: number;
  time: number;
  paused: boolean;
}

// jsdom has no media engine, so the element reports what the test says and the test fires the events.
function drive(video: HTMLVideoElement, media: Media) {
  Object.defineProperties(video, {
    duration: { get: () => media.duration, configurable: true },
    paused: { get: () => media.paused, configurable: true },
    currentTime: {
      get: () => media.time,
      set: (value: number) => (media.time = value),
      configurable: true,
    },
  });
  const fire = (type: string) =>
    act(() => void video.dispatchEvent(new Event(type)));
  return {
    media,
    fire,
    canplay: () => fire('canplay'),
    play: () => {
      media.paused = false;
      fire('playing');
    },
    pause: () => {
      media.paused = true;
      fire('pause');
    },
    tick: (time: number) => {
      media.time = time;
      fire('timeupdate');
    },
  };
}

async function openSignedIn(
  path = `/watch/${SLUG}`,
  progress: ProgressStubOptions = {},
  duration = 1400,
) {
  const auth = stubAuth({ me: () => jsonResponse(200, { user }) });
  const stub = stubProgress(progress);
  const app = await renderApp(path);
  const video = (await screen.findByTestId('player:video')) as HTMLVideoElement;
  await waitFor(() => expect(auth.to('me')).toHaveLength(1));
  await advance(0);
  const media = drive(video, { duration, time: 0, paused: true });
  return { app, auth, ...stub, ...media, video };
}

describe('saving watch progress from the player', () => {
  withFakeClock();

  it('saves on pause with what the continue-watching shelf needs', async () => {
    const t = await openSignedIn();
    await t.canplay();
    t.play();
    t.tick(61.5);
    t.pause();
    await waitFor(() => expect(t.saves).toHaveLength(1));
    expect(t.saves[0]?.body).toEqual({
      slug: SLUG,
      seasonSlug: SLUG,
      episodeId: EPISODES[0],
      positionS: 61.5,
      durationS: 1400,
      titleName: 'Tonikaku Kawaii [BD]',
      image: expect.any(String),
      episodeLabel: 'Tập 1_BD_Full',
    });
    expect(t.saves[0]?.init).toMatchObject({
      method: 'PUT',
      credentials: 'include',
    });
  });

  it('saves every 15 s of playing time', async () => {
    const t = await openSignedIn();
    await t.canplay();
    t.play();
    t.tick(5);
    await advance(14_000);
    expect(t.saves).toHaveLength(0);
    await advance(1_500);
    expect(t.saves.map((s) => s.body.positionS)).toEqual([5]);
    t.tick(20);
    await advance(15_500);
    await waitFor(() =>
      expect(t.saves.map((s) => s.body.positionS)).toEqual([5, 20]),
    );
  });

  it('saves when the episode ends', async () => {
    const t = await openSignedIn();
    await t.canplay();
    t.play();
    t.tick(1400);
    t.media.paused = true;
    t.fire('ended');
    await waitFor(() => expect(t.saves.at(-1)?.body.positionS).toBe(1400));
  });

  it('saves with keepalive when the page is hidden or closed', async () => {
    const t = await openSignedIn();
    await t.canplay();
    t.play();
    t.tick(30);
    act(() => void window.dispatchEvent(new Event('pagehide')));
    await waitFor(() => expect(t.saves).toHaveLength(1));
    expect(t.saves[0]?.init.keepalive).toBe(true);

    t.tick(40);
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    });
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    delete (document as { visibilityState?: unknown }).visibilityState;
    await waitFor(() => expect(t.saves).toHaveLength(2));
    expect(t.saves[1]?.body.positionS).toBe(40);
    expect(t.saves[1]?.init.keepalive).toBe(true);
  });

  it('saves the last position when the player unmounts', async () => {
    const t = await openSignedIn();
    await t.canplay();
    t.play();
    t.tick(77);
    act(() => void t.app.router.navigate({ to: '/' }));
    await waitFor(() => expect(t.saves.at(-1)?.body.positionS).toBe(77));
  });

  it('sends nothing until the video knows its duration', async () => {
    const t = await openSignedIn(`/watch/${SLUG}`, {}, NaN);
    await t.canplay();
    t.play();
    t.tick(10);
    t.pause();
    await advance(30_000);
    expect(t.saves).toHaveLength(0);
  });

  it('does not save the 0 of a video that has not reached canplay', async () => {
    const t = await openSignedIn();
    t.play();
    t.pause();
    await advance(30_000);
    expect(t.saves).toHaveLength(0);
  });

  it('serializes saves: the latest position goes out only once the last save settled', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const t = await openSignedIn(`/watch/${SLUG}`, {
      put: async (_body, call) => {
        if (call === 1) await gate;
        return new Response(null, { status: 204 });
      },
    });
    await t.canplay();
    t.play();
    t.tick(10);
    t.pause();
    await waitFor(() => expect(t.saves).toHaveLength(1));
    t.play();
    t.tick(20);
    t.pause();
    t.play();
    t.tick(30);
    t.pause();
    await advance(1_000);
    expect(t.saves).toHaveLength(1);

    release();
    await waitFor(() =>
      expect(t.saves.map((s) => s.body.positionS)).toEqual([10, 30]),
    );
  });

  it('stops saving after a 401 and does not retry', async () => {
    const t = await openSignedIn(`/watch/${SLUG}`, {
      put: () => new Response(null, { status: 401 }),
    });
    await t.canplay();
    t.play();
    t.tick(10);
    t.pause();
    await waitFor(() => expect(t.saves).toHaveLength(1));
    t.play();
    t.tick(30);
    await advance(60_000);
    t.pause();
    await advance(1_000);
    expect(t.saves).toHaveLength(1);
  });
});

describe('a signed-out viewer', () => {
  withFakeClock();

  it('saves nothing and reads nothing', async () => {
    const auth = stubAuth();
    const stub = stubProgress();
    await renderApp(`/watch/${SLUG}`);
    const video = (await screen.findByTestId(
      'player:video',
    )) as HTMLVideoElement;
    await waitFor(() => expect(auth.to('me')).toHaveLength(1));
    const t = drive(video, { duration: 1400, time: 0, paused: true });
    await t.canplay();
    t.play();
    t.tick(20);
    await advance(30_000);
    t.pause();
    act(() => void window.dispatchEvent(new Event('pagehide')));
    await advance(1_000);
    expect(stub.saves).toHaveLength(0);
    expect(stub.reads).toHaveLength(0);
  });
});

const row = (
  episodeId: string,
  positionS: number,
  completed = false,
): WatchProgressEpisode => ({
  episodeId,
  positionS,
  durationS: 1400,
  completed,
});

const label = () => screen.getByTestId('player:episode-label').textContent;

describe('resuming', () => {
  withFakeClock();

  async function resume(
    path: string,
    rows: WatchProgressEpisode[],
    options: ProgressStubOptions = {},
  ) {
    const t = await openSignedIn(path, { rows: { [SLUG]: rows }, ...options });
    return t;
  }

  it('opens the last watched episode and seeks 5 s before the saved position once it can play', async () => {
    const t = await resume(`/watch/${SLUG}`, [
      row(EPISODES[0] ?? '', 1390, true),
      row(EPISODES[2] ?? '', 300),
    ]);
    await waitFor(() => expect(label()).toBe('Tập 3'));
    expect(t.media.time).toBe(0);
    await t.canplay();
    expect(t.media.time).toBe(295);
  });

  it('never seeks below 0', async () => {
    const t = await resume(`/watch/${SLUG}`, [row(EPISODES[1] ?? '', 3)]);
    await waitFor(() => expect(label()).toBe('Tập 2'));
    await t.canplay();
    expect(t.media.time).toBe(0);
  });

  it('offers the next episode from its start once the last one is completed', async () => {
    const t = await resume(`/watch/${SLUG}`, [
      row(EPISODES[1] ?? '', 1390, true),
    ]);
    await waitFor(() => expect(label()).toBe('Tập 3'));
    await t.canplay();
    expect(t.media.time).toBe(0);
  });

  it('wraps to the first episode after the last one is completed', async () => {
    await resume(`/watch/${SLUG}`, [row(EPISODES[4] ?? '', 1390, true)]);
    await waitFor(() => expect(label()).toBe('Tập 1_BD_Full'));
  });

  it('keeps the episode of the URL and only seeks to its saved position', async () => {
    const t = await resume(`/watch/${SLUG}/${EPISODES[1]}`, [
      row(EPISODES[1] ?? '', 200),
      row(EPISODES[3] ?? '', 900),
    ]);
    expect(label()).toBe('Tập 2');
    await t.canplay();
    expect(t.media.time).toBe(195);
  });

  it('starts a completed episode of the URL over', async () => {
    const t = await resume(`/watch/${SLUG}/${EPISODES[1]}`, [
      row(EPISODES[1] ?? '', 1390, true),
    ]);
    await t.canplay();
    expect(t.media.time).toBe(0);
  });

  it('ignores rows for episodes that are not on the page', async () => {
    await resume(`/watch/${SLUG}`, [row('1', 500)]);
    expect(label()).toBe('Tập 1_BD_Full');
  });

  it('shows the loading state until the rows arrive', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    stubAuth({ me: () => jsonResponse(200, { user }) });
    stubProgress({ rows: { [SLUG]: [row(EPISODES[2] ?? '', 300)] }, gate });
    await renderApp(`/watch/${SLUG}`);
    await screen.findByTestId('watch:loading');
    await advance(2_000);
    expect(screen.queryByTestId('player')).toBeNull();
    release();
    await screen.findByTestId('player');
    expect(label()).toBe('Tập 3');
  });

  it('plays from the first episode when the rows cannot be read', async () => {
    const t = await resume(`/watch/${SLUG}`, [], { rowsStatus: 500 });
    expect(label()).toBe('Tập 1_BD_Full');
    await t.canplay();
    expect(t.media.time).toBe(0);
  });

  it('does not move to another episode when the rows change while watching', async () => {
    const rows = { [SLUG]: [row(EPISODES[2] ?? '', 300)] };
    const t = await openSignedIn(`/watch/${SLUG}`, { rows });
    await waitFor(() => expect(label()).toBe('Tập 3'));
    await t.canplay();
    t.play();
    t.tick(400);
    rows[SLUG] = [row(EPISODES[2] ?? '', 1390, true)];
    t.pause();
    await waitFor(() => expect(t.reads.length).toBeGreaterThan(1));
    await advance(1_000);
    expect(label()).toBe('Tập 3');
  });
});
