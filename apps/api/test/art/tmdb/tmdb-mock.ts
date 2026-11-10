import { expect } from 'vitest';
import * as fx from './fixtures.ts';

export function mockTmdb(
  overrides: Record<string, unknown> = {},
): typeof fetch {
  return async (input) => {
    const url = new URL(String(input));
    const route = `${url.pathname}${url.searchParams.get('query') ? `?${url.searchParams.get('query')}` : ''}`;
    const table: Record<string, unknown> = {
      '/3/search/tv?Tonikaku Kawaii': fx.SEARCH_TONIKAWA,
      '/3/search/tv?Nothing Here': fx.SEARCH_NOTHING,
      '/3/search/tv?nothing': fx.SEARCH_NOTHING,
      '/3/tv/100': fx.DETAIL_100,
      '/3/tv/200': fx.DETAIL_200,
      '/3/tv/100/alternative_titles': fx.ALT_TITLES_100,
      '/3/tv/200/alternative_titles': fx.ALT_TITLES_200,
      '/3/tv/100/images': fx.IMAGES_100,
      '/3/tv/100/season/1': fx.SEASON_100_1,
      ...overrides,
    };
    expect(url.searchParams.get('api_key')).toBe('key');
    const body = table[route];
    return body === undefined
      ? new Response('{}', { status: 404 })
      : Response.json(body);
  };
}
