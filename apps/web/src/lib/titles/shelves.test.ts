import { describe, expect, it } from 'vitest';
import {
  MIN_SHELF_TITLES,
  SEASON_SHELF_LIMIT,
  UPCOMING_MIN_TITLES,
  UPCOMING_SHELF_LIMIT,
  buildHome,
  type HomeInput,
} from './shelves.ts';
import type { Title } from './title.ts';

const t = (n: number): Title => ({
  path: `/phim/t${n}/`,
  name: `T${n}`,
  image: '/p.jpg',
  rating: 8,
  episodeLabel: 'TẬP1',
  genres: [],
});
const range = (from: number, to: number) =>
  Array.from({ length: to - from }, (_, i) => t(from + i));
const ids = (input: HomeInput) => buildHome(input).map((s) => s.id);
const paths = (items: Title[]) => items.map((i) => i.path);

const base: HomeInput = {
  hero: range(0, 5),
  newEpisodes: range(100, 110),
  top: range(200, 210),
  upcoming: [],
  season: range(300, 330),
};

describe('buildHome', () => {
  it('orders hero, new episodes, top 10, airing this season', () => {
    expect(ids(base)).toEqual([
      'hero',
      'new-episodes',
      'top-10-today',
      'airing-this-season',
    ]);
  });

  it('titles the shelves in Vietnamese and leaves the hero untitled', () => {
    const [hero, news, top, airing] = buildHome(base);
    expect('title' in hero!).toBe(false);
    expect(news).toMatchObject({ kind: 'default', title: 'Mới cập nhật' });
    expect(top).toMatchObject({ kind: 'top10', title: 'Top 10 hôm nay' });
    expect(airing).toMatchObject({
      kind: 'default',
      title: 'Đang chiếu mùa này',
    });
  });

  it('keeps a title in both hero and top 10', () => {
    const shared = t(500);
    const shelves = buildHome({
      ...base,
      hero: [shared, ...base.hero],
      top: [shared, ...base.top.slice(1)],
    });
    const heroItems = shelves.find((s) => s.id === 'hero')!.items;
    const topItems = shelves.find((s) => s.id === 'top-10-today')!.items;
    expect(paths(heroItems)).toContain(shared.path);
    expect(paths(topItems)).toContain(shared.path);
  });

  it('keeps a title in top 10 and new episodes', () => {
    const shared = t(500);
    const shelves = buildHome({
      ...base,
      newEpisodes: [shared, ...base.newEpisodes.slice(1)],
      top: [shared, ...base.top.slice(1)],
    });
    const news = shelves.find((s) => s.id === 'new-episodes')!;
    const top = shelves.find((s) => s.id === 'top-10-today')!;
    expect(paths(news.items)).toContain(shared.path);
    expect(paths(top.items)).toContain(shared.path);
  });

  it('removes from airing the titles new episodes already shows', () => {
    const season = [...base.newEpisodes.slice(0, 3), ...range(300, 320)];
    const airing = buildHome({ ...base, season }).find(
      (s) => s.id === 'airing-this-season',
    )!;
    const newPaths = new Set(paths(base.newEpisodes));
    expect(airing.items.some((i) => newPaths.has(i.path))).toBe(false);
    expect(paths(airing.items)[0]).toBe('/phim/t300/');
    const news = buildHome({ ...base, season }).find(
      (s) => s.id === 'new-episodes',
    )!;
    expect(news.items).toEqual(base.newEpisodes);
  });

  it('caps airing at SEASON_SHELF_LIMIT after dedupe', () => {
    const airing = buildHome(base).find((s) => s.id === 'airing-this-season')!;
    expect(airing.items).toHaveLength(SEASON_SHELF_LIMIT);
    expect(paths(airing.items)).toEqual(paths(base.season!.slice(0, 12)));
  });

  it('drops airing when dedupe leaves fewer than MIN_SHELF_TITLES', () => {
    const season = [
      ...base.newEpisodes.slice(0, 5),
      ...range(300, 300 + MIN_SHELF_TITLES - 1),
    ];
    expect(ids({ ...base, season })).not.toContain('airing-this-season');
  });

  it('keeps airing at exactly MIN_SHELF_TITLES after dedupe', () => {
    const season = [
      ...base.newEpisodes.slice(0, 5),
      ...range(300, 300 + MIN_SHELF_TITLES),
    ];
    expect(ids({ ...base, season })).toContain('airing-this-season');
  });

  it('drops a non-hero shelf with fewer than MIN_SHELF_TITLES titles', () => {
    expect(
      ids({ ...base, newEpisodes: range(100, 100 + MIN_SHELF_TITLES - 1) }),
    ).toEqual(['hero', 'top-10-today', 'airing-this-season']);
  });

  it('does not dedupe airing against a new-episodes shelf that was dropped', () => {
    const newEpisodes = range(100, 103);
    const season = [...newEpisodes, ...range(300, 300 + MIN_SHELF_TITLES - 1)];
    const airing = buildHome({ ...base, newEpisodes, season }).find(
      (s) => s.id === 'airing-this-season',
    )!;
    expect(airing.items).toHaveLength(season.length);
  });

  it('omits airing while the season is not loaded', () => {
    expect(ids({ ...base, season: undefined })).toEqual([
      'hero',
      'new-episodes',
      'top-10-today',
    ]);
  });

  it('ranks top 10 by position from 1', () => {
    const top = buildHome(base).find((s) => s.kind === 'top10')!;
    expect(top.items.map((i) => ('rank' in i ? i.rank : 0))).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    expect(paths(top.items)).toEqual(paths(base.top));
  });

  it('keeps top 10 with 8 or 9 titles and drops it below 8', () => {
    const nine = buildHome({ ...base, top: range(200, 209) }).find(
      (s) => s.kind === 'top10',
    )!;
    expect(nine.items).toHaveLength(9);
    expect(nine.items.at(-1)).toMatchObject({ rank: 9 });
    expect(ids({ ...base, top: range(200, 207) })).not.toContain(
      'top-10-today',
    );
  });

  it('shows the hero even when it has few titles', () => {
    expect(ids({ ...base, hero: range(0, 1) })[0]).toBe('hero');
  });
});

