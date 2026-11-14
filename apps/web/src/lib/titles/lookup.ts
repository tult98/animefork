import {
  TitleInputSchema,
  type TitleInput,
} from '../../../../api/src/art/contract.ts';
import {
  seasonMarker,
  slugWords,
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
  for (const shelf of shelves) {
    if (shelf.kind !== 'continue') continue;
    for (const item of shelf.items) {
      if (bySlug.has(item.slug)) continue;
      const input = toInput({ slug: item.slug, name: item.titleName });
      if (input) bySlug.set(item.slug, input);
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

// A sibling season is only a slug and a label such as "Phần OVA", so it is looked up by the words of its own slug.
// The page's title names another entry, often another show ("ITEM" on a "Railgun" sibling), and would decide its match.
// The current season is looked up as the page's own art is.
export function seasonLookupTitles(page: WatchPage): TitleInput[] {
  return page.seasons.flatMap((season) => {
    const input =
      season.slug === page.slug
        ? watchLookupTitle(page)
        : toInput({ slug: season.slug, name: slugWords(season.slug) });
    return input ? [input] : [];
  });
}
