import type { TitleInput } from '../../../../art-api/src/contract.ts';
import { seasonMarker } from '../../../../art-api/src/titles.ts';
import { titleWatchLink } from './link.ts';
import type { HomeShelves } from './shelves.ts';

const TOTAL_EPISODES = /\d+\s*\/\s*(\d+)\s*$/;

export function exportTitles(shelves: HomeShelves): TitleInput[] {
  const bySlug = new Map<string, TitleInput>();
  for (const shelf of shelves) {
    for (const title of shelf.items) {
      const slug = titleWatchLink(title).params.slug;
      if (bySlug.has(slug)) continue;
      const total = TOTAL_EPISODES.exec(title.episodeLabel)?.[1];
      const episodeCount = total ? Number.parseInt(total, 10) : 0;
      bySlug.set(slug, {
        slug,
        name: title.name,
        seasonName: seasonMarker(title.name),
        year: title.year,
        episodeCount: episodeCount > 0 ? episodeCount : undefined,
      });
    }
  }
  return [...bySlug.values()];
}
