// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { ReplayTransport } from '../transport/replay-transport.ts';
import {
  EpisodeNotFoundError,
  EpisodeSchema,
  fetchWatchPage,
  parseWatchPage,
  selectEpisode,
} from './watch.ts';

const publicDir = resolve(import.meta.dirname, '../../../public');
const html = readFileSync(
  `${publicDir}/fixtures/default/phim/tonikaku-kawaii-a3860/xem-phim.html`,
  'utf8',
);
const SLUG = 'tonikaku-kawaii-a3860';

describe('parseWatchPage', () => {
  it('reads the poster and description when the page has them', () => {
    const page = parseWatchPage(html, SLUG);
    expect(page.image).toBe('/fixtures/sample-poster.svg');
    expect(page.description).toBe('Mô tả ngắn của phim cho bản mẫu.');
    const bare = parseWatchPage(
      html
        .replace(/<div class="Image">.*?<\/div>/s, '')
        .replace(/<div class="Description">.*?<\/div>/s, ''),
      SLUG,
    );
    expect(bare.image).toBeUndefined();
    expect(bare.description).toBeUndefined();
  });

  it('reads the title and every episode with its player keys', () => {
    const page = parseWatchPage(html, SLUG);
    expect(page.title).toBe('Tonikaku Kawaii [BD]');
    expect(page.episodes.map((e) => e.id)).toEqual([
      '72839',
      '73010',
      '73386',
      '73701',
      '74002',
    ]);
    expect(page.episodes[1]).toEqual({
      id: '73010',
      hash: 'fixture-hash-73010',
      play: 'api',
      label: 'Tập 2',
    });
  });

  it('strips the leading Xem from the first episode label', () => {
    expect(parseWatchPage(html, SLUG).episodes[0]).toEqual({
      id: '72839',
      hash: 'fixture-hash-72839',
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
      'tonikaku-kawaii-2nd-season-a4476',
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
    expect(page.episodes).toHaveLength(5);
    expect(page.episodes[0]?.play).toBe('api');
  });

  it('rejects a page with no episodes so a blank player is an error', () => {
    const empty = html.replace(/<li class="episode.*?<\/li>/gs, '');
    expect(() => parseWatchPage(empty, SLUG)).toThrow(ZodError);
  });

  it('rejects an episode without a hash', () => {
    expect(
      EpisodeSchema.safeParse({ id: '1', play: 'api', label: 'Tập 1' }).success,
    ).toBe(false);
  });
});

describe('fetchWatchPage', () => {
  it('reads /phim/<slug>/xem-phim.html through the transport', async () => {
    const transport = new ReplayTransport({
      fetchImpl: async (input) =>
        new Response(readFileSync(`${publicDir}${String(input)}`, 'utf8'), {
          status: 200,
        }),
    });
    const page = await fetchWatchPage(transport, SLUG);
    expect(page.currentEpisode.label).toBe('Tập 1_BD_Full');
  });
});
