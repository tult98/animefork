import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export interface ScryptParams {
  N: number;
  r: number;
  p: number;
  keyLength: number;
  saltBytes: number;
}

export const SCRYPT_PARAMS: ScryptParams = {
  N: 2 ** 17,
  r: 8,
  p: 1,
  keyLength: 64,
  saltBytes: 16,
};

export const DUMMY_PASSWORD_HASH =
  'scrypt$131072$8$1$K193zNnBCPvFyshz223L8g$wBiDBzA-xY0bHnHzzjHjrNS4YEtiJYxy7vFnee_uBD3t7jCgpCbsV9S5Y3A6xHwqwLpzjtv8jDHFqGzVh_Ovpw';

const PREFIX = 'scrypt';

function derive(
  password: string,
  salt: Buffer,
  keyLength: number,
  { N, r, p }: Pick<ScryptParams, 'N' | 'r' | 'p'>,
): Promise<Buffer> {
  // Node's default 32 MiB cap is below the 128 * N * r bytes scrypt needs at these parameters.
  const maxmem = 2 * 128 * N * r;
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, { N, r, p, maxmem }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(
  password: string,
  params: ScryptParams = SCRYPT_PARAMS,
): Promise<string> {
  const { N, r, p, keyLength, saltBytes } = params;
  const salt = randomBytes(saltBytes);
  const key = await derive(password, salt, keyLength, { N, r, p });
  return [
    PREFIX,
    N,
    r,
    p,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$');
}

const PositiveInt = z.coerce.number().int().positive();
const Base64Url = z
  .string()
  .regex(/^[\w-]+$/)
  .transform((text) => Buffer.from(text, 'base64url'));
const StoredHashSchema = z.tuple([
  z.literal(PREFIX),
  PositiveInt,
  PositiveInt,
  PositiveInt,
  Base64Url,
  Base64Url,
]);

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parsed = StoredHashSchema.safeParse(stored.split('$'));
  if (!parsed.success) return false;
  const [, N, r, p, salt, key] = parsed.data;
  const candidate = await derive(password, salt, key.length, { N, r, p });
  return timingSafeEqual(candidate, key);
}
