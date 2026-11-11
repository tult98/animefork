import { browser } from 'wxt/browser';

import referrersDefault from '../../config/map-referer.json';
import { registerHttpProxy } from '../background/http-proxy';
import { getReferrers } from '../background/referrers';
import { installEmbedRules } from '../background/rules/install-embed-rules';
import { installReferrers } from '../background/rules/install-referrers';
import { onMessage } from '../shared/messages';

export default defineBackground(() => {
  // setup install rules default
  const setup = Promise.all([
    installReferrers(referrersDefault),
    getReferrers().then((referrers) =>
      installReferrers(referrers as Record<string, string>),
    ),
  ]);

  // The embed rules are optional: never let a failure here break the HTTP API.
  installEmbedRules().catch((error) => {
    console.error('[Animefork Helper] Failed to install embed rules:', error);
  });

  onMessage('set:referrers', async ({ data }) => {
    await setup;
    await installReferrers(data);
  });

  registerHttpProxy(setup);

  onMessage('tabs', async ({ data }) => {
    const tabs = browser.tabs as unknown as Record<
      string,
      (...args: unknown[]) => unknown
    >;
    return tabs[data.type]!.apply(browser.tabs, data.args);
  });
});
