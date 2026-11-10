import { defineConfig } from 'wxt';

import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  srcDir: 'src',
  outDir: 'dist',
  manifestVersion: 3,
  imports: { eslintrc: { enabled: 9 } },
  manifest: ({ browser }) => ({
    name: pkg.displayName,
    description: pkg.description,
    icons: { 16: 'icon.png', 48: 'icon.png', 128: 'icon.png' },
    permissions: [
      'activeTab',
      'scripting',
      'cookies',
      'declarativeNetRequest',
      'storage',
    ],
    host_permissions: ['*://*/*'],
    // The injector loads these two page-world scripts with a <script src> tag.
    web_accessible_resources: [
      { resources: ['embed.js', 'page-patch.js'], matches: ['<all_urls>'] },
    ],
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'",
    },
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: '{26005fb7-3d84-4144-a688-a058944123b3}',
          strict_min_version: '128.0',
        },
      },
    }),
  }),
});
