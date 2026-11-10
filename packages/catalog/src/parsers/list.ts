import { ListPageSchema, type ListPage } from '../schemas.ts';
import { CARD_SELECTORS, readCard } from './card.ts';
import {
  loadHtml,
  orUndefined,
  requireElement,
  text,
  validate,
  type CheerioAPI,
  type FieldSelectors,
} from './dom.ts';

const PARSER = 'list';

const LIST_SELECTORS: FieldSelectors = {
  ...CARD_SELECTORS,
  title: '.breadcrumb > li',
  page: '.current',
  pageCount: '.larger:last-child, .wp-pagenavi > *:last-child',
  sorts: '#filter .fc-main-list > li > a',
};

function pageNumber($: CheerioAPI, selector: string): number {
  const el = $(selector).first();
  return Number.parseInt(el.attr('data') ?? el.attr('title') ?? '1', 10);
}

function options($: CheerioAPI, group: string) {
  return $(`#filter ${group} label`)
    .toArray()
    .flatMap((label) => {
      const el = $(label);
      const value = el.find('input').attr('value');
      // "all" is the unfiltered state, not a choice.
      if (value === undefined || value === 'all') return [];
      return [
        { label: text(el), value, checked: el.attr('checked') !== undefined },
      ];
    });
}

export function parseList(html: string): ListPage {
  const $ = loadHtml(html);
  const list = requireElement(PARSER, $, '.MovieList');
  const breadcrumb = requireElement(PARSER, $, '.breadcrumb');

  const title = breadcrumb
    .find('> li')
    .toArray()
    .slice(1)
    .map((li) => text($(li)))
    .join(' ')
    .replace(/:/g, '')
    .replace(/^Danh sách /i, '');

  const sorts = $('#filter .fc-main-list > li > a')
    .toArray()
    .flatMap((a) => {
      const value = new URL(
        $(a).attr('href') ?? '',
        'http://base.invalid',
      ).searchParams.get('sort');
      return value === null ? [] : [{ label: text($(a)), value }];
    });

  const page = pageNumber($, '.current');
  const raw = {
    title: orUndefined(title),
    titles: list
      .find('.TPostMv')
      .toArray()
      .map((card) => readCard($(card))),
    page,
    pageCount: Math.max(
      page,
      pageNumber($, '.larger:last-child, .wp-pagenavi > *:last-child'),
    ),
    sorts,
    // The old app named .fc-quality "season". The real list page was never captured, so the label is a guess.
    filters: {
      type: options($, '.fc-filmtype'),
      quality: options($, '.fc-quality'),
      genre: options($, '.fc-genre'),
      release: options($, '.fc-release'),
    },
  };
  return validate(PARSER, ListPageSchema, raw, LIST_SELECTORS);
}
