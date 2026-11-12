import {
  AuthErrorCodeSchema,
  SIGN_IN_PATH,
  SIGN_OUT_PATH,
  SIGN_UP_PATH,
  UserResponseSchema,
  VERIFY_EMAIL_PATH,
  type AuthUser,
  type Credentials,
} from '../../../../api/src/auth/contract.ts';
import { z } from 'zod';
import { apiFetch } from '../api/request.ts';

export type AuthError =
  | { kind: 'invalid_credentials' }
  | { kind: 'invalid_token' }
  | { kind: 'invalid_request' }
  | { kind: 'email_taken' }
  | { kind: 'rate_limited'; retryAfterSeconds?: number }
  // Also covers an unset VITE_API_URL, a 5xx and a body of an unexpected shape: the user can only retry.
  | { kind: 'network' };

export type AuthResult<T> =
  { ok: true; data: T } | { ok: false; error: AuthError };

const OkSchema = z.object({ ok: z.literal(true) });

const NETWORK: AuthError = { kind: 'network' };

async function send(
  path: string,
  init: RequestInit,
): Promise<Response | undefined> {
  try {
    return await apiFetch(path, init);
  } catch {
    return undefined;
  }
}

function post(path: string, body?: unknown, signal?: AbortSignal) {
  return send(path, {
    method: 'POST',
    signal,
    ...(body === undefined
      ? {}
      : {
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
  });
}

function retryAfterSeconds(response: Response): number | undefined {
  const seconds = Number(response.headers.get('retry-after'));
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}

async function failure(
  response: Response,
  accepts: AuthError['kind'][],
): Promise<AuthError> {
  if (response.status === 429) {
    return {
      kind: 'rate_limited',
      retryAfterSeconds: retryAfterSeconds(response),
    };
  }
  const body = (await response.json().catch(() => null)) as {
    error?: unknown;
  } | null;
  const code = AuthErrorCodeSchema.safeParse(body?.error);
  const kind = code.success ? code.data : undefined;
  return kind &&
    kind !== 'unauthenticated' &&
    kind !== 'rate_limited' &&
    accepts.includes(kind)
    ? { kind }
    : NETWORK;
}

async function parsed<T>(
  response: Response,
  schema: z.ZodType<T>,
): Promise<AuthResult<T>> {
  const body = schema.safeParse(await response.json().catch(() => null));
  return body.success
    ? { ok: true, data: body.data }
    : { ok: false, error: NETWORK };
}

export async function signIn(
  credentials: Credentials,
  signal?: AbortSignal,
): Promise<AuthResult<AuthUser>> {
  const response = await post(SIGN_IN_PATH, credentials, signal);
  if (!response) return { ok: false, error: NETWORK };
  if (response.status !== 200) {
    return {
      ok: false,
      error: await failure(response, [
        'invalid_credentials',
        'invalid_request',
      ]),
    };
  }
  const result = await parsed(response, UserResponseSchema);
  return result.ok ? { ok: true, data: result.data.user } : result;
}

export async function signUp(
  credentials: Credentials,
  signal?: AbortSignal,
): Promise<AuthResult<null>> {
  const response = await post(SIGN_UP_PATH, credentials, signal);
  if (!response) return { ok: false, error: NETWORK };
  if (response.status !== 202) {
    return {
      ok: false,
      error: await failure(response, ['invalid_request', 'email_taken']),
    };
  }
  const result = await parsed(response, OkSchema);
  return result.ok ? { ok: true, data: null } : result;
}

export async function verifyEmail(
  token: string,
  signal?: AbortSignal,
): Promise<AuthResult<null>> {
  const response = await post(VERIFY_EMAIL_PATH, { token }, signal);
  if (!response) return { ok: false, error: NETWORK };
  if (response.status !== 200) {
    return {
      ok: false,
      error: await failure(response, ['invalid_token', 'invalid_request']),
    };
  }
  const result = await parsed(response, OkSchema);
  return result.ok ? { ok: true, data: null } : result;
}

export async function signOut(): Promise<AuthResult<null>> {
  const response = await post(SIGN_OUT_PATH);
  if (!response) return { ok: false, error: NETWORK };
  return response.status === 204
    ? { ok: true, data: null }
    : { ok: false, error: await failure(response, []) };
}