describe('buildHome upcoming shelf', () => {
  const NOW = 1_000_000;
  const soon = (n: number, releasesAt: number | undefined): Title => ({
    ...t(n),
    releasesAt,
  });
  const upcomingShelf = (upcoming: Title[], input = base) =>
    buildHome({ ...input, upcoming }, NOW).find((s) => s.id === 'upcoming');

  it('comes last and is titled Sắp ra mắt', () => {
    const shelves = buildHome(
      {
        ...base,
        upcoming: [soon(1, NOW + 1), soon(2, NOW + 2), soon(3, NOW + 3)],
      },
      NOW,
    );
    expect(shelves.map((s) => s.id).at(-1)).toBe('upcoming');
    expect(shelves.at(-1)).toMatchObject({
      kind: 'default',
      title: 'Sắp ra mắt',
    });
  });

  it('sorts by release time, soonest first', () => {
    const shelf = upcomingShelf([
      soon(1, NOW + 30),
      soon(2, NOW + 10),
      soon(3, NOW + 20),
    ]);
    expect(paths(shelf!.items)).toEqual([t(2).path, t(3).path, t(1).path]);
  });

  it('drops titles that are past, due now or have no date', () => {
    const shelf = upcomingShelf([
      soon(1, NOW - 1),
      soon(2, NOW),
      soon(3, undefined),
      soon(4, NOW + 1),
      soon(5, NOW + 2),
      soon(6, NOW + 3),
    ]);
    expect(paths(shelf!.items)).toEqual([t(4).path, t(5).path, t(6).path]);
  });

  it('needs its own floor of three, not the eight of the other shelves', () => {
    expect(UPCOMING_MIN_TITLES).toBeLessThan(MIN_SHELF_TITLES);
    expect(upcomingShelf([soon(1, NOW + 1), soon(2, NOW + 2)])).toBeUndefined();
    expect(
      upcomingShelf([soon(1, NOW + 1), soon(2, NOW + 2), soon(3, NOW + 3)]),
    ).toBeDefined();
  });

  it('counts the floor after dropping the past ones', () => {
    expect(
      upcomingShelf([soon(1, NOW - 5), soon(2, NOW + 2), soon(3, NOW + 3)]),
    ).toBeUndefined();
  });

  it('is absent for an empty block', () => {
    expect(upcomingShelf([])).toBeUndefined();
  });

  it('caps the shelf', () => {
    const many = Array.from({ length: 20 }, (_, i) => soon(i, NOW + 20 - i));
    expect(upcomingShelf(many)!.items).toHaveLength(UPCOMING_SHELF_LIMIT);
  });

  it('does not dedupe against other shelves', () => {
    const shared = { ...base.newEpisodes[0]!, releasesAt: NOW + 5 };
    const shelf = upcomingShelf([shared, soon(1, NOW + 6), soon(2, NOW + 7)]);
    expect(paths(shelf!.items)).toContain(shared.path);
    expect(
      paths(
        buildHome({ ...base, upcoming: [shared] }, NOW).find(
          (s) => s.id === 'new-episodes',
        )!.items,
      ),
    ).toContain(shared.path);
  });
});
