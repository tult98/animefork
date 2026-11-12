import { vi } from 'vitest';
import type {
  ArtEntry,
  LookupRequest,
  TitleRatings,
} from '../../../api/src/art/contract.ts';

export const mal = (
  score: number | null,
  voters: number | null,
): TitleRatings => ({
  mal: {
    id: 1,
    score,
    voters,
    rank: null,
    popularity: null,
    members: null,
    airing: null,
    episodes: null,
    startDate: null,
    startSeason: null,
  },
});

// Turns the lookup on and routes api.test requests to `handler`; anything else falls through to the previous fetch.
function install(
  handler: (init: RequestInit | undefined) => Promise<Response>,
) {
  vi.stubEnv('VITE_API_URL', 'https://api.test');
  const previous = globalThis.fetch;
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    // The header asks for the session on every page; nobody is signed in here.
    if (url.startsWith('https://api.test/v1/auth/')) {
      return Promise.resolve(new Response('', { status: 401 }));
    }
    return url.startsWith('https://api.test/')
      ? handler(init)
      : previous(input, init);
  });
}

export interface ArtStubOptions {
  /** The lookup answers only once this settles. */
  gate?: Promise<void>;
  /** Answers every lookup with this status instead of a body. */
  status?: number;
}

export function stubArt(
  answer: (
    body: LookupRequest,
    call: number,
  ) => Record<string, ArtEntry> = () => ({}),
  ratings: Record<string, TitleRatings> = {},
  { gate, status = 200 }: ArtStubOptions = {},
) {
  const bodies: LookupRequest[] = [];
  install(async (init) => {
    const body = JSON.parse(String(init?.body)) as LookupRequest;
    bodies.push(body);
    const call = bodies.length;
    await gate;
    if (status !== 200) return new Response('nope', { status });
    return new Response(JSON.stringify({ art: answer(body, call), ratings }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  return bodies;
}

export function stubLookup(
  ratings: Record<string, TitleRatings> = {},
  { fail = false }: { fail?: boolean } = {},
) {
  if (!fail) return stubArt(() => ({}), ratings);
  const bodies: LookupRequest[] = [];
  install(() => Promise.reject(new TypeError('network down')));
  return bodies;
}
