import type { OverviewLang } from '../art.store.ts';
import type { TmdbClient, TmdbKind } from './tmdb.ts';

export interface TmdbOverview {
  text: string;
  lang: OverviewLang;
}

const LANGUAGES: OverviewLang[] = ['vi', 'en'];

export async function fetchOverview(
  tmdb: TmdbClient,
  tmdbKind: TmdbKind,
  tmdbId: number,
): Promise<TmdbOverview | null> {
  for (const lang of LANGUAGES) {
    const detail =
      tmdbKind === 'movie'
        ? await tmdb.movieDetail(tmdbId, lang)
        : await tmdb.tvDetail(tmdbId, lang);
    const text = detail.overview?.trim();
    if (text) return { text, lang };
  }
  return null;
}
