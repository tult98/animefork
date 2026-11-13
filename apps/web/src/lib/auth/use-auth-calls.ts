import { useCallback } from 'react';
import { z } from 'zod';
import {
  AuthErrorCodeSchema,
  UserResponseSchema,
  type AuthUser,
  type Credentials,
} from '../../../../api/src/auth/contract.ts';
import { api, ApiError } from '../api/client.ts';

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

const FAILED = { ok: false, error: NETWORK } as const;

function toAuthError(error: unknown, accepts: AuthError['kind'][]): AuthError {
  if (!(error instanceof ApiError)) return NETWORK;
  if (error.status === 429) {
    return { kind: 'rate_limited', retryAfterSeconds: error.retryAfterSeconds };
  }
  const code = AuthErrorCodeSchema.safeParse(error.code);
  const kind = code.success ? code.data : undefined;
  return kind &&
    kind !== 'unauthenticated' &&
    kind !== 'rate_limited' &&
    accepts.includes(kind)
    ? { kind }
    : NETWORK;
}

function readUser(body: unknown): AuthResult<AuthUser> {
  const parsed = UserResponseSchema.safeParse(body);
  return parsed.success ? { ok: true, data: parsed.data.user } : FAILED;
}

function readOk(body: unknown): AuthResult<null> {
  return OkSchema.safeParse(body).success ? { ok: true, data: null } : FAILED;
}

function useAuthCall<TBody, TData>(
  endpoint: string,
  accepts: AuthError['kind'][],
  read: (body: unknown) => AuthResult<TData>,
) {
  return useCallback(
    async (body: TBody): Promise<AuthResult<TData>> => {
      try {
        return read(await api.post(endpoint, { json: body }).json());
      } catch (error) {
        return { ok: false, error: toAuthError(error, accepts) };
      }
    },
    [endpoint, accepts, read],
  );
}

const SIGN_IN_ACCEPTS: AuthError['kind'][] = [
  'invalid_credentials',
  'invalid_request',
];
const SIGN_UP_ACCEPTS: AuthError['kind'][] = ['invalid_request', 'email_taken'];
const VERIFY_ACCEPTS: AuthError['kind'][] = [
  'invalid_token',
  'invalid_request',
];

export function useSignIn() {
  return useAuthCall<Credentials, AuthUser>(
    'v1/auth/sign-in',
    SIGN_IN_ACCEPTS,
    readUser,
  );
}

export function useSignUp() {
  return useAuthCall<Credentials, null>(
    'v1/auth/sign-up',
    SIGN_UP_ACCEPTS,
    readOk,
  );
}

export function useVerifyEmail() {
  const verify = useAuthCall<{ token: string }, null>(
    'v1/auth/verify-email',
    VERIFY_ACCEPTS,
    readOk,
  );
  return useCallback((token: string) => verify({ token }), [verify]);
}
