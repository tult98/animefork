import allowlist from '../../../config/allowlist.json';
import { EXTRA } from '../../shared/env';

const mapUa = {
  firefox:
    'Mozilla/5.0 (Windows NT 6.1; Win64; x64; rv:47.0) Gecko/20100101 Firefox/47.0',
  chrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36 Edg/114.0.1823.41',
  gbot: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  ybot: 'Mozilla/5.0 (compatible; YandexAccessibilityBot/3.0; +http://yandex.com/bots)',
  achrome:
    'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36',
  aedge:
    'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36 Edg/114.0.1823.41',
} as const;

let addedGoogleUserContent = false;
const typesUa = Object.keys(mapUa) as (keyof typeof mapUa)[];
let currentId = 1;

export function createRule(endsWith: string, referer: string) {
  const rules: chrome.declarativeNetRequest.Rule[] = [
    {
      id: currentId++,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          {
            header: 'Referer',
            operation: 'set',
            value: referer,
          },
        ],
      },
      condition: {
        urlFilter: endsWith + '|',
        resourceTypes: ['xmlhttprequest'],
      },
    },
    {
      id: currentId++,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          {
            header: 'Referer',
            operation: 'set',
            value: referer,
          },
        ],
        responseHeaders: [
          {
            header: 'Access-Control-Allow-Origin',
            operation: 'set',
            value: '*',
          },
          {
            header: 'Access-Control-Allow-Methods',
            operation: 'set',
            value: 'PUT, GET, HEAD, POST, DELETE, OPTIONS',
          },
        ],
      },
      condition: {
        urlFilter: endsWith + EXTRA + '|',
        resourceTypes: ['xmlhttprequest', 'image', 'media'],
        initiatorDomains: allowlist.hosts,
      },
    },
  ];

  // add rules set header Origin
  for (let i = 0, length = rules.length; i < length; i++) {
    {
      const newRule = {
        ...JSON.parse(JSON.stringify(rules[i])),
        id: currentId++,
      };
      newRule.action.requestHeaders?.push({
        header: 'Origin',
        operation: 'set',
        value: referer ? new URL(referer).origin : '',
      });
      newRule.condition = {
        urlFilter: newRule.condition.urlFilter?.slice(0, -1) + 'o|',
        resourceTypes: ['xmlhttprequest'],
      };
      rules.push(newRule);
    }

    {
      const newRule2 = {
        ...JSON.parse(JSON.stringify(rules[i])),
        id: currentId++,
      };
      newRule2.action.requestHeaders!.push({
        header: 'Origin',
        operation: 'remove',
      });
      newRule2.condition.urlFilter =
        newRule2.condition.urlFilter.slice(0, -1) + 'ro|';
      rules.push(newRule2);
    }
  }

  rules.forEach((rule) => {
    typesUa.forEach((typeUa) => {
      const ruleCloned = JSON.parse(JSON.stringify(rule));
      ruleCloned.id = currentId++;
      ruleCloned.action.requestHeaders?.push({
        header: 'User-Agent',
        operation: 'set',
        value: mapUa[typeUa],
      });
      ruleCloned.condition.urlFilter =
        ruleCloned.condition.urlFilter?.slice(0, -1) + '_ua' + typeUa + '|';

      rules.push(ruleCloned);
    });
  });

  if (!addedGoogleUserContent) {
    rules.push(
      {
        id: currentId++,
        priority: 999,
        action: {
          type: 'modifyHeaders',
          requestHeaders: [
            {
              header: 'Accept-Encoding',
              operation: 'set',
              value: 'gzip, deflate, br, zstd',
            },
            {
              header: 'Origin',
              operation: 'remove',
            },
            {
              header: 'Priority',
              operation: 'set',
              value: 'i',
            },
            {
              header: 'Referer',
              operation: 'set',
              value: 'https://lh3.googleusercontent.com/',
            },
            {
              header: 'Sec-Fetch-Dest',
              operation: 'set',
              value: 'image',
            },
            {
              header: 'Sec-Fetch-Mode',
              operation: 'set',
              value: 'no-cors',
            },
            {
              header: 'Sec-Fetch-Site',
              operation: 'set',
              value: 'cross-site',
            },
            {
              header: 'Sec-Gpc',
              operation: 'set',
              value: '1',
            },
          ],
          responseHeaders: [
            {
              header: 'Access-Control-Allow-Origin',
              operation: 'set',
              value: '*',
            },
            {
              header: 'Access-Control-Allow-Methods',
              operation: 'set',
              value: 'PUT, GET, HEAD, POST, DELETE, OPTIONS',
            },
          ],
        },
        condition: {
          // urlFilter: endsWith + GA + "|",
          regexFilter:
            '^https?://([a-zA-Z0-9-]+\\.)?googleusercontent\\.[a-zA-Z]{2,}(/|$)',
          resourceTypes: ['xmlhttprequest', 'image', 'media'],
          initiatorDomains: allowlist.hosts,
        },
      },
      {
        id: currentId++,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          requestHeaders: [
            {
              header: 'Origin',
              operation: 'remove',
            },
            {
              header: 'Referer',
              operation: 'remove',
            },
            {
              header: 'Sec-Fetch-Mode',
              operation: 'remove',
            },
            {
              header: 'Sec-Fetch-Site',
              operation: 'remove',
            },
            {
              header: 'Sec-Gpc',
              operation: 'remove',
            },
          ],
          responseHeaders: [
            {
              header: 'Access-Control-Allow-Origin',
              operation: 'set',
              value: '*',
            },
            {
              header: 'Access-Control-Allow-Methods',
              operation: 'set',
              value: 'PUT, GET, HEAD, POST, DELETE, OPTIONS',
            },
          ],
        },
        condition: {
          urlFilter: '#rm-origin|',
          resourceTypes: ['xmlhttprequest', 'image', 'media'],
          initiatorDomains: allowlist.hosts,
        },
      },
    );
    addedGoogleUserContent = true;
  }

  return rules;
}
