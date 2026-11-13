import { describe, expect, it, vi } from 'vitest';
import {
  createEpisodeSiteClient,
  type EpisodeSiteClient,
} from '../../src/episodes/episode.client.ts';
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
    syncEpisodes([61967], {
      store,
      site,
      translators,
      log: () => undefined,
    });
  return { site, store, run };
}

const fakeTranslators = (): EpisodeTranslators => ({
  title: { translate: vi.fn(async (t: string) => `vi ${t}`) },
  synopsis: { translate: vi.fn(async (t: string) => `vi ${t}`) },
});

describe('syncEpisodes with MAL pages', () => {
  const run = async (episodePage: string) => {
    const fetch = vi.fn(async (url: string | URL | Request) =>
      String(url).endsWith('/episode')
        ? new Response(
            '<table class="episode_list"><tr class="episode-list-data"><td class="episode-number nowrap" data-raw="1">1</td><td class="episode-title"><a href="/x">The Battle Begins</a></td></tr></table>',
          )
        : new Response(episodePage),
    );
    const store = new MemoryEpisodeStore();
    await syncEpisodes([61967], {
      store,
      site: createEpisodeSiteClient({ fetch, sleep: async () => undefined }),
      translators: null,
      log: () => undefined,
    });
    return {
      fetch,
      store,
      rerun: () =>
        syncEpisodes([61967], {
          store,
          site: createEpisodeSiteClient({
            fetch,
            sleep: async () => undefined,
          }),
          translators: null,
          log: () => undefined,
        }),
    };
  };

  it('marks an episode page with no synopsis yet as fetched, so it is read once', async () => {
    const { fetch, store, rerun } = await run(
      '<h2 class="fw-b">Synopsis</h2><div class="badresult al">Sorry, no synopsis yet.</div></div>',
    );
    expect(store.rows.get('61967:1')?.synopsisFetched).toBe(true);
    const calls = fetch.mock.calls.length;
    await rerun();
    expect(fetch.mock.calls.length).toBe(calls + 1);
  });

  it('does not mark an episode fetched when MAL answers a challenge page', async () => {
    const { store } = await run('<html><title>Just a moment...</title></html>');
    expect(store.rows.get('61967:1')?.synopsisFetched).toBe(false);
  });
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
