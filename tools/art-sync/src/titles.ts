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

export function parseSeasonNumber(seasonName: string | undefined): number {
  if (!seasonName) return 1;
  const match =
    /(?:season|mùa|phần)\s*(\d+)/i.exec(seasonName) ??
    /(\d+)(?:st|nd|rd|th)\s+season/i.exec(seasonName);
  const season = match?.[1] ? Number.parseInt(match[1], 10) : 1;
  return season > 0 ? season : 1;
}
