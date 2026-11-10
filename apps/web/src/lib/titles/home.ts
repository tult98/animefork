import type { Transport } from '../transport/index.ts';
import { expectOk } from '../transport/index.ts';
import { parseCards } from './card-parser.ts';
import { TitleListSchema, type Title } from './title.ts';

export interface ParsedHome {
  hero: Title[];
  newEpisodes: Title[];
  top: Title[];
  seasonPath: string | null;
}

const SEASON_LINK = '#single-home a.STPb[data-tag="anime-season"]';

function nonEmpty(titles: Title[]): Title[] {
  return TitleListSchema.parse(titles);
}

export function parseHome(html: string): ParsedHome {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const href = doc.querySelector(SEASON_LINK)?.getAttribute('href');
  return {
    hero: nonEmpty(parseCards(doc, '.MovieListSldCn .TPostMv')),
    newEpisodes: nonEmpty(parseCards(doc, '#single-home .TPostMv')),
    top: nonEmpty(parseCards(doc, '#hot-home .TPostMv')),
    seasonPath: href ? new URL(href, 'https://home.invalid').pathname : null,
  };
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
