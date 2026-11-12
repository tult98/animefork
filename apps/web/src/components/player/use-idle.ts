import { useEffect, useState, type RefObject } from 'react';

const IDLE_MS = 3000;
const WAKE_EVENTS = ['pointermove', 'pointerdown'] as const;
const HOLD_SELECTOR =
  '.pl-bar:hover, .pl-pw[data-open="true"], .pl-bar :focus-visible';

// True once the pointer and keyboard have been still for IDLE_MS while `enabled`.
// Stays awake while the pointer rests on the control bar or a popup is open.
export function useIdle(
  target: RefObject<HTMLElement | null>,
  enabled: boolean,
) {
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    const root = target.current;
    if (!enabled || !root) return;

    let timer: number | undefined;
    const arm = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (root.querySelector(HOLD_SELECTOR)) arm();
        else setIdle(true);
      }, IDLE_MS);
    };
    const wake = () => {
      setIdle(false);
      arm();
    };

    arm();
    for (const name of WAKE_EVENTS) root.addEventListener(name, wake);
    // On the document, so a shortcut pressed while focus is on the body still wakes the controls.
    document.addEventListener('keydown', wake);
    return () => {
      window.clearTimeout(timer);
      for (const name of WAKE_EVENTS) root.removeEventListener(name, wake);
      document.removeEventListener('keydown', wake);
      setIdle(false);
    };
  }, [target, enabled]);

  return enabled && idle;
}
