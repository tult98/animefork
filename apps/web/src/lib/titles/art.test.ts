// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { applyArt, fetchArt, NO_ART, type TitleArt } from './art.ts';
import { parseWatchPage } from './watch.ts';

const SLUG = 'tonikaku-kawaii-a3860';
const html = readFileSync(
  resolve(
    import.meta.dirname,
    '../../../public/fixtures/default/phim/tonikaku-kawaii-a3860/xem-phim.html',
  ),
  'utf8',
);
const env = { VITE_ART_API_URL: 'https://db.test/' };

function respond(titles: unknown, episodes: unknown): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) =>
    String(input).includes('/title_art?')
      ? Response.json(titles)
      : Response.json(episodes),
  ) as unknown as typeof fetch;
}

describe('fetchArt', () => {
  it('asks PostgREST for the slug anonymously and builds TMDB urls', async () => {
    const fetchImpl = respond(
      [
        {
          source_slug: SLUG,
          tmdb_id: 1,
          tmdb_season: 1,
          backdrop_path: '/b.jpg',
          backdrop_lang: 'vi',
        },
      ],
      [{ source_slug: SLUG, episode_number: 2, still_path: '/s2.jpg' }],
    );
    const art = await fetchArt(SLUG, { env, fetch: fetchImpl });
    expect(art.backdrop).toBe('https://image.tmdb.org/t/p/w1280/b.jpg');
    expect(art.stills.get(2)).toBe('https://image.tmdb.org/t/p/w300/s2.jpg');
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0]!;
    expect(String(url)).toMatch(
      /^https:\/\/db\.test\/title_art\?source_slug=eq\.tonikaku-kawaii-a3860&select=/,
    );
    expect(new Headers(init?.headers).has('authorization')).toBe(false);
  });

  it('sends the authorization header only when a key is set', async () => {
    const fetchImpl = respond([], []);
    await fetchArt(SLUG, {
      env: { ...env, VITE_ART_API_KEY: 'secret' },
      fetch: fetchImpl,
    });
    const [, init] = vi.mocked(fetchImpl).mock.calls[0]!;
    expect(new Headers(init?.headers).get('authorization')).toBe(
      'Bearer secret',
    );
  });

  it('makes no request without the API url', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    for (const partial of [{}, { VITE_ART_API_KEY: 'secret' }]) {
      expect(await fetchArt(SLUG, { env: partial, fetch: fetchImpl })).toBe(
        NO_ART,
      );
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('resolves to no art when the request fails, answers an error or throws', async () => {
    const failing: typeof fetch = async () => {
      throw new Error('offline');
    };
    const server: typeof fetch = async () =>
      new Response('{}', { status: 500 });
    expect(await fetchArt(SLUG, { env, fetch: failing })).toBe(NO_ART);
    expect(await fetchArt(SLUG, { env, fetch: server })).toBe(NO_ART);
  });

  it('drops rows that fail validation and keeps the rest', async () => {
    const art = await fetchArt(SLUG, {
      env,
      fetch: respond(
        [{ nonsense: true }],
        [
          { source_slug: SLUG, episode_number: 0, still_path: '/bad.jpg' },
          { source_slug: SLUG, episode_number: 3, still_path: '/ok.jpg' },
        ],
      ),
    });
    expect(art.backdrop).toBeUndefined();
    expect([...art.stills.keys()]).toEqual([3]);
  });
});

describe('applyArt', () => {
  const page = parseWatchPage(html, SLUG);

  it('returns the page untouched when there is no art', () => {
    expect(applyArt(page, NO_ART)).toBe(page);
  });

  it('replaces the image and only the thumbnails that have a still', () => {
    const art: TitleArt = {
      backdrop: 'https://image.tmdb.org/t/p/w1280/b.jpg',
      stills: new Map([
        [1, 'https://image.tmdb.org/t/p/w300/e1.jpg'],
        [3, 'https://image.tmdb.org/t/p/w300/e3.jpg'],
      ]),
    };
    const out = applyArt(page, art);
    expect(out.image).toBe(art.backdrop);
    expect(out.episodes.map((e) => e.thumbnail)).toEqual([
      'https://image.tmdb.org/t/p/w300/e1.jpg',
      undefined,
      'https://image.tmdb.org/t/p/w300/e3.jpg',
      undefined,
      undefined,
    ]);
    expect(out.currentEpisode.thumbnail).toBe(
      'https://image.tmdb.org/t/p/w300/e1.jpg',
    );
  });

  it('keeps the source image when the title has stills but no backdrop', () => {
    const out = applyArt(page, {
      stills: new Map([[2, 'https://image.tmdb.org/t/p/w300/e2.jpg']]),
    });
    expect(out.image).toBe(page.image);
    expect(out.episodes[1]?.thumbnail).toBe(
      'https://image.tmdb.org/t/p/w300/e2.jpg',
    );
  });
});
