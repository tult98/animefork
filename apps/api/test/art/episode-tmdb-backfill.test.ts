import { describe, expect, it, vi } from 'vitest';
import { EpisodeInfoService } from '../../src/episodes/episode-info.service.ts';
import { MemoryEpisodeStore } from '../../src/episodes/episode.store.ts';
import { MemoryMalStore } from '../../src/mal/mal.store.ts';
import { setup, TONIKAWA } from './helpers.ts';
import { mockTmdb } from './tmdb/tmdb-mock.ts';

const { slug } = TONIKAWA;

function recording(gate?: Promise<void>) {
  const calls: string[] = [];
  const base = mockTmdb();
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push(`${url.pathname}?language=${url.searchParams.get('language')}`);
    if (gate) await gate;
    return base(input, init);
  };
  return { calls, fetch: fetchImpl };
}

// A season-scope title matched before episode text was stored: no rows, overview already settled.
async function matchedBefore(world: ReturnType<typeof setup>) {
  await world.store.saveMatched({
    title: {
      source_slug: slug,
      tmdb_id: 100,
      tmdb_season: 1,
      match_scope: 'season',
      backdrop_path: '/b.jpg',
      backdrop_lang: 'en',
      poster_path: '/p.jpg',
      poster_lang: 'vi',
      source_name: TONIKAWA.name,
      source_year: 2020,
      source_episode_count: 12,
      matched_by: 'baseline',
    },
    episodes: [
      { source_slug: slug, episode_number: 1, still_path: '/old.jpg' },
    ],
  });
  await world.store.saveOverview(slug, 100, {
    status: 'ok',
    text: 'Tóm tắt.',
    lang: 'vi',
    translated: false,
  });
}

describe('episode text backfill for a matched title', () => {
  it('makes one season call, stores names and overviews, and leaves art alone', async () => {
    const tmdb = recording();
    const translate = vi.fn(async (text: string) => `vi ${text}`);
    const world = setup({ fetch: tmdb.fetch, translator: { translate } });
    await matchedBefore(world);
    const before = structuredClone(world.store.titles.get(slug));

    await world.service.lookup({ titles: [TONIKAWA] });
    await world.filler.idle();

    expect(tmdb.calls).toEqual(['/3/tv/100/season/1?language=vi']);
    expect(translate.mock.calls).toEqual([['Nasa meets Tsukasa.']]);
    const info = await world.store.tmdbEpisodes(slug);
    expect(info.get(1)).toMatchObject({
      name: 'Fateful Meeting',
      overview: 'Nasa meets Tsukasa.',
      overviewVi: 'vi Nasa meets Tsukasa.',
    });
    expect(info.get(2)).toMatchObject({ overviewVi: 'Nasa gặp lại Tsukasa.' });
    expect(world.store.titles.get(slug)).toEqual(before);
    expect([...(await world.store.episodes(slug))]).toEqual([[1, '/old.jpg']]);
  });

  it('makes no TMDB request on a second lookup inside the window', async () => {
    const tmdb = recording();
    const world = setup({ fetch: tmdb.fetch });
    await matchedBefore(world);

    await world.service.lookup({ titles: [TONIKAWA] });
    await world.filler.idle();
    await world.service.lookup({ titles: [TONIKAWA] });
    await world.filler.idle();

    expect(tmdb.calls).toHaveLength(1);
    expect((await world.store.episodeInfoSync([slug])).get(slug)?.status).toBe(
      'ok',
    );
  });

  it('keeps the English rows when the translator fails and retries without a TMDB call', async () => {
    const tmdb = recording();
    let at = new Date('2026-01-01T00:00:00Z');
    const translate = vi
      .fn<(text: string) => Promise<string>>()
      .mockRejectedValueOnce(new Error('deepseek down'))
      .mockImplementation(async (text) => `vi ${text}`);
    const world = setup({
      fetch: tmdb.fetch,
      now: () => at,
      translator: { translate },
    });
    await matchedBefore(world);

    await world.service.lookup({ titles: [TONIKAWA] });
    await world.filler.idle();

    expect((await world.store.tmdbEpisodes(slug)).get(1)).toMatchObject({
      overview: 'Nasa meets Tsukasa.',
      overviewVi: null,
    });
    expect((await world.store.episodeInfoSync([slug])).get(slug)?.status).toBe(
      'failed',
    );

    at = new Date(at.getTime() + 11 * 60_000);
    await world.service.lookup({ titles: [TONIKAWA] });
    await world.filler.idle();

    expect(tmdb.calls).toHaveLength(1);
    expect((await world.store.tmdbEpisodes(slug)).get(1)?.overviewVi).toBe(
      'vi Nasa meets Tsukasa.',
    );
    expect((await world.store.episodeInfoSync([slug])).get(slug)?.status).toBe(
      'ok',
    );
  });
});

describe('GET /v1/episodes/:slug for a title without episode text', () => {
  it('answers from stored rows and schedules the job without a TMDB call in the request', async () => {
    let open: () => void = () => undefined;
    const tmdb = recording(new Promise<void>((resolve) => (open = resolve)));
    const world = setup({
      fetch: tmdb.fetch,
      translator: { translate: async (text) => `vi ${text}` },
    });
    await matchedBefore(world);
    const service = new EpisodeInfoService(
      new MemoryMalStore(),
      null,
      new MemoryEpisodeStore(),
      world.store,
      () => new Date(),
      world.filler,
    );

    const first = await service.get(slug);

    expect(first).toEqual({ status: 'pending', episodes: [] });
    expect(tmdb.calls).not.toContain('/3/tv/100/season/1?language=vi');

    open();
    await world.filler.idle();
    const second = await service.get(slug);

    expect(tmdb.calls).toEqual(['/3/tv/100/season/1?language=vi']);
    expect(second.status).toBe('ready');
    expect(second.episodes[0]).toMatchObject({
      number: 1,
      title: 'Fateful Meeting',
      synopsis: 'Nasa meets Tsukasa.',
      synopsisVi: 'vi Nasa meets Tsukasa.',
    });
  });
});
