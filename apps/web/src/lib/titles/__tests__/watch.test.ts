// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { MOCK_WATCH_SLUG, mockWatchHtml } from '../__mockData__/index.ts';
import {
  EpisodeNotFoundError,
  EpisodeSchema,
  parseOtherNames,
  parseWatchPage,
  selectEpisode,
} from '../watch.ts';

const html = mockWatchHtml;
const SLUG = MOCK_WATCH_SLUG;

describe('parseWatchPage', () => {
  it('reads the poster when the page has one', () => {
    const page = parseWatchPage(html, SLUG);
    expect(page.image).toBe('/poster.svg');
    const bare = parseWatchPage(
      html.replace(/<div class="Image">.*?<\/div>/s, ''),
      SLUG,
    );
    expect(bare.image).toBeUndefined();
  });

  it('lists the title and its 3 episodes with their player keys', () => {
    const page = parseWatchPage(html, SLUG);
    expect(page.title).toBe('Tonikaku Kawaii [BD]');
    expect(page.episodes.map((e) => e.id)).toEqual(['72839', '73010', '73386']);
    expect(page.episodes[1]).toEqual({
      id: '73010',
      hash: 'hash-73010',
      play: 'api',
      label: 'Tập 2',
    });
  });

  it('strips the leading Xem from the first episode label', () => {
    expect(parseWatchPage(html, SLUG).episodes[0]).toEqual({
      id: '72839',
      hash: 'hash-72839',
      play: 'api',
      label: 'Tập 1_BD_Full',
    });
  });

  it('keeps a site title that differs from the label as the episode name', () => {
    const named = html.replace('title="Tập 02"', 'title="Tập 02 Special"');
    expect(parseWatchPage(named, SLUG).episodes[1]?.name).toBe(
      'Tập 02 Special',
    );
  });

  it('defaults to the first episode', () => {
    expect(parseWatchPage(html, SLUG).currentEpisode.id).toBe('72839');
  });

  it('selects another listed episode without touching the list', () => {
    const page = parseWatchPage(html, SLUG);
    const picked = selectEpisode(page, '73386');
    expect(picked.currentEpisode.id).toBe('73386');
    expect(picked.episodes).toEqual(page.episodes);
  });

  it('throws EpisodeNotFoundError for an id that is not listed', () => {
    expect(() => selectEpisode(parseWatchPage(html, SLUG), '1')).toThrow(
      EpisodeNotFoundError,
    );
  });

  it('lists the season siblings and marks the one for the slug', () => {
    const page = parseWatchPage(html, SLUG);
    expect(page.seasons.map((s) => s.slug)).toEqual([
      'tonikaku-kawaii-a3860',
      'tonikaku-kawaii-sns-a4229',
    ]);
    expect(page.currentSeason).toEqual({
      slug: SLUG,
      name: 'Phần TV Series',
    });
  });

  it('falls back to a single season named after the title', () => {
    const bare = html.replace(/<div class="season_item">.*?<\/div>/s, '');
    const page = parseWatchPage(bare, SLUG);
    expect(page.seasons).toEqual([
      { slug: SLUG, name: 'Tonikaku Kawaii [BD]' },
    ]);
  });

  it('drops a duplicate episode listed under a second server', () => {
    const doubled = html.replace(
      '</ul></div>',
      '</ul></div><div class="server"><ul class="list-episode">' +
        '<li class="episode"><a data-id="72839" data-play="fb" data-hash="x">01</a></li></ul></div>',
    );
    const page = parseWatchPage(doubled, SLUG);
    expect(page.episodes).toHaveLength(3);
    expect(page.episodes[0]?.play).toBe('api');
  });

  it('rejects a page with no episodes so a blank player is an error', () => {
    const empty = html.replace(/<li class="episode.*?<\/li>/gs, '');
    expect(() => parseWatchPage(empty, SLUG)).toThrow(ZodError);
  });

  it('reads the subtitle as the other names of the show', () => {
    expect(parseWatchPage(html, SLUG).otherNames).toEqual([
      'TONIKAWA: Over the Moon For You',
    ]);
  });

  it('leaves the other names out for a page without a subtitle', () => {
    const none = html.replace(/<h2 class="SubTitle">.*?<\/h2>/, '');
    expect(parseWatchPage(none, SLUG)).not.toHaveProperty('otherNames');
    const blank = html.replace(
      /<h2 class="SubTitle">.*?<\/h2>/,
      '<h2 class="SubTitle">  </h2>',
    );
    expect(parseWatchPage(blank, SLUG)).not.toHaveProperty('otherNames');
  });

  it('rejects an episode without a hash', () => {
    expect(
      EpisodeSchema.safeParse({ id: '1', play: 'api', label: 'Tập 1' }).success,
    ).toBe(false);
  });
});

describe('parseOtherNames', () => {
  it('splits a ranking entry and drops its year and episode', () => {
    expect(parseOtherNames('Soul Land, Douluo Dalu (2018) Tập 228')).toEqual([
      'Soul Land',
      'Douluo Dalu',
    ]);
  });

  it('splits on semicolons and spaced slashes, and drops a trailing Full', () => {
    expect(parseOtherNames('Fate/Zero; Fate Zero / Fate Zero Full')).toEqual([
      'Fate/Zero',
      'Fate Zero',
    ]);
  });

  it('reads nothing from an empty or blank subtitle', () => {
    expect(parseOtherNames('')).toEqual([]);
    expect(parseOtherNames(' , ; Tập 12 ')).toEqual([]);
  });

  it('keeps a single name whole', () => {
    expect(parseOtherNames('  TONIKAWA: Over the Moon For You ')).toEqual([
      'TONIKAWA: Over the Moon For You',
    ]);
  });

  it('drops repeats, ignoring case, and a name equal to the page title', () => {
    expect(
      parseOtherNames('Soul Land, SOUL LAND, Đấu La Đại Lục', 'Đấu La Đại Lục'),
    ).toEqual(['Soul Land']);
  });

  it('keeps at most 5 names of at most 120 characters', () => {
    const long = 'x'.repeat(121);
    expect(parseOtherNames(`A, ${long}, B, C, D, E, F`)).toEqual([
      'A',
      'B',
      'C',
      'D',
      'E',
    ]);
  });
});
