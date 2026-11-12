import type { TitleInput } from '../art/contract.ts';
import {
  distinctRomaji,
  nameQueries,
  searchQueries,
  slugRomaji,
} from '../art/tmdb/titles.ts';
import { MIN_QUERY_LENGTH } from './mal.client.ts';

export const MAX_QUERIES = 4;

const searchable = (q: string) => q.length >= MIN_QUERY_LENGTH;

function romajiQueries(input: TitleInput, queries: string[]): string[] {
  if (distinctRomaji(input.slug, input.name) === undefined) return [];
  const romaji = slugRomaji(input.slug).toLowerCase();
  return queries.filter(
    (q) => q !== input.name && romaji.startsWith(q.toLowerCase()),
  );
}

// MAL indexes Japanese romaji and English titles, so a Vietnamese display name finds nothing
// while the romaji in the source slug does. When the two differ, the slug is asked first.
export function malQueries(input: TitleInput): string[] {
  const queries = searchQueries(input.name, input.slug);
  return [...new Set([...romajiQueries(input, queries), ...queries])];
}

export function sourceQueries(input: TitleInput): string[] {
  const base = malQueries(input).filter(searchable).slice(0, MAX_QUERIES);
  const names = nameQueries(input.otherNames, base, searchable);
  if (names.length === 0) return base;
  const romaji = romajiQueries(input, base);
  return [...romaji, ...names, ...base.filter((q) => !romaji.includes(q))];
}
