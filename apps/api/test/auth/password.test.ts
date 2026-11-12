import { describe, expect, it } from 'vitest';
import {
  DUMMY_PASSWORD_HASH,
  hashPassword,
  SCRYPT_PARAMS,
  verifyPassword,
} from '../../src/auth/password.ts';

const CHEAP = { N: 1024, r: 8, p: 1, keyLength: 32, saltBytes: 8 };

describe('password', () => {
  it('hashes with SCRYPT_PARAMS into scrypt$N$r$p$salt$hash and verifies it', async () => {
    const stored = await hashPassword('correct horse');
    const [prefix, N, r, p, salt, key] = stored.split('$');
    expect([prefix, N, r, p]).toEqual([
      'scrypt',
      String(SCRYPT_PARAMS.N),
      String(SCRYPT_PARAMS.r),
      String(SCRYPT_PARAMS.p),
    ]);
    expect(Buffer.from(salt ?? '', 'base64url')).toHaveLength(
      SCRYPT_PARAMS.saltBytes,
    );
    expect(Buffer.from(key ?? '', 'base64url')).toHaveLength(
      SCRYPT_PARAMS.keyLength,
    );
    expect(await verifyPassword('correct horse', stored)).toBe(true);
    expect(await verifyPassword('correct horsf', stored)).toBe(false);
  });

  it('salts every hash', async () => {
    const [a, b] = await Promise.all([
      hashPassword('same', CHEAP),
      hashPassword('same', CHEAP),
    ]);
    expect(a).not.toBe(b);
  });

  it('verifies with the parameters stored in the hash, not the current ones', async () => {
    const stored = await hashPassword('old params', CHEAP);
    expect(stored.startsWith('scrypt$1024$8$1$')).toBe(true);
    expect(await verifyPassword('old params', stored)).toBe(true);
  });

  it('answers false for a malformed stored hash', async () => {
    for (const stored of [
      '',
      'bcrypt$1$2$3$a$b',
      'scrypt$x$8$1$abc$def',
      'scrypt$1024$8$1$abc',
      'scrypt$1024$8$1$a b$def',
    ]) {
      expect(await verifyPassword('anything', stored)).toBe(false);
    }
  });

  it('keeps the dummy hash on the current parameters so an unknown email costs a full verify', async () => {
    const [, N, r, p, , key] = DUMMY_PASSWORD_HASH.split('$');
    expect([N, r, p].map(Number)).toEqual([
      SCRYPT_PARAMS.N,
      SCRYPT_PARAMS.r,
      SCRYPT_PARAMS.p,
    ]);
    expect(Buffer.from(key ?? '', 'base64url')).toHaveLength(
      SCRYPT_PARAMS.keyLength,
    );
    expect(await verifyPassword('', DUMMY_PASSWORD_HASH)).toBe(false);
    expect(await verifyPassword('password', DUMMY_PASSWORD_HASH)).toBe(false);
  });
});
