import { describe, expect, it } from 'vitest';
import { EpisodeSchema, TitleDetailSchema } from '../schemas.ts';
import { fixture, mutate, parseErrorOf } from '../test/fixture.ts';
import { parseDetail, parseEpisodes } from './detail.ts';

const html = fixture('phim/tonikaku-kawaii-a3860.html');
const watchHtml = fixture('phim/tonikaku-kawaii-a3860/xem-phim-72839.html');

describe('parseDetail (real capture, 2022)', () => {
  const detail = parseDetail(html);

  it('matches the snapshot', () => {
    expect(detail).toMatchSnapshot();
  });

  it('passes the schema', () => {
    expect(TitleDetailSchema.safeParse(detail).success).toBe(true);
  });

  it('reads the facts the plan lists for a title page', () => {
    expect(detail).toMatchObject({
      id: 'a3860',
      path: '/phim/tonikaku-kawaii-a3860/',
      name: 'Tonikaku Kawaii [BD]',
      format: 'Anime bộ',
      country: 'Nhật Bản',
      director: 'Ikehata Hiroshi',
      seasonLabel: 'Mùa Thu - 2020',
      airingStatus: 'Full',
      followers: 2791,
      trailer: 'https://www.youtube.com/embed/3M7w-ROU62U',
      rating: 9.6,
    });
  });

  it('keeps the format tag out of the genre list', () => {
    expect(detail.genres?.map((g) => g.name)).toEqual([
      'Shounen',
      'Romance',
      'Comedy',
    ]);
  });

  it('falls back to the newest-episode links on a title page', () => {
    expect(detail.episodes.map((e) => e.name)).toEqual([
      'Tập 12_END',
      'Tập 11',
      'Tập 10',
    ]);
    expect(detail.episodes[0]?.hash).toBeUndefined();
  });

  it('reads related titles that carry no genres', () => {
    expect(detail.related.length).toBeGreaterThan(0);
    expect(detail.related.every((t) => t.genres === undefined)).toBe(true);
  });

  it('treats the literal "None" age rating as absent', () => {
    expect(detail.ageRating).toBeUndefined();
    const rated = mutate(
      html,
      '<span class="imdb">None</span>',
      '<span class="imdb">PG-13</span>',
    );
    expect(parseDetail(rated).ageRating).toBe('PG-13');
  });

  it('keeps optional facts optional when a row is missing', () => {
    const noTrailer = mutate(html, /<iframe[^>]*youtube[^>]*><\/iframe>/, '');
    const parsed = parseDetail(noTrailer);
    expect(parsed.trailer).toBeUndefined();
    expect(parsed.name).toBe('Tonikaku Kawaii [BD]');
  });
});

describe('parseDetail drift', () => {
  it('names .Title when the heading class is renamed', () => {
    const broken = html.replaceAll('class="Title"', 'class="Heading"');
    const error = parseErrorOf(() => parseDetail(broken));
    expect(error.selector).toBe('.Title');
    expect(error.parser).toBe('detail');
  });

  it('names the watch button when the page no longer says which title it is', () => {
    const broken = mutate(
      html,
      'watch_button_more',
      'watch_renamed',
    ).replaceAll('class="active"', '');
    const error = parseErrorOf(() => parseDetail(broken));
    expect(error.selector).toBe('.watch_button_more');
  });

  it('names the poster selector when the image is gone', () => {
    const broken = mutate(
      html,
      '<figure class="Objf"><img ',
      '<figure class="Objf"><img data-x ',
    ).replace(/(<figure class="Objf"><img data-x [^>]*?)src=/, '$1data-src=');
    const error = parseErrorOf(() => parseDetail(broken));
    expect(error.selector).toBe('.Image img');
    expect(error.field).toBe('image');
  });
});

describe('parseEpisodes (real watch page)', () => {
  const episodes = parseEpisodes(watchHtml);

  it('matches the snapshot', () => {
    expect(episodes).toMatchSnapshot();
  });

  it('lists every episode with its player token', () => {
    expect(episodes).toHaveLength(12);
    expect(episodes.every((e) => EpisodeSchema.safeParse(e).success)).toBe(
      true,
    );
    expect(
      episodes.every((e) => e.play === 'api' && e.hash !== undefined),
    ).toBe(true);
    expect(episodes[0]).toMatchObject({ id: '72839', name: 'Tập 01_BD_Full' });
  });

  it('names the episode selector when the list disappears', () => {
    const broken = watchHtml.replaceAll('list-episode', 'list-renamed');
    const error = parseErrorOf(() => parseEpisodes(broken));
    expect(error.selector).toBe('#list-server .list-episode .episode a');
  });
});
