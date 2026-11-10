import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { run } from '../src/run.ts';
import type { ArtSink } from '../src/sync.ts';
import { mapEpisodes } from '../src/sync.ts';
import { createTmdbClient } from '../src/tmdb.ts';
import * as fx from './fixtures.ts';

function mockTmdb(overrides: Record<string, unknown> = {}): typeof fetch {
  return async (input) => {
    const url = new URL(String(input));
    const route = `${url.pathname}${url.searchParams.get('query') ? `?${url.searchParams.get('query')}` : ''}`;
    const table: Record<string, unknown> = {
      '/3/search/tv?Tonikaku Kawaii': fx.SEARCH_TONIKAWA,
      '/3/search/tv?Nothing Here': fx.SEARCH_NOTHING,
      '/3/tv/100': fx.DETAIL_100,
      '/3/tv/200': fx.DETAIL_200,
      '/3/tv/100/images': fx.IMAGES_100,
      '/3/tv/100/season/1': fx.SEASON_100_1,
      ...overrides,
    };
    expect(url.searchParams.get('api_key')).toBe('key');
    const body = table[route];
    return body === undefined
      ? new Response('{}', { status: 404 })
      : Response.json(body);
  };
}

function titlesFile(titles: unknown[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'art-sync-'));
  const file = join(dir, 'titles.json');
  writeFileSync(file, JSON.stringify(titles));
  return file;
}

describe('mapEpisodes', () => {
  const episodes = [
    { episode_number: 1, still_path: '/a.jpg' },
    { episode_number: 2, still_path: null },
    { episode_number: 3, still_path: '/c.jpg' },
  ];

  it('writes no row for an episode without a still', () => {
    expect(mapEpisodes('s', episodes, 0).map((r) => r.episode_number)).toEqual([
      1, 3,
    ]);
  });

  it('shifts numbers by the offset and drops those outside the source range', () => {
    expect(
      mapEpisodes('s', episodes, 12, 14).map((r) => r.episode_number),
    ).toEqual([13]);
  });
});

describe('createTmdbClient', () => {
  it('validates response shapes', async () => {
    const client = createTmdbClient({
      apiKey: 'key',
      fetch: async () => Response.json({ results: [{ id: 'x' }] }),
    });
    await expect(client.searchTv('a')).rejects.toThrow();
  });

  it('requests images in vi, en and textless', async () => {
    let seen = '';
    const client = createTmdbClient({
      apiKey: 'key',
      fetch: async (input) => {
        seen = String(input);
        return Response.json({ backdrops: [] });
      },
    });
    await client.tvImages(5);
    expect(new URL(seen).searchParams.get('include_image_language')).toBe(
      'vi,en,null',
    );
  });
});

describe('art-sync dry run against a mocked TMDB', () => {
  const env = { TMDB_API_KEY: 'key' };

  it('matches, skips and counts without a database', async () => {
    const file = titlesFile([
      {
        slug: 'tonikaku-kawaii-a3860',
        name: 'Tonikaku Kawaii',
        year: 2020,
        episodeCount: 12,
      },
      { slug: 'nothing-a1', name: 'Nothing Here' },
    ]);
    const report = await run([file], env, mockTmdb());
    expect(report.mode).toBe('dry-run');
    expect(report.matches).toEqual([
      {
        slug: 'tonikaku-kawaii-a3860',
        tmdbId: 100,
        season: 1,
        probability: 1,
        backdrop: { path: '/en.jpg', lang: 'en' },
        stills: 2,
      },
    ]);
    expect(report.skipped).toEqual([
      { slug: 'nothing-a1', reason: 'no TMDB search results' },
    ]);
    expect(report.counts).toEqual({
      titles: 2,
      matched: 1,
      skipped: 1,
      withBackdrop: 1,
      withStills: 1,
      episodeRows: 2,
    });
  });

  it('skips a title whose season TMDB does not have', async () => {
    const file = titlesFile([
      {
        slug: 's5',
        name: 'Tonikaku Kawaii',
        seasonName: 'Season 5',
        year: 2020,
      },
    ]);
    const report = await run([file], env, mockTmdb());
    expect(report.skipped[0]?.reason).toMatch(/no season 5/);
  });

  it('records a TMDB failure as a skip instead of aborting', async () => {
    const file = titlesFile([
      { slug: 'a', name: 'Tonikaku Kawaii', year: 2020 },
      { slug: 'b', name: 'Nothing Here' },
    ]);
    const report = await run(
      [file],
      env,
      mockTmdb({ '/3/tv/100/images': undefined }),
    );
    expect(report.skipped.map((s) => s.slug)).toEqual(['a', 'b']);
    expect(report.skipped[0]?.reason).toMatch(/^error:/);
  });

  it('writes through DATABASE_URL only when it is set and --dry-run is absent', async () => {
    const file = titlesFile([
      { slug: 'tonikaku-kawaii-a3860', name: 'Tonikaku Kawaii', year: 2020 },
    ]);
    const writes: { titles: unknown[]; episodes: unknown[] }[] = [];
    const urls: string[] = [];
    const createSink = (url: string): ArtSink => {
      urls.push(url);
      return {
        async write(titles, episodes) {
          writes.push({ titles, episodes });
        },
      };
    };
    const live = { ...env, DATABASE_URL: 'postgres://db.test/art' };

    const forced = await run([file, '--dry-run'], live, mockTmdb(), createSink);
    expect(forced.mode).toBe('dry-run');
    const absent = await run([file], env, mockTmdb(), createSink);
    expect(absent.mode).toBe('dry-run');
    expect(writes).toEqual([]);

    const report = await run([file], live, mockTmdb(), createSink);
    expect(report.mode).toBe('write');
    expect(urls).toEqual(['postgres://db.test/art']);
    expect(writes).toHaveLength(1);
    expect(writes[0]?.titles).toHaveLength(1);
  });

  it('requires an API key and a titles file', async () => {
    await expect(run([], env)).rejects.toThrow(/Usage/);
    await expect(run([titlesFile([])], {})).rejects.toThrow(/TMDB_API_KEY/);
  });
});
