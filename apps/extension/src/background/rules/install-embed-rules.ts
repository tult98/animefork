import { browser } from 'wxt/browser';

/**
 * Hosts that can be used as an embed provider.
 * Matches any TLD: animevietsub.id, animevietsub.xyz, www.animevietsub.tv, ...
 */
const EMBED_URL_REGEX =
  '^https?://([a-z0-9-]+\\.)*(?:animevietsub|googleapiscdn|fbcdns)\\.[a-z0-9.-]+/';
const EMBED_BRIDGE_REGEX = `${EMBED_URL_REGEX}[^#]*[?&]animevsub-embed-origins=[^&#]+`;
const EMBED_RULE_ID = 900_001;
const EMBED_BRIDGE_RULE_ID = 900_002;

/**
 * Allow `animevietsub.*` to be embedded in an iframe on any website by
 * stripping the headers that block framing.
 */
export async function installEmbedRules() {
  const extensionOrigin = new URL(browser.runtime.getURL('/')).origin;
  const embedBridgeCsp = `default-src 'none'; script-src ${extensionOrigin}; connect-src http: https:`;

  const removeRuleIds = [EMBED_RULE_ID, EMBED_BRIDGE_RULE_ID];

  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds });
  chrome.declarativeNetRequest.updateDynamicRules({
    addRules: [
      {
        id: EMBED_RULE_ID,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          responseHeaders: [
            {
              header: 'X-Frame-Options',
              operation: 'remove',
            },
            {
              header: 'Content-Security-Policy',
              operation: 'remove',
            },
            {
              header: 'Content-Security-Policy-Report-Only',
              operation: 'remove',
            },
          ],
        },
        condition: {
          regexFilter: EMBED_URL_REGEX,
          resourceTypes: ['sub_frame'],
        },
      },
      {
        id: EMBED_BRIDGE_RULE_ID,
        priority: 3,
        action: {
          type: 'modifyHeaders',
          responseHeaders: [
            {
              header: 'X-Frame-Options',
              operation: 'remove',
            },
            {
              header: 'Content-Security-Policy',
              operation: 'set',
              value: embedBridgeCsp,
            },
            {
              header: 'Content-Security-Policy-Report-Only',
              operation: 'remove',
            },
          ],
        },
        condition: {
          regexFilter: EMBED_BRIDGE_REGEX,
          resourceTypes: ['sub_frame'],
        },
      },
    ],
  });
}
