import type { BundlePath, Target } from './targets';

export interface ManifestInput {
  displayName: string;
  description: string;
  /** Single version source: apps/extension/package.json. */
  version: string;
  /** From allowlist.json. Parsed by the caller so this function stays pure. */
  hosts: readonly string[];
}

const bundle = (p: BundlePath) => `./${p}`;

/** Pure: the same input gives the same manifest in dev and prod. */
export function manifestFor(target: Target, input: ManifestInput) {
  const icon = './assets/icon-512.png';
  return {
    manifest_version: 3,
    name: input.displayName,
    version: input.version,
    description: input.description,
    // Chrome runs a service worker, Firefox an event page. Both load the same IIFE file.
    background: target.gecko
      ? { scripts: [bundle('dist/background/index.js')] }
      : { service_worker: bundle('dist/background/index.js') },
    icons: { 16: icon, 48: icon, 128: icon },
    ...(target.gecko && {
      browser_specific_settings: {
        gecko: {
          id: '{26005fb7-3d84-4144-a688-a058944123b3}',
          strict_min_version: '128.0',
        },
      },
    }),
    permissions: [
      'activeTab',
      'scripting',
      'cookies',
      'declarativeNetRequest',
      'storage',
    ],
    host_permissions: ['*://*/*'],
    content_scripts: [
      {
        matches: input.hosts.flatMap((host) => [
          `http://${host}/*`,
          `https://${host}/*`,
        ]),
        all_frames: true,
        run_at: 'document_start',
        js: [bundle('dist/contentScripts/index.global.js')],
      },
      {
        matches: ['<all_urls>'],
        all_frames: true,
        run_at: 'document_start',
        js: [bundle('dist/contentScripts/inject.global.js')],
      },
    ],
    web_accessible_resources: [
      {
        resources: [
          'dist/contentScripts/inject2.global.js',
          'dist/contentScripts/embed.global.js',
        ] satisfies BundlePath[],
        matches: ['<all_urls>'],
      },
    ],
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'",
    },
  };
}
