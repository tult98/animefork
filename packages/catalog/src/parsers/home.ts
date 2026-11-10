import { HomeSchema, type Home } from '../schemas.ts';
import { CARD_SELECTORS, readCard } from './card.ts';
import { loadHtml, requireElement, validate } from './dom.ts';

const PARSER = 'home';

// The container is mandatory so a renamed section is a ParseError; a legitimately empty section
// (no pre-releases in the off season) still parses to an empty list.
const SECTIONS = [
  ['thisSeason', '.MovieListTopCn', '.TPostMv'],
  ['carousel', '.MovieListSldCn', '.TPostMv'],
  ['lastUpdate', '#single-home', '.TPostMv'],
  ['preRelease', '#new-home', '.TPostMv'],
  ['nominate', '#hot-home', '.TPostMv'],
  ['hotUpdate', '#showTopPhim', '.TPost'],
] as const;

export function parseHome(html: string): Home {
  const $ = loadHtml(html);
  const raw: Record<string, unknown[]> = {};
  for (const [key, container, card] of SECTIONS) {
    const section = requireElement(PARSER, $, container);
    raw[key] = section
      .find(card)
      .toArray()
      .map((el) => readCard($(el)));
  }
  return validate(PARSER, HomeSchema, raw, CARD_SELECTORS);
}
