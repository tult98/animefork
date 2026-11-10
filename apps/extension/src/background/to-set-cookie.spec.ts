import { describe, expect, test } from 'vitest';

import { toSetCookie } from './to-set-cookie';

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
  'a=b; Domain=x.com; Path=/; Expires=Sun, 17 Mar 2030 17:46:40 GMT; HttpOnly; Secure; SameSite=None',
  'sid=a%20b%3Bc%3Dd%2C%C3%A9%2F%25; Domain=.x.com; Path=/p; SameSite=None',
  'k=; SameSite=None',
  't=v; Domain=h; Path=/; Expires=Thu, 01 Jan 1970 03:25:45 GMT; HttpOnly; SameSite=None',
];

describe('toSetCookie', () => {
  test.each(corpus.map((item, i) => [item.name, item, i] as const))(
    '%s serializes with Expires from expirationDate in epoch seconds',
    (_name, item, i) => {
      expect(toSetCookie(item)).toBe(expected[i]);
    },
  );
});
