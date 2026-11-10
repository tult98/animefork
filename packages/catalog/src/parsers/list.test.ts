import { describe, expect, it } from 'vitest';
import { ListPageSchema } from '../schemas.ts';
import { fixture, mutate, parseErrorOf } from '../test/fixture.ts';
import { parseList } from './list.ts';

const html = fixture('the-loai/list.synthetic.html');

describe('parseList (synthetic fixture)', () => {
  const list = parseList(html);

  it('matches the snapshot', () => {
    expect(list).toMatchSnapshot();
  });

  it('passes the schema', () => {
    expect(ListPageSchema.safeParse(list).success).toBe(true);
  });

  it('builds the title from the breadcrumb without the colon', () => {
    expect(list.title).toBe('Thể loại Hài Hước');
  });

  it('reads the pagination', () => {
    expect(list).toMatchObject({ page: 2, pageCount: 76 });
  });

  it('reads sorts from the query string and skips the "all" option', () => {
    expect(list.sorts).toEqual([
      { label: 'Mới nhất', value: 'new' },
      { label: 'Xem nhiều', value: 'views' },
    ]);
    expect(list.filters.type).toEqual([
      { label: 'Anime bộ', value: 'series', checked: true },
      { label: 'Anime lẻ', value: 'movie', checked: false },
    ]);
  });

  it('accepts cards with genres but no studio, as the plan measured for list pages', () => {
    expect(list.titles).toHaveLength(2);
    expect(list.titles[0]?.genres?.map((g) => g.name)).toEqual([
      'Fantasy',
      'Comedy',
    ]);
    expect(list.titles[0]?.studio).toBeUndefined();
  });

  it('defaults to page 1 of 1 when there is no pagination', () => {
    const single = mutate(html, /<div class="wp-pagenavi">[\s\S]*?<\/div>/, '');
    expect(parseList(single)).toMatchObject({ page: 1, pageCount: 1 });
  });
});

describe('parseList drift', () => {
  it('names .MovieList when the grid container is renamed', () => {
    const error = parseErrorOf(() =>
      parseList(mutate(html, 'class="MovieList"', 'class="Grid"')),
    );
    expect(error.selector).toBe('.MovieList');
    expect(error.parser).toBe('list');
  });

  it('rejects the home page, which has a grid but no breadcrumb', () => {
    const error = parseErrorOf(() => parseList(fixture('index.html')));
    expect(error.selector).toBe('.breadcrumb');
  });

  it('names the pagination selector when the page number is not a number', () => {
    const error = parseErrorOf(() =>
      parseList(
        mutate(html, 'class="current" data="2"', 'class="current" data="x"'),
      ),
    );
    expect(error.selector).toBe('.current');
    expect(error.field).toBe('page');
  });

  it('names the card link when a card loses its anchor', () => {
    const broken = mutate(
      html,
      /<a href="http:\/\/animevietsub\.cc\/phim\/linh-kiem-ton-a3396\/">/,
      '<span>',
    );
    expect(parseErrorOf(() => parseList(broken)).selector).toBe('a[href]');
  });
});
