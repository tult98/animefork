import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { toSetCookie } from './to-set-cookie';

const NOW = Date.UTC(2026, 0, 1, 0, 0, 0);

const corpus = [
  {
    name: 'a',
    value: 'b',
    domain: 'x.com',
    path: '/',
    httpOnly: true,
    secure: true,
    expirationDate: 1900000000.5,
  },
  {
    name: 'sid',
    value: 'a b;c=d,é/%',
    domain: '.x.com',
    path: '/p',
    httpOnly: false,
    secure: false,
  },
  {
    name: 'k',
    value: '',
    domain: '',
    path: '',
    httpOnly: false,
    secure: false,
    expirationDate: 0,
  },
  {
    name: 't',
    value: 'v',
    domain: 'h',
    path: '/',
    httpOnly: true,
    secure: false,
    expirationDate: 12345,
  },
];

const expected = [
  'a=b; Domain=x.com; Path=/; Expires=Thu, 22 Jan 2026 23:46:40 GMT; HttpOnly; Secure; SameSite=None',
  'sid=a%20b%3Bc%3Dd%2C%C3%A9%2F%25; Domain=.x.com; Path=/p; SameSite=None',
  'k=; SameSite=None',
  't=v; Domain=h; Path=/; Expires=Thu, 01 Jan 2026 00:00:12 GMT; HttpOnly; SameSite=None',
];

describe('toSetCookie', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  test.each(corpus.map((item, i) => [item.name, item, i] as const))(
    '%s matches the cookie@0.5.0 output',
    (_name, item, i) => {
      expect(toSetCookie(item)).toBe(expected[i]);
    },
  );
});
