import type { OverviewLang } from '../art.store.ts';
import type { TmdbClient } from './tmdb.ts';

export interface TmdbOverview {
  text: string;
  lang: OverviewLang;
}

const LANGUAGES: OverviewLang[] = ['vi', 'en'];

export async function fetchOverview(
  tmdb: TmdbClient,
  tmdbId: number,
): Promise<TmdbOverview | null> {
  for (const lang of LANGUAGES) {
    const text = (await tmdb.tvDetail(tmdbId, lang)).overview?.trim();
    if (text) return { text, lang };
  }
  return null;
}
