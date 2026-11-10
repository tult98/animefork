import { browser } from 'wxt/browser';

import { toSetCookie } from './to-set-cookie';

export async function mergeSetCookie(headers: Headers, url: string) {
  const obj = Object.fromEntries(headers.entries());
  obj['set-cookie'] = (await browser.cookies.getAll({ url }))
    .map((item) => toSetCookie(item))
    .join(',');

  return obj;
}

export async function setCookie(url: string, cookie: string) {
  return Promise.all(
    cookie.split(';').map(async (item) => {
      const equal = item.indexOf('=');
      if (equal === -1) return;

      const name = item.slice(0, equal);
      const value = item.slice(equal + 1);

      await chrome.cookies.set({
        domain: new URL(url).hostname,
        name,
        path: '/',
        value,
        url,
        httpOnly: true,
        secure: false,
        storeId: '0',
      });
    }),
  );
}
