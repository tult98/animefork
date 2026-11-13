import { describe, expect, it } from 'vitest';
import {
  DUMMY_PASSWORD_HASH,
  hashPassword,
  verifyPassword,
} from '../../src/auth/password.ts';

describe('password', () => {
  it('hashes with scrypt at N=2^17 and a 64-byte key, and verifies only the same password', async () => {
    const stored = await hashPassword('correct horse');

    expect(stored).toMatch(/^scrypt\$131072\$8\$1\$[\w-]{22}\$[\w-]{86}$/);
    expect(await verifyPassword('correct horse', stored)).toBe(true);
    expect(await verifyPassword('correct horsf', stored)).toBe(false);
  });

  it('salts every hash, and verifies with the parameters stored in the hash', async () => {
    const old = { N: 1024, r: 8, p: 1, keyLength: 32, saltBytes: 8 };

    const [first, second] = await Promise.all([
      hashPassword('same password', old),
      hashPassword('same password', old),
    ]);

    expect(first).toMatch(/^scrypt\$1024\$8\$1\$/);
    expect(first).not.toBe(second);
    expect(await verifyPassword('same password', first)).toBe(true);
    expect(await verifyPassword('same password', second)).toBe(true);
  });

  it.each([
    ['an empty string', ''],
    ['another algorithm', 'bcrypt$1$2$3$a$b'],
    ['a cost that is not a number', 'scrypt$x$8$1$abc$def'],
    ['a missing key', 'scrypt$1024$8$1$abc'],
    ['a salt that is not base64url', 'scrypt$1024$8$1$a b$def'],
  ])('answers false for a stored hash that is %s', async (_, stored) => {
    expect(await verifyPassword('anything', stored)).toBe(false);
  });

  it('keeps the dummy hash at the current cost, so an unknown email takes as long as a wrong password', async () => {
    expect(DUMMY_PASSWORD_HASH).toMatch(
      /^scrypt\$131072\$8\$1\$[\w-]{22}\$[\w-]{86}$/,
    );
    expect(await verifyPassword('password', DUMMY_PASSWORD_HASH)).toBe(false);
  });
});
