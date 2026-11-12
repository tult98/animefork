import { describe, expect, it } from 'vitest';
import type { WatchProgressRow } from '../../src/watch-progress/watch-progress.ts';
import { MemoryWatchProgressStore } from '../../src/watch-progress/watch-progress.store.ts';

const T0 = Date.parse('2026-03-01T00:00:00Z');

function row(overrides: Partial<WatchProgressRow> = {}): WatchProgressRow {
  return {
    userId: 'u1',
    slug: 'show',
    episodeId: '1',
    positionS: 10,
    durationS: 1400,
    completed: false,
    titleName: 'Show',
    image: 'https://img.test/show.jpg',
    episodeLabel: 'Episode 1',
    seasonSlug: null,
    updatedAt: new Date(T0),
    ...overrides,
  };
}

describe('MemoryWatchProgressStore', () => {
  it('replaces the row of the same user, slug and episode', async () => {
    const store = new MemoryWatchProgressStore();
    await store.save(row());
    await store.save(
      row({ positionS: 300, updatedAt: new Date(T0 + 1000), titleName: 'New' }),
    );
    const rows = await store.forSlug('u1', 'show');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ positionS: 300, titleName: 'New' });
  });

  it('never unsets completed', async () => {
    const store = new MemoryWatchProgressStore();
    await store.save(row({ completed: true, positionS: 1390 }));
    await store.save(row({ completed: false, positionS: 5 }));
    expect((await store.forSlug('u1', 'show'))[0]).toMatchObject({
      completed: true,
      positionS: 5,
    });
  });

  it('keeps the newest row per slug, newest slug first, up to the limit', async () => {
    const store = new MemoryWatchProgressStore();
    await store.save(
      row({ slug: 'a', episodeId: '1', updatedAt: new Date(T0) }),
    );
    await store.save(
      row({ slug: 'a', episodeId: '2', updatedAt: new Date(T0 + 3000) }),
    );
    await store.save(row({ slug: 'b', updatedAt: new Date(T0 + 2000) }));
    await store.save(row({ slug: 'c', updatedAt: new Date(T0 + 1000) }));

    const latest = await store.latestPerSlug('u1', 2);
    expect(latest.map((r) => [r.slug, r.episodeId])).toEqual([
      ['a', '2'],
      ['b', '1'],
    ]);
  });

  it('lists episodes in numeric order and only for the asked user', async () => {
    const store = new MemoryWatchProgressStore();
    await store.save(row({ episodeId: '10' }));
    await store.save(row({ episodeId: '9' }));
    await store.save(row({ episodeId: '2', userId: 'u2' }));
    expect((await store.forSlug('u1', 'show')).map((r) => r.episodeId)).toEqual(
      ['9', '10'],
    );
    expect(await store.latestPerSlug('u3', 20)).toEqual([]);
  });
});
