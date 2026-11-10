// Guards what an already-published client (desktop-web pins 1.0.31) observes from a new
// extension, and what the new client exports.
import { describe, expect, test, vi } from 'vitest';

// nx-ignore-next-line
import clientPkg from '../client/package.json' with { type: 'json' };
import pkg from '../package.json' with { type: 'json' };

import { EMBED_CHANNEL, EMBED_VERSION } from './shared/embed-protocol';

describe('wire protocol', () => {
  test('embed channel and version are frozen', () => {
    expect([EMBED_CHANNEL, EMBED_VERSION]).toEqual(['__animevsub_embed__', 1]);
  });

  test('client export names do not shrink', async () => {
    // The client reads document.documentElement.dataset at import time.
    vi.stubGlobal('document', { documentElement: { dataset: {} } });
    // nx-ignore-next-line
    const client = await import('../client/src/index');
    expect(Object.keys(client).sort()).toEqual([
      'EMBED_CHANNEL',
      'EMBED_VERSION',
      'Http',
      'createEmbedBridge',
      'customReferer',
      'execTabs',
      'installEmbedGlobal',
      'isAnimevietsubHost',
      'isEmbedMessage',
      'matchOrigin',
      'serializeError',
      'setReferrers',
      'tabsApi',
    ]);
  });

  test('extension and client release in lockstep', () => {
    expect(clientPkg.version).toBe(pkg.version);
  });
});
