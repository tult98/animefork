import { describe, expect, it } from 'vitest';
import { HomeSchema } from '../schemas.ts';
import { fixture, mutate, parseErrorOf } from '../test/fixture.ts';
import { parseHome } from './home.ts';

const html = fixture('index.html');

describe('parseHome (real capture, 2022)', () => {
  const home = parseHome(html);

  it('matches the snapshot', () => {
    expect(home).toMatchSnapshot();
  });

  it('passes the schema', () => {
    expect(HomeSchema.safeParse(home).success).toBe(true);
  });

  it('finds every section with the counts the old app saw', () => {
    expect(
      Object.fromEntries(
        Object.entries(home).map(([key, titles]) => [key, titles.length]),
      ),
    ).toEqual({
      thisSeason: 16,
      carousel: 10,
      lastUpdate: 10,
      preRelease: 10,
      nominate: 10,
      hotUpdate: 5,
    });
  });

  it('derives the id from the slug suffix', () => {
    expect(home.nominate[0]).toMatchObject({
      id: 'a1',
      path: '/phim/one-piece-dao-hai-tac-a1/',
    });
  });

  it('leaves genres and description off cards that carry none', () => {
    for (const title of [...home.thisSeason, ...home.hotUpdate]) {
      expect(title.genres).toBeUndefined();
      expect(title.description).toBeUndefined();
      expect(title.rating).toBeGreaterThan(0);
    }
    expect(home.carousel.every((t) => (t.genres?.length ?? 0) > 0)).toBe(true);
  });

  it('drops the carousel vote count that is not a score', () => {
    expect(home.carousel.every((t) => t.rating === undefined)).toBe(true);
  });

  it('keeps the release date of pre-release cards, or just the year', () => {
    const dates = home.preRelease.map((t) => t.releaseTime);
    expect(dates).toContain('2022-11-09');
    expect(dates).toContain('2022');
  });

  it('labels episode progress from the card or from the progress counter', () => {
    expect(home.thisSeason[0]?.episodeLabel).toBe('11');
    expect(home.carousel[0]?.episodeLabel).toBe('11/13');
  });
});

describe('parseHome drift', () => {
  it.each([
    ['#new-home', 'id="new-home"', 'id="renamed-home"'],
    ['.MovieListSldCn', 'class="MovieListSldCn"', 'class="Renamed"'],
    ['#showTopPhim', 'id="showTopPhim"', 'id="renamed"'],
  ])('names %s when the section container disappears', (selector, from, to) => {
    const error = parseErrorOf(() => parseHome(mutate(html, from, to)));
    expect(error.selector).toBe(selector);
    expect(error.parser).toBe('home');
  });

  it('names the image selector when a card loses its picture', () => {
    const broken = mutate(
      html,
      'src="http://cdn.animevietsub.cc/data/poster/2022/06/03/animevsub-FOWOKDAhpl.jpg"',
      'data-lazy="x"',
    );
    const error = parseErrorOf(() => parseHome(broken));
    expect(error.field).toMatch(/\.image$/);
    expect(error.selector).toBe('img[src]');
  });

  it('names the link selector when a card loses its anchor', () => {
    const broken = mutate(
      html,
      '<a href="http://animevietsub.cc/phim/call-of-the-night-a4536/" title="Yofukashi no Uta (2022)">',
      '<span>',
    );
    const error = parseErrorOf(() => parseHome(broken));
    expect(error.selector).toBe('a[href]');
    expect(error.field).toMatch(/^thisSeason\.0\.(id|path)$/);
  });

  it('accepts a section that is present but empty', () => {
    const empty = mutate(
      html,
      /(<section id="new-home">)[\s\S]*?(<\/section>)/,
      '$1$2',
    );
    expect(parseHome(empty).preRelease).toEqual([]);
  });
});
