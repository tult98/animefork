import { z } from 'zod';
import {
  SearchSuggestionSchema,
  titleIdFromPath,
  type SearchSuggestion,
} from '../schemas.ts';
import {
  backgroundImageOf,
  loadHtml,
  orUndefined,
  pathOf,
  text,
  validate,
  type FieldSelectors,
} from './dom.ts';

const PARSER = 'search';

const SEARCH_SELECTORS: FieldSelectors = {
  id: 'a[href]',
  path: 'a[href]',
  name: '.ss-title',
  image: 'a[style*=background-image]',
  status: 'p',
};

/** `POST /ajax/suggest`: a list of `li` rows, ending in an "Enter to search" row that is not a result. */
export function parseSearchSuggestions(html: string): SearchSuggestion[] {
  const $ = loadHtml(html);
  const rows = $('li:not(.ss-bottom)')
    .toArray()
    .map((li) => {
      const row = $(li);
      const path = pathOf(row.find('a').first().attr('href'));
      return {
        id: path === undefined ? undefined : titleIdFromPath(path),
        path,
        name: orUndefined(text(row.find('.ss-title').first())),
        image: backgroundImageOf(row.find('a').first().attr('style')),
        status: orUndefined(text(row.find('p').first())),
      };
    });
  return validate(
    PARSER,
    z.array(SearchSuggestionSchema),
    rows,
    SEARCH_SELECTORS,
  );
}
