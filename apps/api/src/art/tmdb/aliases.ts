import type { TmdbClient, TmdbKind } from './tmdb.ts';

const MAX_ALIASES = 6;
// MAL searches Latin text, so Japanese or Vietnamese-only names would only waste a call.
const LATIN = /^[\p{Script=Latin}\p{N}\s:!?'’.,&·\-–()/+~★☆]+$/u;

async function tmdbNames(
  tmdb: Pick<
    TmdbClient,
    | 'tvDetail'
    | 'tvAlternativeTitles'
    | 'movieDetail'
    | 'movieAlternativeTitles'
  >,
  tmdbKind: TmdbKind,
  tmdbId: number,
): Promise<string[]> {
  if (tmdbKind === 'movie') {
    const [detail, alternatives] = await Promise.all([
      tmdb.movieDetail(tmdbId),
      tmdb.movieAlternativeTitles(tmdbId),
    ]);
    return [detail.title, detail.original_title, ...alternatives];
  }
  const [detail, alternatives] = await Promise.all([
    tmdb.tvDetail(tmdbId),
    tmdb.tvAlternativeTitles(tmdbId),
  ]);
  return [detail.name, detail.original_name, ...alternatives];
}

export async function tmdbAliases(
  tmdb: Parameters<typeof tmdbNames>[0],
  tmdbKind: TmdbKind,
  tmdbId: number,
): Promise<string[]> {
  const names = (await tmdbNames(tmdb, tmdbKind, tmdbId))
    .map((n) => n.trim())
    .filter((n) => n.length >= 3 && LATIN.test(n));
  return [...new Set(names)].slice(0, MAX_ALIASES);
}
