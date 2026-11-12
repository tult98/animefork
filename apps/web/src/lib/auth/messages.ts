import type { AuthError } from './client.ts';
import { authCopy } from './copy.ts';

export function authErrorMessage(error: AuthError): string {
  return error.kind === 'rate_limited'
    ? authCopy.errors.rateLimited(error.retryAfterSeconds)
    : authCopy.errors.generic;
}
