// @vitest-environment jsdom
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { API, jsonResponse, stubAuth } from '../../test/auth-stub.ts';
import { renderApp } from '../../test/render-app.tsx';
import { SkipButton } from '../player/skip-button.tsx';
import type { SkipSegment } from '../../lib/player/skip-segments.ts';

const SLUG = 'tonikaku-kawaii-a3860';
const EPISODE_3 = '73386';
const SEGMENTS: SkipSegment[] = [
  { kind: 'intro', startS: 30, endS: 120 },
  { kind: 'outro', startS: 1300, endS: 1400 },
];

const button = () => screen.queryByTestId('player:skip');

describe('SkipButton', () => {
  it('shows only while the time is inside a segment', () => {
    const { rerender } = render(
      <SkipButton segments={SEGMENTS} time={10} onSkip={() => {}} />,
    );
    expect(button()).toBeNull();
    rerender(<SkipButton segments={SEGMENTS} time={30} onSkip={() => {}} />);
    expect(button()).not.toBeNull();
    rerender(<SkipButton segments={SEGMENTS} time={120} onSkip={() => {}} />);
    expect(button()).toBeNull();
  });

  it('names the kind of the segment', () => {
    const { rerender } = render(
      <SkipButton segments={SEGMENTS} time={60} onSkip={() => {}} />,
    );
    expect(button()?.getAttribute('data-kind')).toBe('intro');
    expect(button()?.textContent).toBe('Bỏ qua phần mở đầu');
    rerender(<SkipButton segments={SEGMENTS} time={1350} onSkip={() => {}} />);
    expect(button()?.getAttribute('data-kind')).toBe('outro');
    expect(button()?.textContent).toBe('Bỏ qua phần kết');
  });

  it('seeks to the end of the segment when clicked', async () => {
    const onSkip = vi.fn();
    render(<SkipButton segments={SEGMENTS} time={1350} onSkip={onSkip} />);
    await userEvent.click(screen.getByTestId('player:skip'));
    expect(onSkip).toHaveBeenCalledExactlyOnceWith(1400);
  });

  it('offers the next episode during an outro instead of seeking', async () => {
    const onSkip = vi.fn();
    const onNext = vi.fn();
    render(
      <SkipButton
        segments={SEGMENTS}
        time={1350}
        onSkip={onSkip}
        onNext={onNext}
      />,
    );
    expect(button()?.getAttribute('data-kind')).toBe('outro');
    expect(button()?.textContent).toBe('Tập tiếp theo');
    await userEvent.click(screen.getByTestId('player:skip'));
    expect(onNext).toHaveBeenCalledOnce();
    expect(onSkip).not.toHaveBeenCalled();
  });

  it('keeps the intro skip when a next episode exists', async () => {
    const onSkip = vi.fn();
    const onNext = vi.fn();
    render(
      <SkipButton
        segments={SEGMENTS}
        time={60}
        onSkip={onSkip}
        onNext={onNext}
      />,
    );
    expect(button()?.textContent).toBe('Bỏ qua phần mở đầu');
    await userEvent.click(screen.getByTestId('player:skip'));
    expect(onSkip).toHaveBeenCalledExactlyOnceWith(120);
    expect(onNext).not.toHaveBeenCalled();
  });

  it('renders nothing without segments', () => {
    render(<SkipButton segments={[]} time={60} onSkip={() => {}} />);
    expect(button()).toBeNull();
  });
});

describe('the skip button in the player', () => {
  it('appears inside the intro and skips to its end', async () => {
    stubAuth();
    const authFetch = globalThis.fetch;
    const asked: string[] = [];
    vi.stubGlobal(
      'fetch',
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (!url.startsWith(`${API}/v1/skip-times/`)) {
          return authFetch(input, init);
        }
        asked.push(url.slice(API.length));
        return jsonResponse(200, { segments: SEGMENTS });
      },
    );
    await renderApp(`/watch/${SLUG}/${EPISODE_3}`);
    const video = (await screen.findByTestId(
      'player:video',
    )) as HTMLVideoElement;
    let time = 0;
    Object.defineProperties(video, {
      duration: { get: () => 1400, configurable: true },
      currentTime: {
        get: () => time,
        set: (value: number) => (time = value),
        configurable: true,
      },
    });
    const tick = (value: number) => {
      time = value;
      act(() => void video.dispatchEvent(new Event('timeupdate')));
    };

    await waitFor(() => expect(asked).toEqual([`/v1/skip-times/${SLUG}/3`]));
    tick(10);
    expect(button()).toBeNull();
    tick(45);
    await waitFor(() => expect(button()).not.toBeNull());
    expect(button()?.getAttribute('data-kind')).toBe('intro');

    await userEvent.click(screen.getByTestId('player:skip'));
    expect(time).toBe(120);
    act(() => void video.dispatchEvent(new Event('seeked')));
    expect(button()).toBeNull();
  });

  it('never asks for an episode without a number', async () => {
    stubAuth();
    const authFetch = globalThis.fetch;
    const asked: string[] = [];
    vi.stubGlobal(
      'fetch',
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).includes('/v1/skip-times/'))
          asked.push(String(input));
        return authFetch(input, init);
      },
    );
    await renderApp(`/watch/${SLUG}`);
    await screen.findByTestId('player');
    expect(screen.getByTestId('player:episode-label').textContent).toBe(
      'Tập 1_BD_Full',
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(asked).toEqual([]);
    expect(button()).toBeNull();
  });
});
