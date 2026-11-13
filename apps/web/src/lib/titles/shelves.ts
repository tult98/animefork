import type { WatchProgressShelfItem } from '../../../../api/src/watch-progress/contract.ts';
import { titleWatchLink, watchLink } from './link.ts';
import { releaseInfo } from './release.ts';
import type { Title } from './title.ts';

export const MIN_SHELF_TITLES = 8;
export const NEW_EPISODES_SHELF_LIMIT = 12;
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

export type ContinueState =
  | {
      kind: 'inProgress';
      fraction: number;
      positionS: number;
      durationS: number;
    }
  | { kind: 'finished' };

export interface ContinueItem {
  slug: string;
  titleName: string;
  image: string;
  episodeLabel: string;
  episodeId: string;
  state: ContinueState;
  link: ReturnType<typeof watchLink>;
}

export interface ContinueShelf {
  kind: 'continue';
  id: 'continue-watching';
  title: string;
  items: ContinueItem[];
}

// The shelves whose items are catalog titles, as opposed to the viewer's own history.
export type TitleShelf = HeroShelf | DefaultShelf | Top10Shelf;
export type Shelf = TitleShelf | ContinueShelf;
export type HomeShelves = Shelf[];

export interface HomeInput {
  hero: Title[];
  newEpisodes: Title[];
  top: Title[];
  upcoming: Title[];
  season: Title[] | undefined;
  // The viewer's watch history, newest first. Absent or empty means no continue shelf.
  continueRows?: WatchProgressShelfItem[];
}

export function toContinueItem(row: WatchProgressShelfItem): ContinueItem {
  const finished = row.completed;
  return {
    slug: row.slug,
    titleName: row.titleName,
    image: row.image,
    episodeLabel: row.episodeLabel,
    episodeId: row.episodeId,
    state: finished
      ? { kind: 'finished' }
      : {
          kind: 'inProgress',
          fraction:
            row.durationS > 0
              ? Math.min(1, Math.max(0, row.positionS / row.durationS))
              : 0,
          positionS: row.positionS,
          durationS: row.durationS,
        },
    // A finished episode links to the title alone so the player picks the next one.
    link: finished ? watchLink(row.slug) : watchLink(row.slug, row.episodeId),
  };
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

// Every season of a series has its own slug but shares the title name, so the newest row stands for the series.
function latestPerTitle(
  rows: WatchProgressShelfItem[],
): WatchProgressShelfItem[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.titleName)) return false;
    seen.add(row.titleName);
    return true;
  });
}

export function buildHome(
  { hero, newEpisodes, top, upcoming, season, continueRows = [] }: HomeInput,
  now: number = Date.now(),
): HomeShelves {
  const shelves: HomeShelves = [];

  // A title already in the continue row is not offered again further down the page.
  const watching = new Set(continueRows.map((row) => row.slug));
  const unwatched = (titles: Title[]) =>
    watching.size === 0
      ? titles
      : titles.filter(
          (title) => !watching.has(titleWatchLink(title).params.slug),
        );
  hero = unwatched(hero);
  newEpisodes = unwatched(newEpisodes);
  top = unwatched(top);
  upcoming = unwatched(upcoming);
  season = season && unwatched(season);

  if (hero.length > 0) shelves.push({ kind: 'hero', id: 'hero', items: hero });

  if (continueRows.length > 0) {
    shelves.push({
      kind: 'continue',
      id: 'continue-watching',
      title: 'Tiếp tục xem',
      items: latestPerTitle(continueRows).map(toContinueItem),
    });
  }

  const keepNewEpisodes = newEpisodes.length >= MIN_SHELF_TITLES;
  const shownNewEpisodes = keepNewEpisodes
    ? newEpisodes.slice(0, NEW_EPISODES_SHELF_LIMIT)
    : [];
  if (keepNewEpisodes) {
    shelves.push({
      kind: 'default',
      id: 'new-episodes',
      title: 'Mới cập nhật',
      items: shownNewEpisodes,
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
    const shown = new Set(shownNewEpisodes.map((title) => title.path));
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
