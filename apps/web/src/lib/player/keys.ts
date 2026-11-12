export type PlayerKeyAction =
  | { type: 'toggle' }
  | { type: 'skip'; delta: number }
  | { type: 'volume'; delta: number }
  | { type: 'mute' }
  | { type: 'fullscreen' }
  | { type: 'seekFraction'; fraction: number };

interface KeyEventLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

const KEY_ACTIONS: Record<string, PlayerKeyAction> = {
  ' ': { type: 'toggle' },
  k: { type: 'toggle' },
  ArrowLeft: { type: 'skip', delta: -5 },
  ArrowRight: { type: 'skip', delta: 5 },
  j: { type: 'skip', delta: -10 },
  l: { type: 'skip', delta: 10 },
  ArrowUp: { type: 'volume', delta: 0.1 },
  ArrowDown: { type: 'volume', delta: -0.1 },
  m: { type: 'mute' },
  f: { type: 'fullscreen' },
  Home: { type: 'seekFraction', fraction: 0 },
  End: { type: 'seekFraction', fraction: 1 },
  ...Object.fromEntries(
    Array.from({ length: 10 }, (_, digit) => [
      String(digit),
      { type: 'seekFraction', fraction: digit / 10 },
    ]),
  ),
};

// Letters match either case, so Caps Lock does not disable them.
export function playerKeyAction(
  event: KeyEventLike,
): PlayerKeyAction | undefined {
  if (event.ctrlKey || event.metaKey || event.altKey) return undefined;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  return Object.hasOwn(KEY_ACTIONS, key) ? KEY_ACTIONS[key] : undefined;
}
