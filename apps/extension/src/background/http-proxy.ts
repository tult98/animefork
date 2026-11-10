import { arrayBufferToBase64 } from '../shared/base64';
import { onMessage } from '../shared/messages';
import type { RequestOption, RequestResponse } from '../shared/types';

import { mergeSetCookie, setCookie } from './cookies';

class EventsAbort {
  private readonly store = new Map<string, () => void>();

  constructor() {
    onMessage('http:aborted', ({ data: { signalId } }) => {
      this.store.get(signalId)?.();
    });
  }

  on(id: string, fn: () => void) {
    this.store.set(id, fn);

    return () => this.store.delete(id);
  }
}

async function sendRequest(
  eventsAbort: EventsAbort,
  ready: Promise<unknown>,
  { url, headers, responseType, signalId, method, data }: RequestOption,
): Promise<RequestResponse> {
  let form: FormData | string | undefined;
  if (data) {
    if (typeof data === 'object') {
      form = new FormData();

      Object.entries(data ?? {}).forEach(([key, val]) =>
        (form as FormData).append(key, val as string),
      );
    } else {
      form = data;
    }
  }

  let signal: AbortSignal | undefined;
  let cancelAbort: (() => void) | undefined;

  if (signalId) {
    const controller = new AbortController();
    signal = controller.signal;
    if (signalId === true) {
      controller.abort();
    } else {
      // init abortcontroller
      cancelAbort = eventsAbort.on(signalId, () => {
        controller.abort();
        cancelAbort?.();
      });
    }
  }

  await ready;

  if (headers?.['c-cookie']) await setCookie(url, headers['c-cookie']);

  return fetch(url, {
    headers: new Headers(headers),
    credentials: 'include',
    signal,
    method,
    body: form,
  })
    .then(async (res) => {
      cancelAbort?.();

      return {
        headers: await mergeSetCookie(res.headers, res.url),
        data:
          responseType === 'arraybuffer'
            ? await res.arrayBuffer().then(arrayBufferToBase64)
            : await res.text(),
        url: res.url,
        status: res.status,
      };
    })
    .catch((err) => {
      cancelAbort?.();
      throw err;
    });
}

/** `ready` resolves once the default referrer rules are installed. */
export function registerHttpProxy(ready: Promise<unknown>) {
  const eventsAbort = new EventsAbort();

  onMessage('http:request', ({ data }) =>
    sendRequest(eventsAbort, ready, data),
  );
}
