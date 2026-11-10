import { RankListSchema, titleIdFromPath, type RankList } from '../schemas.ts';
import {
  backgroundImageOf,
  intOf,
  loadHtml,
  orUndefined,
  pathOf,
  requireElement,
  text,
  validate,
  type FieldSelectors,
} from './dom.ts';

const RANKING_SELECTORS: FieldSelectors = {
  rank: '.txt-rank',
  id: '.title-item a',
  path: '.title-item a',
  name: '.title-item a',
  image: 'img[src], [style*=background-image]',
  otherName: '.title-sd-item',
  episodeLabel: '.score',
};

/** `/bang-xep-hang/<type>`: a ranked list with a poster, names and the latest episode. */
export function parseRanking(html: string): RankList {
  const parser = 'ranking';
  const $ = loadHtml(html);
  const list = requireElement(parser, $, '.bxh-movie-phimletv');

  const entries = list
    .children('.group')
    .toArray()
    .map((li, index) => {
      const row = $(li);
      const link = row.find('.title-item a').first();
      const path = pathOf(
        link.attr('href') ?? row.find('a').first().attr('href'),
      );
      return {
        rank: intOf(text(row.find('.txt-rank').first())) ?? index + 1,
        id: path === undefined ? undefined : titleIdFromPath(path),
        path,
        name: orUndefined(text(link)),
        image:
          row.find('img').first().attr('src') ??
          backgroundImageOf(row.attr('style')),
        otherName: orUndefined(text(row.find('.title-sd-item').first())),
        episodeLabel: orUndefined(text(row.find('.score').first())),
      };
    });
  return validate(parser, RankListSchema, { entries }, RANKING_SELECTORS);
}
