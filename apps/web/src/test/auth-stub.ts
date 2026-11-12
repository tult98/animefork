import { vi } from 'vitest';
import {
  ME_PATH,
  SIGN_IN_PATH,
  SIGN_OUT_PATH,
  SIGN_UP_PATH,
  VERIFY_EMAIL_PATH,
} from '../../../api/src/auth/contract.ts';

export const API = 'https://api.test';

export const user = { id: 'u1', email: 'mai@example.com' };

export const jsonResponse = (
  status: number,
  body?: unknown,
  headers: Record<string, string> = {},
) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

type Handler = (body: unknown) => Response | Promise<Response>;

export interface AuthStubOptions {
  me?: Handler;
  signIn?: Handler;
  signUp?: Handler;
  verifyEmail?: Handler;
  signOut?: Handler;
}

export interface AuthCall {
  path: string;
  init: RequestInit | undefined;
  body: unknown;
}

const PATHS = {
  me: ME_PATH,
  signIn: SIGN_IN_PATH,
  signUp: SIGN_UP_PATH,
  verifyEmail: VERIFY_EMAIL_PATH,
  signOut: SIGN_OUT_PATH,
} as const;

// Turns the API on and answers the auth routes; anything else goes to the previous fetch. A route without a handler is a 401.
export function stubAuth(handlers: AuthStubOptions = {}) {
  vi.stubEnv('VITE_API_URL', API);
  const previous = globalThis.fetch;
  const calls: AuthCall[] = [];
  vi.stubGlobal(
    'fetch',
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (!url.startsWith(`${API}/`)) return previous(input, init);
      const path = url.slice(API.length);
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ path, init, body });
      const key = (Object.keys(PATHS) as (keyof typeof PATHS)[]).find(
        (name) => PATHS[name] === path,
      );
      const handler = key ? handlers[key] : undefined;
      return handler
        ? handler(body)
        : jsonResponse(401, { error: 'unauthenticated' });
    },
  );
  return {
    calls,
    to: (name: keyof typeof PATHS) =>
      calls.filter((call) => call.path === PATHS[name]),
  };
}
