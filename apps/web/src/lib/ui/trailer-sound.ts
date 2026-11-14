import { useSyncExternalStore } from 'react';

// Kept in memory only: a browser blocks sound on a page the viewer has not touched yet, so each load starts muted.
let muted = true;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot() {
  return muted;
}

export function useTrailerMuted(): boolean {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function setTrailerMuted(next: boolean) {
  if (next === muted) return;
  muted = next;
  for (const listener of listeners) listener();
}
