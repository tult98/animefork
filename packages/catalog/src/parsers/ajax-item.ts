import { ParseError } from '../errors.ts';
import { RankListSchema, type RankList } from '../schemas.ts';
import { CARD_SELECTORS, readCard } from './card.ts';
import { loadHtml, validate } from './dom.ts';

const PARSER = 'ajax-item';

/** `POST /ajax/item` widgets (hot today, top of the week): the cards of the fragment, in rank order. */
export function parseAjaxItem(html: string): RankList {
  const $ = loadHtml(html);
  const cards = $('.TPost').toArray();
  if (cards.length === 0) {
    throw new ParseError(PARSER, {
      selector: '.TPost',
      reason: 'fragment has no cards',
    });
  }
  const entries = cards.map((card, index) => {
    const { id, path, name, image, rating, episodeLabel } = readCard($(card));
    return { rank: index + 1, id, path, name, image, rating, episodeLabel };
  });
  return validate(PARSER, RankListSchema, { entries }, CARD_SELECTORS);
}
