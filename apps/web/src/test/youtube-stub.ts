import { act } from '@testing-library/react';
import { vi } from 'vitest';
import type { YouTubePlayerOptions } from '../lib/ui/youtube.ts';

const PLAYING = 1;
const ENDED = 0;

export interface StubPlayer {
  videoId: string;
  options: YouTubePlayerOptions;
  mute: ReturnType<typeof vi.fn>;
  unMute: ReturnType<typeof vi.fn>;
  playVideo: ReturnType<typeof vi.fn>;
  seekTo: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  play: () => void;
  end: () => void;
  fail: () => void;
}

// Stands in for the YouTube IFrame API, so no script loads. Each player waits for the test to play, end or fail it.
export function stubYouTube(): StubPlayer[] {
  const players: StubPlayer[] = [];
  class Player {
    constructor(element: HTMLElement, options: YouTubePlayerOptions) {
      const iframe = document.createElement('iframe');
      element.replaceWith(iframe);
      const player = {
        mute: vi.fn(),
        unMute: vi.fn(),
        playVideo: vi.fn(),
        seekTo: vi.fn(),
        destroy: vi.fn(),
        getIframe: () => iframe,
      };
      const state = (data: number) =>
        act(() => options.events?.onStateChange?.({ data, target: player }));
      players.push({
        ...player,
        videoId: options.videoId,
        options,
        play: () => state(PLAYING),
        end: () => state(ENDED),
        fail: () =>
          act(() => options.events?.onError?.({ data: 150, target: player })),
      });
      options.events?.onReady?.({ target: player });
      return player;
    }
  }
  vi.stubGlobal('YT', { Player, PlayerState: { PLAYING, ENDED } });
  return players;
}
