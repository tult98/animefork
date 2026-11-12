import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// ReplayTransport asks for /fixtures/<set>/<page>; the pages live in the mock data beside the component tests.
const MOCK_DATA = resolve(import.meta.dirname, '../components/__mockData__');

export type FixtureOverride = (
  url: string,
) => Response | undefined | Promise<Response | undefined>;

// Holds back the requests matching `match` (a URL suffix or a pattern) until release() is called.
export function hold(match: string | RegExp) {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const override: FixtureOverride = (url) =>
    (typeof match === 'string' ? url.endsWith(match) : match.test(url))
      ? gate.then(() => undefined)
      : undefined;
  return { override, release: () => release() };
}

// A fetch that answers ReplayTransport's /fixtures/... requests from components/__mockData__, with per-test overrides in front.
export function fixtureFetch(...overrides: FixtureOverride[]): typeof fetch {
  return async (input, init) => {
    const url = String(input);
    for (const override of overrides) {
      const answer = await override(url);
      if (answer) return answer;
    }
    if (init?.signal?.aborted) throw init.signal.reason;
    try {
      const body = await readFile(
        resolve(MOCK_DATA, `.${url.replace(/^\/fixtures/, '')}`),
        'utf8',
      );
      return new Response(body, { status: 200 });
    } catch {
      return new Response('not found', { status: 404 });
    }
  };
}

export const failing =
  (match: string | RegExp, status = 500): FixtureOverride =>
  (url) =>
    (typeof match === 'string' ? url.endsWith(match) : match.test(url))
      ? new Response('', { status })
      : undefined;

export const aborted =
  (match: string | RegExp): FixtureOverride =>
  (url) =>
    (typeof match === 'string' ? url.endsWith(match) : match.test(url))
      ? Promise.reject(new TypeError('Failed to fetch'))
      : undefined;
