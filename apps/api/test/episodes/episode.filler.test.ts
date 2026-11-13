import { describe, expect, it, vi } from 'vitest';
import type { MalClient } from '../../src/mal/mal.client.ts';
import { MalFiller } from '../../src/mal/mal.filler.ts';
import { MemoryMalStore } from '../../src/mal/mal.store.ts';
import { createEpisodeSiteClient } from '../../src/episodes/episode.client.ts';
import {
  EpisodeFiller,
  MAX_QUEUED_LISTS,
} from '../../src/episodes/episode.filler.ts';
import { MemoryEpisodeStore } from '../../src/episodes/episode.store.ts';
import { EPISODE_AIRING_REFRESH_AFTER_MS } from '../../src/episodes/episode.retry.ts';
import { candidate } from '../mal/helpers.ts';

const INPUT = {
  slug: 'black-clover-a1',
  name: 'Black Clover',
  year: 2017,
  episodeCount: 170,
};

const row = (n: number, title: string) =>
  `<tr class="episode-list-data"><td class="episode-number nowrap" data-raw="${n}">${n}</td><td class="episode-title"><a href="x">${title}</a></td></tr>`;
const listPage = `<table class="episode_list">${row(1, 'The Boy')}${row(2, 'The Door')}</table>`;

function setup(
  airing: 'finished_airing' | 'currently_airing' = 'finished_airing',
) {
  let t = new Date('2026-01-01T00:00:00Z').getTime();
  const now = () => new Date(t);
  const malStore = new MemoryMalStore(now);
  const episodeStore = new MemoryEpisodeStore();
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () => new Response(listPage),
  );
  const site = createEpisodeSiteClient({
    fetch,
    limiter: { wait: async () => undefined, pause: () => undefined },
    sleep: async () => undefined,
  });
  const translate = vi.fn(async (text: string) => `vi ${text}`);
  const episodes = new EpisodeFiller(
    episodeStore,
    site,
    { title: { translate }, synopsis: { translate } },
    now,
  );
  const client: MalClient = {
    search: async () => [candidate({ id: 7, airing })],
    stats: async () => null,
  };
  const filler = new MalFiller(malStore, client, now, null, episodes);
  const urls = () => fetch.mock.calls.map(([url]) => String(url));
  return {
    filler,
    malStore,
    episodeStore,
    fetch,
    urls,
    translate,
    advance: (ms: number) => (t += ms),
  };
}

describe('episode names on a MAL fill', () => {
  it('asks MAL for one list page and stores the translated titles', async () => {
    const { filler, episodeStore, urls } = setup();

    await filler.fill(INPUT);

    expect(urls()).toEqual(['https://myanimelist.net/anime/7/x/episode']);
    expect(episodeStore.rows.get('7:2')).toMatchObject({
      title: 'The Door',
      titleVi: 'vi The Door',
      synopsisFetched: false,
    });
  });

  it('keeps the MAL row ok when MAL is down', async () => {
    const { filler, malStore, fetch, episodeStore } = setup();
    fetch.mockResolvedValue(new Response('down', { status: 503 }));

    await filler.fill(INPUT);

    expect((await malStore.find([INPUT.slug])).get(INPUT.slug)?.status).toBe(
      'ok',
    );
    expect(episodeStore.attempts.get(7)?.status).toBe('failed');
  });

  it('makes no MAL request on a later lookup inside the settled window', async () => {
    const { filler, malStore, fetch, advance } = setup();
    await filler.fill(INPUT);

    advance(EPISODE_AIRING_REFRESH_AFTER_MS * 30);
    await filler.ensureEpisodes((await malStore.find([INPUT.slug])).values());
    await filler.idle();

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('reads an airing show again after a day', async () => {
    const { filler, malStore, urls, advance } = setup('currently_airing');
    await filler.fill(INPUT);
    const rows = () => malStore.find([INPUT.slug]).then((m) => m.values());

    advance(EPISODE_AIRING_REFRESH_AFTER_MS - 1000);
    await filler.ensureEpisodes(await rows());
    await filler.idle();
    expect(urls()).toHaveLength(1);

    advance(2000);
    await filler.ensureEpisodes(await rows());
    await filler.idle();
    expect(urls()).toHaveLength(2);
  });

  it('reads one list at a time and drops targets past the queue cap', async () => {
    const release: (() => void)[] = [];
    const list = vi.fn(
      () =>
        new Promise<null>((resolve) => {
          release.push(() => resolve(null));
        }),
    );
    const filler = new EpisodeFiller(
      new MemoryEpisodeStore(),
      { list },
      null,
      () => new Date(),
    );
    const targets = Array.from({ length: MAX_QUEUED_LISTS + 10 }, (_, i) => ({
      slug: `s${i}`,
      malId: i + 1,
      airing: null,
    }));

    await filler.ensure(targets);
    await vi.waitFor(() => expect(list).toHaveBeenCalledTimes(1));

    expect(targets.filter((t) => filler.has(t.malId))).toHaveLength(
      MAX_QUEUED_LISTS + 1,
    );
    while (release.length > 0 || filler.has(1)) {
      release.shift()?.();
      await new Promise((r) => setImmediate(r));
    }
    expect(list).toHaveBeenCalledTimes(MAX_QUEUED_LISTS + 1);
  });
});
