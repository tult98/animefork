import type { Transport } from '../transport/index.ts';
import { expectOk } from '../transport/index.ts';
import { parseCard, parseCards } from './card-parser.ts';
import { TitleListSchema, TitleSchema, type Title } from './title.ts';

export interface ParsedHome {
  hero: Title[];
  top: Title[];
  upcoming: Title[];
  seasonPath: string | null;
}

// The anime only list ordered by latest update. The home shelf and /new-episodes both read it.
export const NEW_EPISODES_PATH = '/danh-sach/all/all/all/all/all/all/jp/';

export const UPCOMING_PATH = '/anime-sap-chieu/';

const SEASON_PATH = /^\/season\/(winter|spring|summer|autumn)\/(\d{4})\/?$/;

// The season page lists Chinese donghua next to the anime. The site's own list filter keeps one country, so the shelf and its listing read that list for the same season and year. A path in another shape is read as it is.
export function japaneseSeasonPath(seasonPath: string): string {
  const match = SEASON_PATH.exec(seasonPath);
  return match
    ? `/danh-sach/all/all/${match[1]}/${match[2]}/all/all/jp/`
    : seasonPath;
}

const SEASON_LINK = '#single-home a.STPb[data-tag="anime-season"]';

function nonEmpty(titles: Title[]): Title[] {
  return TitleListSchema.parse(titles);
}

// A bad upcoming card is dropped rather than failing the whole home page.
function parseUpcoming(doc: Document, now: number): Title[] {
  return [...doc.querySelectorAll('#new-home .TPostMv')].flatMap((el) => {
    const parsed = TitleSchema.safeParse(parseCard(el, now));
    return parsed.success ? [parsed.data] : [];
  });
}

export function parseHome(html: string, now: number = Date.now()): ParsedHome {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const href = doc.querySelector(SEASON_LINK)?.getAttribute('href');
  return {
    hero: nonEmpty(parseCards(doc, '.MovieListSldCn .TPostMv')),
    top: nonEmpty(parseCards(doc, '#hot-home .TPostMv')),
    upcoming: parseUpcoming(doc, now),
    seasonPath: href ? new URL(href, 'https://home.invalid').pathname : null,
  };
}

// A card without an episode label or a poster is dropped rather than failing the shelf.
export function parseNewEpisodes(html: string): Title[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return [...doc.querySelectorAll('.TPostMv')].flatMap((el) => {
    const parsed = TitleSchema.safeParse(parseCard(el));
    return parsed.success ? [parsed.data] : [];
  });
}

export function parseSeason(html: string): Title[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return nonEmpty(parseCards(doc, '.TPostMv'));
}

export async function fetchHome(
  transport: Transport,
  signal?: AbortSignal,
): Promise<ParsedHome> {
  const res = await transport.get({ url: '/', signal });
  expectOk(res, '/');
  return parseHome(res.data);
}

export async function fetchSeason(
  transport: Transport,
  seasonPath: string,
  signal?: AbortSignal,
): Promise<Title[]> {
  const res = await transport.get({ url: seasonPath, signal });
  expectOk(res, seasonPath);
  return parseSeason(res.data);
}

export async function fetchNewEpisodes(
  transport: Transport,
  signal?: AbortSignal,
): Promise<Title[]> {
  const res = await transport.get({ url: NEW_EPISODES_PATH, signal });
  expectOk(res, NEW_EPISODES_PATH);
  return parseNewEpisodes(res.data);
}
