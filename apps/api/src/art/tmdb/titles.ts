import { normalizeTitle } from './matcher.ts';

const SEASON_MARKER_PATTERNS = [
  /(?:season|mùa|phần)\s*(\d+)/i,
  /(\d+)(?:st|nd|rd|th)\s+season/i,
];

function findSeasonMarker(text: string) {
  for (const pattern of SEASON_MARKER_PATTERNS) {
    const match = pattern.exec(text);
    if (match?.[1]) return { match, season: Number.parseInt(match[1], 10) };
  }
  return undefined;
}

export function parseSeasonNumber(
  seasonName: string | undefined,
  name?: string,
): number {
  const found =
    (seasonName ? findSeasonMarker(seasonName) : undefined) ??
    (name ? findSeasonMarker(name) : undefined);
  return found && found.season > 0 ? found.season : 1;
}

export function seasonMarker(name: string): string | undefined {
  return findSeasonMarker(name)?.match[0];
}

export function stripSeasonMarker(name: string): string {
  const found = findSeasonMarker(name);
  if (!found) return name;
  const stripped = name
    .replace(found.match[0], ' ')
    .replace(/\s+/g, ' ')
    .replace(/[\s:\-–]+$/, '')
    .trim();
  return stripped || name;
}

const MIN_PREFIX_LENGTH = 3;

function beforeSubtitle(query: string): string | undefined {
  const cut = query.search(/:| [-–] /);
  if (cut < 0) return undefined;
  const prefix = query.slice(0, cut).trim();
  return prefix.length >= MIN_PREFIX_LENGTH ? prefix : undefined;
}

function stripArcSuffix(query: string): string | undefined {
  const stripped = query
    .replace(/[\s-]+(?:hen|arc|movie)$/i, '')
    .replace(/[\s:\-–]+$/, '')
    .trim();
  return stripped && stripped !== query ? stripped : undefined;
}

const SLUG_LONG_WORDS = 6;
const SLUG_SHORT_WORDS = 3;

export function slugRomaji(slug: string): string {
  return stripSeasonMarker(
    slug
      .replace(/-a\d+$/, '')
      .replace(/-+/g, ' ')
      .trim(),
  );
}

// The slug romaji only helps when it says something the display name does not.
export function distinctRomaji(slug: string, name: string): string | undefined {
  const romaji = slugRomaji(slug);
  return romaji && normalizeTitle(romaji) !== normalizeTitle(name)
    ? romaji
    : undefined;
}

// A display name in another language often finds nothing on TMDB, while the
// romaji in the source slug does.
function slugQueries(slug: string): string[] {
  const romaji = slugRomaji(slug);
  const words = romaji.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const long = words.slice(0, SLUG_LONG_WORDS).join(' ');
  const short = words.slice(0, SLUG_SHORT_WORDS).join(' ');
  return [long, short];
}

// TMDB search is literal, so a full name with an arc subtitle often finds
// nothing while the franchise name alone does. Ordered from most to least specific.
export function searchQueries(name: string, slug?: string): string[] {
  const full = stripSeasonMarker(name);
  const prefix = beforeSubtitle(full);
  const ordered = [
    full,
    prefix,
    stripArcSuffix(full),
    prefix === undefined ? undefined : stripArcSuffix(prefix),
    ...(slug ? slugQueries(slug) : []),
  ];
  const queries = ordered.filter((q): q is string => q !== undefined);
  return [...new Set(queries)];
}
