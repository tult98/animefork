import type { AuthError } from './client.ts';
import { authCopy } from './copy.ts';

export function authErrorMessage(error: AuthError): string {
  if (error.kind === 'rate_limited') {
    return authCopy.errors.rateLimited(error.retryAfterSeconds);
  }
  if (error.kind === 'email_taken') return authCopy.errors.emailTaken;
  return authCopy.errors.generic;
}
