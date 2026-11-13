import ky, { HTTPError } from 'ky';

// An HTTPError that also carries what the first-party API says about the failure.
export class ApiError extends HTTPError {
  readonly status: number;
  readonly code: string | undefined;
  readonly retryAfterSeconds: number | undefined;

  constructor(
    error: HTTPError,
    details: { code?: string; retryAfterSeconds?: number } = {},
  ) {
    super(error.response, error.request, error.options);
    this.status = error.response.status;
    this.code = details.code;
    this.retryAfterSeconds = details.retryAfterSeconds;
  }
}

async function toApiError(error: HTTPError): Promise<HTTPError> {
  const body = (await error.response
    .clone()
    .json()
    .catch(() => null)) as { error?: unknown } | null;
  const seconds = Number(error.response.headers.get('retry-after'));
  return new ApiError(error, {
    code: typeof body?.error === 'string' ? body.error : undefined,
    retryAfterSeconds:
      Number.isFinite(seconds) && seconds > 0 ? seconds : undefined,
  });
}

// ky joins paths onto a fixed origin, and the real one is read from VITE_API_URL when the request is sent.
const PLACEHOLDER_ORIGIN = 'https://api.invalid';

// The first-party API. Call it with a path without a leading slash: `api.get('v1/auth/me').json<UserResponse>()`.
export const api = ky.create({
  prefixUrl: PLACEHOLDER_ORIGIN,
  credentials: 'include',
  // react-query owns retries.
  retry: 0,
  fetch: async (input, init) => {
    const base = import.meta.env.VITE_API_URL?.replace(/\/+$/, '');
    if (!base) throw new Error('VITE_API_URL is not set');
    const request = new Request(input, init);
    const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
    return fetch(request.url.replace(PLACEHOLDER_ORIGIN, base), {
      method: request.method,
      headers: request.headers,
      body: hasBody ? await request.text() : undefined,
      signal: request.signal,
      credentials: request.credentials,
      keepalive: request.keepalive,
    });
  },
  hooks: { beforeError: [toApiError] },
});
