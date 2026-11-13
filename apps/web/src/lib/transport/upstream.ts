import ky from 'ky';
import { createTransport } from './select.ts';
import type { Transport } from './types.ts';

let current: Transport | undefined;

// The transport is picked on first use from the page URL and env, so nothing has to wire it up at startup.
export function getTransport(): Transport {
  current ??= createTransport(window.location.search, import.meta.env);
  return current;
}

// For tests, which answer every upstream call through fetch-mock or a fixture set.
export function setTransport(transport: Transport | undefined): void {
  current = transport;
}

// ky joins paths onto a fixed origin, which the transport drops again: it adds the real upstream origin itself.
const PLACEHOLDER_ORIGIN = 'https://upstream.invalid';

async function transportFetch(
  input: Request | URL | string,
  init?: RequestInit,
): Promise<Response> {
  const request = new Request(input, init);
  const { pathname, search } = new URL(request.url);
  const url = `${pathname}${search}`;
  const signal = request.signal;
  const res =
    request.method === 'POST'
      ? await getTransport().post({
          url,
          signal,
          data: Object.fromEntries(new URLSearchParams(await request.text())),
        })
      : await getTransport().get({ url, signal });
  return new Response(res.data || null, { status: res.status });
}

// The upstream site, reached through the Transport. Call it with a path without a leading slash: `upstream.get('anime-sap-chieu/').text()`.
export const upstream = ky.create({
  prefixUrl: PLACEHOLDER_ORIGIN,
  retry: 0,
  // A slow upstream page is not an error.
  timeout: false,
  fetch: transportFetch,
});

// Paths from the site's own links start with a slash, which ky does not accept.
export function upstreamPath(path: string): string {
  return path.replace(/^\/+/, '');
}
