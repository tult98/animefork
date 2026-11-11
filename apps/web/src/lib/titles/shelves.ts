import { releaseInfo } from './release.ts';
import type { Title } from './title.ts';

export const MIN_SHELF_TITLES = 8;
export const SEASON_SHELF_LIMIT = 12;
export const TOP_10_SIZE = 10;
export const UPCOMING_MIN_TITLES = 3;
export const UPCOMING_SHELF_LIMIT = 12;

export interface HeroShelf {
  kind: 'hero';
  id: 'hero';
  items: Title[];
}

export interface DefaultShelf {
  kind: 'default';
  id: 'new-episodes' | 'airing-this-season' | 'upcoming';
  title: string;
  items: Title[];
}

export interface Top10Shelf {
  kind: 'top10';
  id: 'top-10-today';
  title: string;
  items: (Title & { rank: number })[];
}

export type Shelf = HeroShelf | DefaultShelf | Top10Shelf;
export type HomeShelves = Shelf[];

export interface HomeInput {
  hero: Title[];
  newEpisodes: Title[];
  top: Title[];
  upcoming: Title[];
  season: Title[] | undefined;
}

// A title is kept until the period its release falls in is over, and the nearest come first.
export function arrangeUpcoming(titles: Title[], now: number): Title[] {
  return titles
    .flatMap((title) => {
      const info = releaseInfo(title, now);
      return info && info.endsAt > now ? [{ title, key: info.sortKey }] : [];
    })
    .sort((a, b) => a.key - b.key)
    .slice(0, UPCOMING_SHELF_LIMIT)
    .map(({ title }) => title);
}

export function buildHome(
  { hero, newEpisodes, top, upcoming, season }: HomeInput,
  now: number = Date.now(),
): HomeShelves {
  const shelves: HomeShelves = [];

  if (hero.length > 0) shelves.push({ kind: 'hero', id: 'hero', items: hero });

  const keepNewEpisodes = newEpisodes.length >= MIN_SHELF_TITLES;
  if (keepNewEpisodes) {
    shelves.push({
      kind: 'default',
      id: 'new-episodes',
      title: 'Mới cập nhật',
      items: newEpisodes,
    });
  }

  if (top.length >= MIN_SHELF_TITLES) {
    shelves.push({
      kind: 'top10',
      id: 'top-10-today',
      title: 'Top 10 hôm nay',
      items: top
        .slice(0, TOP_10_SIZE)
        .map((title, index) => ({ ...title, rank: index + 1 })),
    });
  }

  if (season) {
    const shown = new Set(
      keepNewEpisodes ? newEpisodes.map((title) => title.path) : [],
    );
    const airing = season
      .filter((title) => !shown.has(title.path))
      .slice(0, SEASON_SHELF_LIMIT);
    if (airing.length >= MIN_SHELF_TITLES) {
      shelves.push({
        kind: 'default',
        id: 'airing-this-season',
        title: 'Đang chiếu mùa này',
        items: airing,
      });
    }
  }

  const soon = arrangeUpcoming(upcoming, now);
  if (soon.length >= UPCOMING_MIN_TITLES) {
    shelves.push({
      kind: 'default',
      id: 'upcoming',
      title: 'Sắp ra mắt',
      items: soon,
    });
  }

  return shelves;
}
