import {
  TitleInputSchema,
  type TitleInput,
} from '../../../../api/src/art/contract.ts';
import {
  seasonMarker,
  stripSeasonMarker,
} from '../../../../api/src/art/tmdb/titles.ts';
import { titleWatchLink } from './link.ts';
import type { HomeShelves } from './shelves.ts';
import type { WatchPage } from './watch.ts';

const TOTAL_EPISODES = /\d+\s*\/\s*(\d+)\s*$/;
const TRAILING_TAGS = /(?:\s*\[[^\]]*\])+\s*$/;

function bounded(value: number | undefined, min: number, max: number) {
  return value !== undefined && value >= min && value <= max
    ? value
    : undefined;
}

function toInput(raw: {
  slug: string;
  name: string;
  year?: number;
  episodeCount?: number;
  otherNames?: string[];
}): TitleInput | undefined {
  const name = raw.name.replace(TRAILING_TAGS, '').trim().slice(0, 200);
  const parsed = TitleInputSchema.safeParse({
    slug: raw.slug,
    name,
    seasonName: seasonMarker(name),
    year: bounded(raw.year, 1900, 2100),
    episodeCount: bounded(raw.episodeCount, 1, 2000),
    otherNames: raw.otherNames,
  });
  return parsed.success ? parsed.data : undefined;
}

export function lookupTitles(shelves: HomeShelves): TitleInput[] {
  const bySlug = new Map<string, TitleInput>();
  for (const shelf of shelves) {
    if (shelf.kind === 'continue') continue;
    for (const title of shelf.items) {
      const slug = titleWatchLink(title).params.slug;
      if (bySlug.has(slug)) continue;
      const total = TOTAL_EPISODES.exec(title.episodeLabel)?.[1];
      const input = toInput({
        slug,
        name: title.name,
        year: title.year,
        episodeCount: total ? Number.parseInt(total, 10) : undefined,
      });
      if (input) bySlug.set(slug, input);
    }
  }
  return [...bySlug.values()];
}

// The watch page lists only the episodes aired so far, so their count is not the season's total and is left out.
export function watchLookupTitle(page: WatchPage): TitleInput | undefined {
  return toInput({
    slug: page.slug,
    name: page.title,
    otherNames: page.otherNames,
  });
}

// A sibling season is only a slug and a label, so the current title's name stands in for it and the API matches by slug.
// The name drops the page's own season marker, which would otherwise pin every sibling to that season.
export function seasonLookupTitles(page: WatchPage): TitleInput[] {
  const name = stripSeasonMarker(page.title) || page.title;
  return page.seasons.flatMap((season) => {
    const input = toInput({ slug: season.slug, name });
    return input ? [input] : [];
  });
}
