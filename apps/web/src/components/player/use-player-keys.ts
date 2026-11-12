import { useEffect, useRef } from 'react';
import { playerKeyAction } from '../../lib/player/keys.ts';
import type { PlaybackControls } from '../../lib/player/use-playback.ts';

interface PlayerKeysOptions {
  controls: PlaybackControls;
  duration: number;
  volume: number;
  toggleFullscreen: () => void;
}

const TEXT_ENTRY = 'input, textarea, select, [contenteditable]';
const ACTIVATES_ON_KEY = 'button, a[href]';
const POPUP = '.pl-pw';

// Range inputs and popups keep their own keys. A focused button or link already activates on Space and
// Enter, so a second toggle from here would cancel it out.
function ownsKey(event: KeyboardEvent) {
  const target = event.target;
  if (!(target instanceof Element)) return false;
  if (target.closest(TEXT_ENTRY) || target.closest(POPUP)) return true;
  return (
    (event.key === ' ' || event.key === 'Enter') &&
    !!target.closest(ACTIVATES_ON_KEY)
  );
}

export function usePlayerKeys(options: PlayerKeysOptions) {
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || ownsKey(event)) return;
      const action = playerKeyAction(event);
      if (!action) return;
      const { controls, duration, volume, toggleFullscreen } = latest.current;
      switch (action.type) {
        case 'toggle':
          controls.toggle();
          break;
        case 'skip':
          controls.skip(action.delta);
          break;
        case 'volume':
          controls.setVolume(Math.round((volume + action.delta) * 100) / 100);
          break;
        case 'mute':
          controls.toggleMute();
          break;
        case 'fullscreen':
          toggleFullscreen();
          break;
        case 'seekFraction':
          if (!(Number.isFinite(duration) && duration > 0)) return;
          controls.seek(duration * action.fraction);
          break;
      }
      event.preventDefault();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);
}
