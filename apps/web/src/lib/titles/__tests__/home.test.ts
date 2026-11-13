// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import {
  MOCK_SEASON_PATH,
  mockHomeHtml,
  mockNewEpisodesHtml,
} from '../__mockData__/index.ts';
import { japaneseSeasonPath, parseHome, parseNewEpisodes } from '../home.ts';

describe('the home page', () => {
  it('lists the hero and top titles apart, in page order, with the season path', () => {
    const home = parseHome(mockHomeHtml);
    expect(home.hero.map((t) => t.name)).toEqual([
      'Shinja Zero no Megami-sama to Hajimeru Isekai Kouryaku',
      'Psyren',
    ]);
    expect(home.top.map((t) => t.name)).toEqual([
      'Black Clover 2nd Season',
      'Tonikaku Kawaii',
    ]);
    expect(home.seasonPath).toBe(MOCK_SEASON_PATH);
    for (const title of [...home.hero, ...home.top]) {
      expect(title.genres.length, title.name).toBeGreaterThan(0);
      expect(title.description, title.name).toBeTruthy();
    }
  });

  it('has no season path when the page has no season tab', () => {
    const html = mockHomeHtml.replace(
      'data-tag="anime-season"',
      'data-tag="x"',
    );
    expect(parseHome(html).seasonPath).toBeNull();
  });

  it('counts the upcoming titles down to a release time, a date, or nothing', () => {
    const NOW = Date.UTC(2026, 10, 11);
    const { upcoming } = parseHome(mockHomeHtml, NOW);
    expect(upcoming.map((t) => [t.name, t.releasesAt, t.year])).toEqual([
      ['countdown', NOW + 7_200_000, undefined],
      ['dated', Date.UTC(2099, 0, 1), undefined],
      ['year-only-a', undefined, 2022],
      ['year-only-b', undefined, 2030],
    ]);
  });

  it('skips an upcoming title without a poster and keeps the page', () => {
    const html = mockHomeHtml.replace(
      /(<section id="new-home">.*?<img[^>]*?) src="[^"]*"/s,
      '$1',
    );
    const parsed = parseHome(html);
    expect(parsed.upcoming).toHaveLength(3);
    expect(parsed.hero).toHaveLength(2);
  });
});

describe('a home page with a bad title', () => {
  it('fails on a title with a bad rating, not on anything else', () => {
    const html = mockHomeHtml.replace(
      /(<div class="MovieListSldCn"><ul>\s*<li[^>]*>.*?anime-avg-user-rating">)[^<]*/s,
      '$1not-a-rating',
    );
    let error: unknown;
    try {
      parseHome(html);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ZodError);
    expect((error as ZodError).issues.map((i) => i.path.at(-1))).toEqual([
      'rating',
    ]);
  });
});

describe('the new episodes list', () => {
  it('shows the titles newest first, with what each card says about its episode', () => {
    const titles = parseNewEpisodes(mockNewEpisodesHtml);
    expect(titles.map((t) => t.name)).toEqual([
      'Ushiro no Shoumen Kamui-san',
      'Psyren',
    ]);
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
    const titles = parseNewEpisodes(
      mockNewEpisodesHtml.replace(
        '<li class="TPostMv">',
        `${bare}<li class="TPostMv">`,
      ),
    );
    expect(titles.map((t) => t.name)).toEqual([
      'Ushiro no Shoumen Kamui-san',
      'Psyren',
    ]);
  });
});

describe('japaneseSeasonPath', () => {
  it('filters a season path to the jp list and leaves other paths alone', () => {
    expect(japaneseSeasonPath('/season/autumn/2026/')).toBe(
      '/danh-sach/all/all/autumn/2026/all/all/jp/',
    );
    expect(japaneseSeasonPath('/anime-season/now/')).toBe('/anime-season/now/');
  });
});
