import { describe, expect, it } from 'vitest';
import {
  CredentialsSchema,
  MAX_EMAIL_LENGTH,
  verifyEmailUrl,
} from '../../src/auth/contract.ts';
import {
  generateToken,
  hashToken,
  TOKEN_BYTES,
} from '../../src/auth/tokens.ts';

function emailOfLength(length: number): string {
  const domain = ['b'.repeat(60), 'c'.repeat(60), 'd'.repeat(60), 'com'].join(
    '.',
  );
  return `${'a'.repeat(length - domain.length - 1)}@${domain}`;
}

describe('auth contract', () => {
  it('trims and lowercases the email', () => {
    expect(
      CredentialsSchema.parse({
        email: '  Ana@Example.COM ',
        password: '12345678',
      }),
    ).toEqual({ email: 'ana@example.com', password: '12345678' });
  });

  it('refuses a bad email, a long email and a password outside 8 to 128', () => {
    for (const body of [
      { email: 'not-an-email', password: '12345678' },
      { email: emailOfLength(MAX_EMAIL_LENGTH + 1), password: '12345678' },
      { email: 'a@b.co', password: '1234567' },
      { email: 'a@b.co', password: 'x'.repeat(129) },
    ]) {
      expect(CredentialsSchema.safeParse(body).success).toBe(false);
    }
    expect(
      CredentialsSchema.safeParse({
        email: emailOfLength(MAX_EMAIL_LENGTH),
        password: 'x'.repeat(128),
      }).success,
    ).toBe(true);
  });

  it('puts the token in the fragment of the web verification page', () => {
    expect(verifyEmailUrl('https://animefork.test/', 'abc')).toBe(
      'https://animefork.test/verify-email#token=abc',
    );
  });
});

describe('tokens', () => {
  it('generates 32 random bytes as base64url and hashes with SHA-256', () => {
    const token = generateToken();
    expect(token).toMatch(/^[\w-]{43}$/);
    expect(Buffer.from(token, 'base64url')).toHaveLength(TOKEN_BYTES);
    expect(generateToken()).not.toBe(token);
    expect(hashToken(token)).toHaveLength(32);
    expect(hashToken(token).equals(hashToken(token))).toBe(true);
  });
});
