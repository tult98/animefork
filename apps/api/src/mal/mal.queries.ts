import type { TitleInput } from '../art/contract.ts';
import {
  distinctRomaji,
  searchQueries,
  slugRomaji,
  stripSeasonMarker,
} from '../art/tmdb/titles.ts';
import { MIN_QUERY_LENGTH } from './mal.client.ts';

export const MAX_QUERIES = 4;
export const MAX_NAME_QUERIES = 2;

const key = (query: string) => query.toLowerCase();

function uniqueIgnoringCase(queries: string[]): string[] {
  const seen = new Set<string>();
  return queries.filter((q) => {
    if (seen.has(key(q))) return false;
    seen.add(key(q));
    return true;
  });
}

const searchable = (q: string) => q.length >= MIN_QUERY_LENGTH;

function romajiQueries(input: TitleInput, queries: string[]): string[] {
  if (distinctRomaji(input.slug, input.name) === undefined) return [];
  const romaji = key(slugRomaji(input.slug));
  return queries.filter((q) => q !== input.name && romaji.startsWith(key(q)));
}

// MAL indexes Japanese romaji and English titles, so a Vietnamese display name finds nothing
// while the romaji in the source slug does. When the two differ, the slug is asked first.
export function malQueries(input: TitleInput): string[] {
  const queries = searchQueries(input.name, input.slug);
  return [...new Set([...romajiQueries(input, queries), ...queries])];
}

// The other names the source lists reach MAL titles neither the display name nor the slug do,
// so they go right after the slug romaji, and each one raises the cap instead of displacing a query.
export function sourceQueries(input: TitleInput): string[] {
  const base = malQueries(input).filter(searchable).slice(0, MAX_QUERIES);
  const asked = new Set(base.map(key));
  const names = uniqueIgnoringCase(
    (input.otherNames ?? []).map(stripSeasonMarker).filter(searchable),
  )
    .filter((q) => !asked.has(key(q)))
    .slice(0, MAX_NAME_QUERIES);
  if (names.length === 0) return base;
  return uniqueIgnoringCase([...romajiQueries(input, base), ...names, ...base]);
}
