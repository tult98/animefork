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

// TMDB search is literal, so a full name with an arc subtitle often finds
// nothing while the franchise name alone does. Ordered from most to least specific.
export function searchQueries(name: string): string[] {
  const full = stripSeasonMarker(name);
  const prefix = beforeSubtitle(full);
  const ordered = [
    full,
    prefix,
    stripArcSuffix(full),
    prefix === undefined ? undefined : stripArcSuffix(prefix),
  ];
  const queries = ordered.filter((q): q is string => q !== undefined);
  return [...new Set(queries)];
}
