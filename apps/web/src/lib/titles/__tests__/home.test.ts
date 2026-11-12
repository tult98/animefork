// @vitest-environment jsdom
import fetchMock from 'fetch-mock';
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { FetchTransport, upstream } from '../../../test/fetch-transport.ts';
import {
  MOCK_SEASON_PATH,
  mockHomeHtml,
  mockNewEpisodesHtml,
  mockSeasonHtml,
} from '../__mockData__/index.ts';
import {
  fetchHome,
  fetchNewEpisodes,
  fetchSeason,
  japaneseSeasonPath,
  NEW_EPISODES_PATH,
  parseHome,
  parseNewEpisodes,
  parseSeason,
} from '../home.ts';
import { TitleSchema } from '../title.ts';

const transport = new FetchTransport();

describe('parseHome', () => {
  const home = parseHome(mockHomeHtml);

  it('lists 2 hero titles and 2 top titles', () => {
    expect(home.hero).toHaveLength(2);
    expect(home.top).toHaveLength(2);
  });

  it('keeps the hero and top lists apart, each in page order', () => {
    expect(home.hero.map((t) => t.name)).toEqual([
      'Shinja Zero no Megami-sama to Hajimeru Isekai Kouryaku',
      'Psyren',
    ]);
    expect(home.top.map((t) => t.name)).toEqual([
      'Black Clover 2nd Season',
      'Tonikaku Kawaii',
    ]);
  });

  it('takes the season path from the anime-season tab', () => {
    expect(home.seasonPath).toBe(MOCK_SEASON_PATH);
  });

  it('gives every hero and top title its genres and description', () => {
    for (const title of [...home.hero, ...home.top]) {
      expect(title.genres.length, title.name).toBeGreaterThan(0);
      expect(title.description, title.name).toBeTruthy();
    }
  });

  it('only yields titles that pass TitleSchema', () => {
    for (const title of [...home.hero, ...home.top]) {
      expect(TitleSchema.safeParse(title).success, title.name).toBe(true);
    }
  });

  it('has no season path when the page has no season tab', () => {
    const html = mockHomeHtml.replace(
      'data-tag="anime-season"',
      'data-tag="x"',
    );
    expect(parseHome(html).seasonPath).toBeNull();
  });
});

describe('parseNewEpisodes', () => {
  const titles = parseNewEpisodes(mockNewEpisodesHtml);

  it('lists 2 titles, newest first', () => {
    expect(titles.map((t) => t.name)).toEqual([
      'Ushiro no Shoumen Kamui-san',
      'Psyren',
    ]);
  });

  it('shows the episode label, views, rating, year, quality and studio of a title', () => {
    expect(titles[0]).toMatchObject({
      episodeLabel: 'Tập 19',
      views: 315099,
      rating: 8.8,
      year: 2026,
      quality: 'HD',
      studio: 'Zero-G, ZG-R',
    });
  });

  it('skips a title without an episode label and keeps the rest', () => {
    const bare =
      '<li class="TPostMv"><a href="/phim/bare-a1/"><img src="/p.jpg"><h2 class="Title">Bare</h2></a></li>';
    const parsed = parseNewEpisodes(
      mockNewEpisodesHtml.replace(
        '<li class="TPostMv">',
        `${bare}<li class="TPostMv">`,
      ),
    );
    expect(parsed).toHaveLength(2);
    expect(parsed.map((t) => t.name)).not.toContain('Bare');
  });

  it('lists nothing, without an error, for a page with no titles', () => {
    expect(parseNewEpisodes('<html><body></body></html>')).toEqual([]);
  });
});

describe('parseSeason', () => {
  it('lists every title of the season page', () => {
    expect(parseSeason(mockSeasonHtml).map((t) => t.name)).toEqual([
      'Season One',
      'Season Two',
    ]);
  });

  it('leaves the studio empty when the season page does not name one', () => {
    const [first] = parseSeason(mockSeasonHtml);
    expect(first?.studio).toBeUndefined();
    expect(first?.genres.length).toBeGreaterThan(0);
  });
});

