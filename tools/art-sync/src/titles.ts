import { z } from 'zod';

export const TitleInputSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  seasonName: z.string().min(1).optional(),
  year: z.number().int().optional(),
  episodeCount: z.number().int().positive().optional(),
});

export const TitlesFileSchema = z.array(TitleInputSchema);

export type TitleInput = z.infer<typeof TitleInputSchema>;

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
