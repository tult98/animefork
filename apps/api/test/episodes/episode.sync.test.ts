import { describe, expect, it, vi } from 'vitest';
import type { EpisodeSiteClient } from '../../src/episodes/episode.client.ts';
import { MemoryEpisodeStore } from '../../src/episodes/episode.store.ts';
import { syncEpisodes } from '../../src/episodes/episode.sync.ts';
import type { EpisodeTranslators } from '../../src/episodes/episode.translate.ts';

const listed = [
  { number: 1, title: 'The Battle Begins', titleAlt: null, aired: null },
  { number: 2, title: 'The Door to Hell', titleAlt: null, aired: null },
];

function setup(translators: EpisodeTranslators | null) {
  const site = {
    list: vi.fn(async () => listed),
    synopsis: vi.fn(async (_id: number, n: number) =>
      n === 1 ? null : 'A door opens.',
    ),
  } satisfies EpisodeSiteClient;
  const store = new MemoryEpisodeStore();
  const run = () =>
    syncEpisodes([61967], { store, site, translators, log: () => undefined });
  return { site, store, run };
}

const fakeTranslators = (): EpisodeTranslators => ({
  title: { translate: vi.fn(async (t: string) => `vi ${t}`) },
  synopsis: { translate: vi.fn(async (t: string) => `vi ${t}`) },
});

describe('syncEpisodes', () => {
  it('stores each episode once and asks MAL for nothing on the second run', async () => {
    const translators = fakeTranslators();
    const { site, store, run } = setup(translators);

    await run();
    expect(site.synopsis.mock.calls).toEqual([
      [61967, 1],
      [61967, 2],
    ]);
    expect(store.rows.get('61967:2')).toMatchObject({
      title: 'The Door to Hell',
      titleVi: 'vi The Door to Hell',
      synopsis: 'A door opens.',
      synopsisVi: 'vi A door opens.',
    });
    expect(store.rows.get('61967:1')?.synopsis).toBeNull();

    await run();
    expect(site.synopsis).toHaveBeenCalledTimes(2);
    expect(translators.title.translate).toHaveBeenCalledTimes(2);
    expect(translators.synopsis.translate).toHaveBeenCalledTimes(1);
  });

  it('keeps the English and leaves Vietnamese empty without a translator, then fills it once a key exists', async () => {
    const { store, run } = setup(null);
    await run();
    expect(store.rows.get('61967:2')).toMatchObject({
      title: 'The Door to Hell',
      titleVi: null,
      synopsis: 'A door opens.',
      synopsisVi: null,
    });

    const translators = fakeTranslators();
    await syncEpisodes([61967], {
      store,
      site: setup(null).site,
      translators,
      log: () => undefined,
    });
    expect(store.rows.get('61967:2')?.synopsisVi).toBe('vi A door opens.');
  });

  it('stops after the limit', async () => {
    const { site, store } = setup(null);
    await syncEpisodes([61967], {
      store,
      site,
      translators: null,
      limit: 1,
      log: () => undefined,
    });
    expect(site.synopsis).toHaveBeenCalledTimes(1);
  });
});