describe('fetchHome', () => {
  it('shows 2 hero titles and the season path of the home page', async () => {
    fetchMock.get(upstream('/'), mockHomeHtml);
    const home = await fetchHome(transport);
    expect(fetchMock.callHistory.called(upstream('/'))).toBe(true);
    expect(home.hero).toHaveLength(2);
    expect(home.seasonPath).toBe(MOCK_SEASON_PATH);
  });

  it('fails on the bad rating of a title, and on nothing else', async () => {
    fetchMock.get(
      upstream('/'),
      mockHomeHtml.replace(
        /(<div class="MovieListSldCn"><ul>\s*<li[^>]*>.*?anime-avg-user-rating">)[^<]*/s,
        '$1not-a-rating',
      ),
    );
    const error = await fetchHome(transport).catch((e) => e);
    expect(error).toBeInstanceOf(ZodError);
    expect((error as ZodError).issues.map((i) => i.path.at(-1))).toEqual([
      'rating',
    ]);
  });

  it('fails with the status when the home page is down', async () => {
    fetchMock.get(upstream('/'), 503);
    await expect(fetchHome(transport)).rejects.toThrow(/503/);
  });
});

describe('fetchSeason', () => {
  it('shows the titles of the season page the home page named', async () => {
    fetchMock.get(upstream('/'), mockHomeHtml);
    fetchMock.get(upstream(MOCK_SEASON_PATH), mockSeasonHtml);
    const home = await fetchHome(transport);
    const season = await fetchSeason(transport, home.seasonPath!);
    expect(fetchMock.callHistory.called(upstream(MOCK_SEASON_PATH))).toBe(true);
    expect(season.map((t) => t.name)).toEqual(['Season One', 'Season Two']);
  });

  it('fails with the status when the season page is missing', async () => {
    fetchMock.get(upstream('/season/none/1999/'), 404);
    await expect(fetchSeason(transport, '/season/none/1999/')).rejects.toThrow(
      /404/,
    );
  });
});

describe('japaneseSeasonPath', () => {
  it('turns the season path into the site list filtered to jp', () => {
    expect(japaneseSeasonPath('/season/autumn/2026/')).toBe(
      '/danh-sach/all/all/autumn/2026/all/all/jp/',
    );
    expect(japaneseSeasonPath('/season/winter/2027')).toBe(
      '/danh-sach/all/all/winter/2027/all/all/jp/',
    );
  });

  it('leaves a path in another shape as it is', () => {
    expect(japaneseSeasonPath('/anime-season/now/')).toBe('/anime-season/now/');
    expect(japaneseSeasonPath('/season/autumn/2026/trang-2.html')).toBe(
      '/season/autumn/2026/trang-2.html',
    );
  });

  it('reads the season from the jp list, not the all-countries page', async () => {
    const list = japaneseSeasonPath(MOCK_SEASON_PATH);
    fetchMock.get(upstream(list), mockSeasonHtml);
    const season = await fetchSeason(transport, list);
    expect(season).toHaveLength(2);
    expect(fetchMock.callHistory.called(upstream(list))).toBe(true);
  });
});

describe('fetchNewEpisodes', () => {
  it('reads the jp list from its own path', async () => {
    expect(NEW_EPISODES_PATH).toBe('/danh-sach/all/all/all/all/all/all/jp/');
    fetchMock.get(upstream(NEW_EPISODES_PATH), mockNewEpisodesHtml);
    expect(await fetchNewEpisodes(transport)).toHaveLength(2);
    expect(fetchMock.callHistory.called(upstream(NEW_EPISODES_PATH))).toBe(
      true,
    );
  });

  it('fails with the status when the list is unreachable', async () => {
    fetchMock.get(upstream(NEW_EPISODES_PATH), 404);
    await expect(fetchNewEpisodes(transport)).rejects.toThrow(/404/);
  });
});

describe('the upcoming block of the home page', () => {
  const NOW = Date.UTC(2026, 10, 11);
  const home = parseHome(mockHomeHtml, NOW);

  it('lists the Sắp chiếu titles with their label', () => {
    expect(home.upcoming).toHaveLength(4);
    expect(home.upcoming[0]).toMatchObject({
      name: 'countdown',
      episodeLabel: 'PV/12',
    });
  });

  it('counts a countdown down from now', () => {
    expect(home.upcoming[0]?.releasesAt).toBe(NOW + 7_200_000);
  });

  it('reads a date as an exact release time', () => {
    const dated = home.upcoming.find((t) => t.name === 'dated');
    expect(dated?.releasesAt).toBe(Date.UTC(2099, 0, 1));
  });

  it('keeps a title that only has a year, without a release time', () => {
    const yearOnly = home.upcoming.filter((t) => t.releasesAt === undefined);
    expect(yearOnly.map((t) => t.year)).toEqual([2022, 2030]);
  });

  it('lists nothing, without an error, when the page has no block', () => {
    const html = mockHomeHtml.replace('id="new-home"', 'id="other"');
    expect(parseHome(html, NOW).upcoming).toEqual([]);
  });

  it('skips a title without a poster and keeps the page', () => {
    const html = mockHomeHtml.replace(
      /(<section id="new-home">.*?<img[^>]*?) src="[^"]*"/s,
      '$1',
    );
    const parsed = parseHome(html, NOW);
    expect(parsed.upcoming).toHaveLength(3);
    expect(parsed.hero).toHaveLength(2);
  });
});
