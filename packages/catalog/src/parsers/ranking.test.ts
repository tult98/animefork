import { describe, expect, it } from 'vitest';
import { RankListSchema } from '../schemas.ts';
import { fixture, mutate, parseErrorOf } from '../test/fixture.ts';
import { parseAjaxItem } from './ajax-item.ts';
import { parseRanking } from './ranking.ts';

describe('parseRanking (real capture, 2022)', () => {
  const html = fixture('bang-xep-hang.html');
  const list = parseRanking(html);

  it('matches the snapshot', () => {
    expect(list).toMatchSnapshot();
  });

  it('passes the schema', () => {
    expect(RankListSchema.safeParse(list).success).toBe(true);
  });

  it('reads the first entry', () => {
    expect(list.entries[0]).toEqual({
      rank: 1,
      id: 'a1',
      path: '/phim/one-piece-dao-hai-tac-a1/',
      name: 'One Piece - Đảo Hải Tặc',
      image:
        'http://cdn.animevietsub.cc/data/poster/2019/09/27/animevsub-sQCBqYz9ve.jpg',
      otherName: 'Vua Hải Tặc (1999)',
      episodeLabel: 'Tập 1035',
    });
  });

  it('numbers entries in page order', () => {
    expect(list.entries.map((e) => e.rank)).toEqual(
      list.entries.map((_, i) => i + 1),
    );
  });

  it('falls back to the row background when an entry has no thumbnail', () => {
    const noImg = mutate(
      html,
      /<img width="45" height="60" src="[^"]*"[^>]*>/,
      '',
    );
    expect(parseRanking(noImg).entries[0]?.image).toBe(
      'http://cdn.animevietsub.cc/data/banner/2022/07/31/animevsub-NxQxhIAgug.png',
    );
  });

  it('names the container when the list is renamed', () => {
    const error = parseErrorOf(() =>
      parseRanking(mutate(html, 'bxh-movie-phimletv', 'bxh-renamed')),
    );
    expect(error.selector).toBe('.bxh-movie-phimletv');
    expect(error.parser).toBe('ranking');
  });

  it('names the title link when entries lose it', () => {
    const error = parseErrorOf(() =>
      parseRanking(html.replaceAll('title-item', 'renamed-item')),
    );
    expect(error.selector).toBe('.title-item a');
  });
});

describe('parseAjaxItem (synthetic fixture)', () => {
  const html = fixture('ajax-item.synthetic.html');
  const list = parseAjaxItem(html);

  it('matches the snapshot', () => {
    expect(list).toMatchSnapshot();
  });

  it('ranks cards by position', () => {
    expect(list.entries.map((e) => [e.rank, e.id])).toEqual([
      [1, 'a4536'],
      [2, 'a1'],
    ]);
  });

  it('keeps rating optional', () => {
    expect(list.entries[0]?.rating).toBe(9.4);
    expect(list.entries[1]?.rating).toBeUndefined();
  });

  it('names .TPost when the fragment has no cards', () => {
    const error = parseErrorOf(() => parseAjaxItem('<div>maintenance</div>'));
    expect(error.selector).toBe('.TPost');
    expect(error.parser).toBe('ajax-item');
  });

  it('names the image selector when a card loses its picture', () => {
    const error = parseErrorOf(() =>
      parseAjaxItem(mutate(html, /<img src=/, '<img data-src=')),
    );
    expect(error.selector).toBe('img[src]');
  });
});
