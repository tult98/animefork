export class ApiError extends Error {
  readonly endpoint: string;
  readonly status: number;
  readonly code: string | undefined;
  readonly retryAfterSeconds: number | undefined;

  constructor(
    endpoint: string,
    status: number,
    details: { code?: string; retryAfterSeconds?: number } = {},
  ) {
    super(`${endpoint} answered ${status}`);
    this.endpoint = endpoint;
    this.status = status;
    this.code = details.code;
    this.retryAfterSeconds = details.retryAfterSeconds;
  }
}

export interface ApiRequest {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  keepalive?: boolean;
}

function apiFetch(endpoint: string, init: RequestInit = {}): Promise<Response> {
  const base = import.meta.env.VITE_API_URL?.replace(/\/+$/, '');
  if (!base) throw new Error('VITE_API_URL is not set');
  return fetch(`${base}${endpoint}`, { ...init, credentials: 'include' });
}

async function toApiError(
  endpoint: string,
  response: Response,
): Promise<ApiError> {
  const body = (await response.json().catch(() => null)) as {
    error?: unknown;
  } | null;
  const seconds = Number(response.headers.get('retry-after'));
  return new ApiError(endpoint, response.status, {
    code: typeof body?.error === 'string' ? body.error : undefined,
    retryAfterSeconds:
      Number.isFinite(seconds) && seconds > 0 ? seconds : undefined,
  });
}

export async function apiRequest<T>(
  endpoint: string,
  { method = 'GET', body, signal, keepalive }: ApiRequest = {},
): Promise<T> {
  const response = await apiFetch(endpoint, {
    method,
    signal,
    keepalive,
    ...(body === undefined
      ? {}
      : {
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
  });
  if (!response.ok) throw await toApiError(endpoint, response);
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
