import { titleIdFromPath } from '../schemas.ts';
import {
  orUndefined,
  pathOf,
  text,
  type Sel,
  type FieldSelectors,
} from './dom.ts';

export const CARD_SELECTORS: FieldSelectors = {
  id: 'a[href]',
  path: 'a[href]',
  name: '.Title',
  image: 'img[src]',
  rating: '.anime-avg-user-rating, .Vote',
  episodeLabel: '.mli-eps > i, .AAIco-access_time',
  genres: '.Genre > a',
  year: '.AAIco-date_range',
  description: '.Description > p',
  studio: '.Studio',
  quality: '.Qlty, .mli-quality',
  releaseTime: '.mli-timeschedule + .b',
};

/** "11/13" or "315/???": progress through a series, as opposed to a movie's "110 Phút". */
const PROGRESS = /^\d+\/(?:\d+|\?+)$/;

export function ratingOf(candidates: string[]): number | undefined {
  for (const raw of candidates) {
    const value = Number.parseFloat(raw.replace(',', '.'));
    // The home carousel prints a vote count (479) where other cards print the score, so out of range means "not a score".
    if (Number.isFinite(value) && value >= 0 && value <= 10) return value;
  }
  return undefined;
}

export function progressOf(raw: string): string | undefined {
  return PROGRESS.test(raw) ? raw : undefined;
}

/** Reads one `.TPost` or `.TPostMv` card into the raw shape `TitleSchema` validates. Absent fields stay undefined. */
export function readCard(card: Sel): Record<string, unknown> {
  const path = pathOf(card.find('a').first().attr('href'));
  const genres = card
    .find('.Genre > a')
    .toArray()
    .map((a) => {
      const anchor = card.find(a);
      return { path: pathOf(anchor.attr('href')), name: text(anchor) };
    });
  const rating = ratingOf([
    text(card.find('.anime-avg-user-rating').first()),
    text(card.find('.Vote').first()),
    text(card.find('.AAIco-star').first()),
  ]);
  const year = Number.parseInt(
    text(card.find('.AAIco-date_range').first()),
    10,
  );

  return {
    id: path === undefined ? undefined : titleIdFromPath(path),
    path,
    name: orUndefined(text(card.find('.Title').first())),
    image: orUndefined(card.find('img').first().attr('src')),
    rating,
    episodeLabel:
      orUndefined(text(card.find('.mli-eps > i').first())) ??
      progressOf(text(card.find('.AAIco-access_time').first())),
    genres: genres.length === 0 ? undefined : genres,
    year: Number.isNaN(year) ? undefined : year,
    description: orUndefined(text(card.find('.Description > p').first())),
    studio: orUndefined(
      text(card.find('.Studio').first()).split(':').slice(1).join(':').trim(),
    ),
    quality: orUndefined(
      text(card.find('.Qlty').first()) ||
        text(card.find('.mli-quality').first()),
    ),
    releaseTime: orUndefined(text(card.find('.mli-timeschedule + .b').first())),
  };
}
