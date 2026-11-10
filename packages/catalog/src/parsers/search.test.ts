import { describe, expect, it } from 'vitest';
import { SearchSuggestionSchema } from '../schemas.ts';
import { fixture, mutate, parseErrorOf } from '../test/fixture.ts';
import { parseSearchSuggestions } from './search.ts';

const html = fixture('pre-search.synthetic.html');

describe('parseSearchSuggestions (synthetic fixture)', () => {
  const suggestions = parseSearchSuggestions(html);

  it('matches the snapshot', () => {
    expect(suggestions).toMatchSnapshot();
  });

  it('passes the schema', () => {
    expect(
      suggestions.every((s) => SearchSuggestionSchema.safeParse(s).success),
    ).toBe(true);
  });

  it('skips the "enter to search" row', () => {
    expect(suggestions.map((s) => s.name)).toEqual([
      'Tonikaku Kawaii 2nd Season',
      'Tonikaku Kawaii: SNS',
      'Tonikaku Kawaii [BD]',
    ]);
  });

  it('reads the poster from the inline background style', () => {
    expect(suggestions[0]).toEqual({
      id: 'a4476',
      path: '/phim/tonikaku-kawaii-2nd-season-a4476/',
      name: 'Tonikaku Kawaii 2nd Season',
      image:
        'http://cdn.animevietsub.cc/data/poster/2022/02/24/animevsub-vziyRxKpU1.jpg',
      status: 'Preview VietSub',
    });
  });

  it('returns an empty list when nothing matched the query', () => {
    expect(
      parseSearchSuggestions(
        '<li class="ss-bottom"><a href="/tim-kiem/x/">Enter</a></li>',
      ),
    ).toEqual([]);
  });

  it('names the poster selector when the row stops carrying a background image', () => {
    const error = parseErrorOf(() =>
      parseSearchSuggestions(
        mutate(html, 'background-image: url', 'background: url'),
      ),
    );
    expect(error.selector).toBe('a[style*=background-image]');
    expect(error.field).toBe('0.image');
  });

  it('names the title selector when the title class is renamed', () => {
    const error = parseErrorOf(() =>
      parseSearchSuggestions(html.replaceAll('ss-title', 'renamed')),
    );
    expect(error.selector).toBe('.ss-title');
  });
});
