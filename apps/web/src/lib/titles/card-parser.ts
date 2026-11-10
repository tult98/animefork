import { TitleSchema, type Title } from './title.ts';

export interface RawCard {
  path: string | undefined;
  name: string;
  image: string | undefined;
  rating: number;
  episodeLabel: string;
  year: number | undefined;
  genres: string[];
  description: string | undefined;
  studio: string | undefined;
  views: number | undefined;
  quality: string | undefined;
}

const text = (el: Element, selector: string): string =>
  el.querySelector(selector)?.textContent?.trim() ?? '';

const orUndefined = (value: string): string | undefined => value || undefined;

function finiteOrUndefined(value: number): number | undefined {
  return Number.isFinite(value) ? value : undefined;
}

// The site renders the label as TẬP<i>19</i>, so its text runs together as TẬP19.
export function formatEpisodeLabel(raw: string): string {
  const match = raw.match(/^TẬP\s*(\S.*)$/i);
  return match ? `Tập ${match[1]!.replace(/^0+(?=\d)/, '')}` : raw;
}

function pathOf(href: string | null | undefined): string | undefined {
  if (!href) return undefined;
  return new URL(href, 'https://card.invalid').pathname;
}

export function parseCard(el: Element): RawCard {
  const rating =
    text(el, '.anime-avg-user-rating') || text(el, '.AAIco-star') || '';
  const views = text(el, '.Year')
    .match(/[\d,]+/)?.[0]
    ?.replaceAll(',', '');
  const studioLine = text(el, '.Studio');

  return {
    path: pathOf(el.querySelector('a[href]')?.getAttribute('href')),
    name: text(el, '.Title'),
    image: el.querySelector('img[src]')?.getAttribute('src') ?? undefined,
    rating: rating === '' ? Number.NaN : Number(rating),
    episodeLabel:
      formatEpisodeLabel(text(el, '.mli-eps')) || text(el, '.Info .Time'),
    year: finiteOrUndefined(parseInt(text(el, '.AAIco-date_range'), 10)),
    genres: [...el.querySelectorAll('.Genre > a')]
      .map((a) => a.textContent?.trim() ?? '')
      .filter(Boolean),
    description: orUndefined(text(el, '.Description > p:first-child')),
    studio: orUndefined(studioLine.split(':').slice(1).join(':').trim()),
    views: views === undefined ? undefined : Number(views),
    quality: orUndefined(text(el, '.Qlty')),
  };
}

export function parseCards(root: ParentNode, selector: string): Title[] {
  return [...root.querySelectorAll(selector)].map((el) =>
    TitleSchema.parse(parseCard(el)),
  );
}
