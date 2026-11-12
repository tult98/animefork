export class ApiError extends Error {
  readonly endpoint: string;
  readonly status: number;

  constructor(endpoint: string, status: number) {
    super(`${endpoint} answered ${status}`);
    this.endpoint = endpoint;
    this.status = status;
  }
}

export function apiFetch(
  endpoint: string,
  init: RequestInit = {},
): Promise<Response> {
  const base = import.meta.env.VITE_API_URL?.replace(/\/+$/, '');
  if (!base) throw new Error('VITE_API_URL is not set');
  return fetch(`${base}${endpoint}`, { ...init, credentials: 'include' });
}

export async function apiGet<T>(
  endpoint: string,
  signal?: AbortSignal,
): Promise<T> {
  const response = await apiFetch(endpoint, { signal });
  if (response.status !== 200) throw new ApiError(endpoint, response.status);
  return (await response.json()) as T;
}
