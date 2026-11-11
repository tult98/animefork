import type { TitleInput } from '../art/contract.ts';
import {
  distinctRomaji,
  searchQueries,
  slugRomaji,
} from '../art/tmdb/titles.ts';

// MAL indexes Japanese romaji and English titles, so a Vietnamese display name finds nothing
// while the romaji in the source slug does. When the two differ, the slug is asked first.
export function malQueries(input: TitleInput): string[] {
  const queries = searchQueries(input.name, input.slug);
  const romaji = slugRomaji(input.slug);
  const fromSlug = queries.filter(
    (q) => q !== input.name && romaji.toLowerCase().startsWith(q.toLowerCase()),
  );
  const slugFirst = distinctRomaji(input.slug, input.name) !== undefined;
  return slugFirst ? [...new Set([...fromSlug, ...queries])] : queries;
}
