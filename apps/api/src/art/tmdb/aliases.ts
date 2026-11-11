import type { TmdbClient } from './tmdb.ts';

const MAX_ALIASES = 6;
// MAL searches Latin text, so Japanese or Vietnamese-only names would only waste a call.
const LATIN = /^[\p{Script=Latin}\p{N}\s:!?'’.,&·\-–()/+~★☆]+$/u;

// The English and alternative titles of a TMDB show, in the order they are worth searching.
export async function tmdbAliases(
  tmdb: Pick<TmdbClient, 'tvDetail' | 'tvAlternativeTitles'>,
  tmdbId: number,
): Promise<string[]> {
  const [detail, alternatives] = await Promise.all([
    tmdb.tvDetail(tmdbId),
    tmdb.tvAlternativeTitles(tmdbId),
  ]);
  const names = [detail.name, detail.original_name, ...alternatives]
    .map((n) => n.trim())
    .filter((n) => n.length >= 3 && LATIN.test(n));
  return [...new Set(names)].slice(0, MAX_ALIASES);
}
