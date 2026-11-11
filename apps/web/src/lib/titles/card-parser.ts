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
  avsVoters: number | undefined;
  releasesAt: number | undefined;
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

// The site words it "8.4 trong số 10 dựa trên 44 thành viên đánh giá" in the title attribute of the score badge.
const VOTERS = /dựa trên\s+([\d.,]+)/;

function parseVoters(el: Element): number | undefined {
  const label = el
    .querySelector('.anime-avg-user-rating')
    ?.getAttribute('title');
  const digits = VOTERS.exec(label ?? '')?.[1]?.replace(/\D/g, '');
  return digits ? Number(digits) : undefined;
}

const UPCOMING_FALLBACK_LABEL = 'Sắp chiếu';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// The countdown span carries the seconds left. Without it the site only shows a date, or just a year.
function parseReleasesAt(el: Element, now: number): number | undefined {
  const seconds = Number(
    el
      .querySelector('.mli-timeschedule')
      ?.getAttribute('data-timer_second')
      ?.trim() || Number.NaN,
  );
  if (Number.isFinite(seconds)) return now + Math.round(seconds) * 1000;
  const date = text(el, '.b');
  return ISO_DATE.test(date)
    ? finiteOrUndefined(Date.parse(`${date}T00:00:00Z`))
    : undefined;
}

const BARE_YEAR = /^\d{4}$/;

function parseYear(el: Element): number | undefined {
  const year = finiteOrUndefined(parseInt(text(el, '.AAIco-date_range'), 10));
  if (year !== undefined) return year;
  const bare = text(el, '.b');
  return BARE_YEAR.test(bare) ? Number(bare) : undefined;
}

export function parseCard(el: Element, now: number = Date.now()): RawCard {
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
      formatEpisodeLabel(text(el, '.mli-eps')) ||
      text(el, '.Info .Time') ||
      (el.querySelector('.mli-timeschedule') ? UPCOMING_FALLBACK_LABEL : ''),
    year: parseYear(el),
    genres: [...el.querySelectorAll('.Genre > a')]
      .map((a) => a.textContent?.trim() ?? '')
      .filter(Boolean),
    description: orUndefined(text(el, '.Description > p:first-child')),
    studio: orUndefined(studioLine.split(':').slice(1).join(':').trim()),
    views: views === undefined ? undefined : Number(views),
    quality: orUndefined(text(el, '.Qlty')),
    avsVoters: parseVoters(el),
    releasesAt: parseReleasesAt(el, now),
  };
}

export function parseCards(
  root: ParentNode,
  selector: string,
  now: number = Date.now(),
): Title[] {
  return [...root.querySelectorAll(selector)].map((el) =>
    TitleSchema.parse(parseCard(el, now)),
  );
}
