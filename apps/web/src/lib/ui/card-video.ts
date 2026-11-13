import { useEffect, useSyncExternalStore } from 'react';

// A count, not a flag: one popover's close animation can overlap the next one opening.
let showing = 0;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot() {
  return showing > 0;
}

function change(by: number) {
  showing += by;
  for (const listener of listeners) listener();
}

export function useCardVideoShowing(): boolean {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function useClaimCardVideo() {
  useEffect(() => {
    change(1);
    return () => change(-1);
  }, []);
}
