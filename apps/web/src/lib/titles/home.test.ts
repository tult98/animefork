// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { ReplayTransport } from '../transport/replay-transport.ts';
import {
  fetchHome,
  fetchNewEpisodes,
  fetchSeason,
  NEW_EPISODES_PATH,
  parseHome,
  parseNewEpisodes,
  parseSeason,
} from './home.ts';
import { TitleSchema } from './title.ts';

const publicDir = resolve(import.meta.dirname, '../../../public');
const read = (path: string) => readFileSync(`${publicDir}${path}`, 'utf8');

const diskFetch: typeof fetch = async (input) => {
  try {
    return new Response(read(String(input)), { status: 200 });
  } catch {
    return new Response('missing', { status: 404 });
  }
};

const replay = (set = 'default') =>
  new ReplayTransport({ baseUrl: `/fixtures/${set}`, fetchImpl: diskFetch });

const homeHtml = read('/fixtures/default/index.html');
const seasonLink = homeHtml.match(
  /<a href="([^"]+)"[^>]*data-tag="anime-season"/,
)?.[1];

describe('parseHome on the captured excerpt', () => {
  const home = parseHome(homeHtml);

  it('finds ten cards in the hero and top segments', () => {
    expect(home.hero).toHaveLength(10);
    expect(home.top).toHaveLength(10);
  });

  it('reads the season path from the anime-season tab', () => {
    expect(seasonLink).toBeTruthy();
    expect(home.seasonPath).toBe(seasonLink);
  });

  it('gives hero and top their genres and description', () => {
    for (const title of [...home.hero, ...home.top]) {
      expect(title.genres.length, title.name).toBeGreaterThan(0);
      expect(title.description, title.name).toBeTruthy();
    }
  });

  it('keeps the segments separate and in page order', () => {
    expect(home.hero[0]?.name).toBe(
      'Shinja Zero no Megami-sama to Hajimeru Isekai Kouryaku',
    );
    expect(home.top[0]?.name).toBe('Black Clover 2nd Season');
  });

  it('produces titles that pass TitleSchema', () => {
    for (const title of [...home.hero, ...home.top]) {
      expect(TitleSchema.safeParse(title).success, title.name).toBe(true);
    }
  });

  it('has no season path when the page has no season tab', () => {
    const html = homeHtml.replace('data-tag="anime-season"', 'data-tag="x"');
    expect(parseHome(html).seasonPath).toBeNull();
  });
});

const jpList = read(
  '/fixtures/default/danh-sach/all/all/all/all/all/all/jp.html',
);

describe('parseNewEpisodes', () => {
  const titles = parseNewEpisodes(jpList);

  it('reads every card of the first page of the jp list', () => {
    expect(titles).toHaveLength(10);
    expect(titles[0]?.name).toBe('Ushiro no Shoumen Kamui-san');
  });

  it('reads the episode label and views where the card has them', () => {
    expect(titles[0]).toMatchObject({
      episodeLabel: 'Tập 19',
      views: 315099,
      rating: 8.8,
      year: 2026,
      quality: 'HD',
      studio: 'Zero-G, ZG-R',
    });
  });

  it('drops a card without an episode label and keeps the rest', () => {
    const bare =
      '<li class="TPostMv"><a href="/phim/bare-a1/"><img src="/p.jpg"><h2 class="Title">Bare</h2></a></li>';
    const parsed = parseNewEpisodes(
      jpList.replace('<li class="TPostMv">', `${bare}<li class="TPostMv">`),
    );
    expect(parsed).toHaveLength(10);
    expect(parsed.map((t) => t.name)).not.toContain('Bare');
  });

  it('is empty rather than throwing on a page with no cards', () => {
    expect(parseNewEpisodes('<html><body></body></html>')).toEqual([]);
  });
});

describe('parseSeason', () => {
  it('reads every card of the season excerpt', () => {
    expect(
      parseSeason(read('/fixtures/default/season/autumn/2026.html')),
    ).toHaveLength(22);
  });

  it('leaves the studio unset where the season markup has no .Studio', () => {
    const [first] = parseSeason(
      read('/fixtures/default/season/autumn/2026.html'),
    );
    expect(first?.studio).toBeUndefined();
    expect(first?.genres.length).toBeGreaterThan(0);
  });
});

describe('fetchHome and fetchSeason through ReplayTransport', () => {
  it('fetches and parses the home fixture', async () => {
    const home = await fetchHome(replay());
    expect(home.hero).toHaveLength(10);
    expect(home.seasonPath).toBe(seasonLink);
  });

  it('fetches the season page at the path the home page named', async () => {
    const home = await fetchHome(replay());
    const season = await fetchSeason(replay(), home.seasonPath!);
    expect(season).toHaveLength(22);
  });

  it('rejects the invalid fixture on the bad rating, not on anything else', async () => {
    const error = await fetchHome(replay('invalid-title')).catch((e) => e);
    expect(error).toBeInstanceOf(ZodError);
    expect((error as ZodError).issues.map((i) => i.path.at(-1))).toEqual([
      'rating',
    ]);
  });

  it('rejects a missing season page with a status error', async () => {
    await expect(fetchSeason(replay(), '/season/none/1999/')).rejects.toThrow(
      /404/,
    );
  });
});

describe('fetchNewEpisodes through ReplayTransport', () => {
  it('reads the jp list from its own path', async () => {
    expect(NEW_EPISODES_PATH).toBe('/danh-sach/all/all/all/all/all/all/jp/');
    expect(await fetchNewEpisodes(replay())).toHaveLength(10);
  });

  it('rejects when the list is unreachable', async () => {
    await expect(fetchNewEpisodes(replay('no-such-set'))).rejects.toThrow(
      /404/,
    );
  });
});

describe('parseHome upcoming block', () => {
  const NOW = Date.UTC(2026, 10, 11);
  const home = parseHome(homeHtml, NOW);

  it('reads the Sắp chiếu cards from the fixture', () => {
    expect(home.upcoming).toHaveLength(11);
    expect(home.upcoming[0]).toMatchObject({
      name: 'Tsuki no Sakamichi',
      episodeLabel: 'PV/12',
      releasesAt: NOW + 7_200_000,
    });
  });

  it('reads a date span as an exact release time', () => {
    const umi = home.upcoming.find((t) => t.name === 'Umi no Shiro Gekijouban');
    expect(umi?.releasesAt).toBe(Date.UTC(2099, 0, 1));
  });

  it('keeps year-only cards with a year and no releasesAt', () => {
    const yearOnly = home.upcoming.filter((t) => t.releasesAt === undefined);
    expect(yearOnly.map((t) => t.year)).toEqual([2022, 2030, 2027, 2028, 2027]);
  });

  it('is empty, not an error, when the page has no block', () => {
    const html = homeHtml.replace('id="new-home"', 'id="other"');
    expect(parseHome(html, NOW).upcoming).toEqual([]);
  });

  it('drops an invalid upcoming card instead of failing the page', () => {
    const html = homeHtml.replace(
      /(<section id="new-home">.*?<img[^>]*?) src="[^"]*"/s,
      '$1',
    );
    const parsed = parseHome(html, NOW);
    expect(parsed.upcoming).toHaveLength(10);
    expect(parsed.hero).toHaveLength(10);
  });
});
