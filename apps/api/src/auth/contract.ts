import { z } from 'zod';

export const MAX_EMAIL_LENGTH = 254;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;
const MAX_TOKEN_LENGTH = 512;

export const SIGN_UP_PATH = '/v1/auth/sign-up';
export const VERIFY_EMAIL_PATH = '/v1/auth/verify-email';
export const SIGN_IN_PATH = '/v1/auth/sign-in';
export const SIGN_OUT_PATH = '/v1/auth/sign-out';
export const ME_PATH = '/v1/auth/me';

export const VERIFY_EMAIL_PAGE = '/verify-email';

export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email().max(MAX_EMAIL_LENGTH));

export const PasswordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH)
  .max(MAX_PASSWORD_LENGTH);

export const CredentialsSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
});

export type Credentials = z.infer<typeof CredentialsSchema>;

export const VerifyEmailRequestSchema = z.object({
  token: z.string().max(MAX_TOKEN_LENGTH),
});

export type VerifyEmailRequest = z.infer<typeof VerifyEmailRequestSchema>;

export const AuthUserSchema = z.object({
  id: z.string(),
  email: z.string(),
});

export type AuthUser = z.infer<typeof AuthUserSchema>;

export const UserResponseSchema = z.object({ user: AuthUserSchema });

export type UserResponse = z.infer<typeof UserResponseSchema>;

export const AuthErrorCodeSchema = z.enum([
  'invalid_request',
  'invalid_token',
  'invalid_credentials',
  'unauthenticated',
  'rate_limited',
]);

export type AuthErrorCode = z.infer<typeof AuthErrorCodeSchema>;

export function verifyEmailUrl(webBaseUrl: string, token: string): string {
  return `${webBaseUrl.replace(/\/+$/, '')}${VERIFY_EMAIL_PAGE}#token=${token}`;
}
