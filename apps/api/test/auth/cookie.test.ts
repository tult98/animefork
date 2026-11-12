import { describe, expect, it } from 'vitest';
import { readCookie, serializeCookie } from '../../src/auth/cookie.ts';

describe('cookie', () => {
  it('reads one cookie out of a Cookie header', () => {
    const header = 'theme=dark; session=abc-_123; other="x"';
    expect(readCookie(header, 'session')).toBe('abc-_123');
    expect(readCookie(header, 'other')).toBe('x');
    expect(readCookie(header, 'missing')).toBeUndefined();
    expect(readCookie(undefined, 'session')).toBeUndefined();
    expect(readCookie('sessionx=1; xsession=2', 'session')).toBeUndefined();
    expect(readCookie('session=', 'session')).toBe('');
  });

  it('serializes HttpOnly, SameSite=Lax, Path=/ and Secure only when asked', () => {
    expect(
      serializeCookie('session', 'tok', { maxAgeSeconds: 90.7, secure: true }),
    ).toBe('session=tok; Max-Age=90; Path=/; HttpOnly; SameSite=Lax; Secure');
    expect(
      serializeCookie('session', '', { maxAgeSeconds: -5, secure: false }),
    ).toBe('session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax');
  });
});
