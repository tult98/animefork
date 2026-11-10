import { browser } from 'wxt/browser';

let referrers: Record<string, string>,
  promiseGetReferrers: ReturnType<typeof getReferrers>;
export async function getReferrers(): Promise<Record<string, string>> {
  if (referrers) return referrers;
  if (promiseGetReferrers) return promiseGetReferrers;

  return (promiseGetReferrers = browser.storage.sync
    .get('referrers')
    .then((res) => (referrers = res as Record<string, string>)));
}
