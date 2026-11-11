import { describe, expect, it } from 'vitest';
import type { MalClient } from '../../src/mal/mal.client.ts';
import { MalFiller } from '../../src/mal/mal.filler.ts';
import { MAL_REFRESH_AFTER_MS } from '../../src/mal/mal.retry.ts';
import { MemoryMalStore } from '../../src/mal/mal.store.ts';
import { ArtService } from '../../src/art/art.service.ts';
import { LookupResponseSchema } from '../../src/art/contract.ts';
import { setup } from '../art/helpers.ts';
import { candidate } from './helpers.ts';

const TITLE = {
  slug: 'black-clover-a1',
  name: 'Black Clover',
  year: 2017,
  episodeCount: 170,
};

function withMal(client: Partial<MalClient> = {}) {
  let t = new Date('2026-01-01T00:00:00Z').getTime();
  const now = () => new Date(t);
  const base = setup({ now });
  const mal = new MemoryMalStore(now);
  const searches: string[] = [];
  const malClient: MalClient = {
    search: async (q) => {
      searches.push(q);
      return [candidate()];
    },
    stats: async (id) => ({
      id,
      score: 8,
      voters: 100,
      rank: 10,
      popularity: 20,
      members: 300,
    }),
    ...client,
  };
  const malFiller = new MalFiller(mal, malClient, now);
  const service = new ArtService(
    base.store,
    base.filler,
    now,
    base.ratings,
    mal,
    malFiller,
  );
  return {
    service,
    malFiller,
    mal,
    searches,
    advance: (ms: number) => (t += ms),
  };
}

describe('lookup with MyAnimeList', () => {
  it('answers pending at once, fills in the background, then answers the numbers', async () => {
    const { service, malFiller, searches } = withMal();
    const first = await service.lookup({ titles: [TITLE] });
    expect(first.ratingsPending).toBe(true);
    expect(first.ratings?.[TITLE.slug]?.mal).toBeUndefined();
    expect(malFiller.has(TITLE.slug)).toBe(true);
    await malFiller.idle();

    const later = await service.lookup({ titles: [TITLE] });
    expect(later.ratingsPending).toBeUndefined();
    expect(later.ratings?.[TITLE.slug]?.mal).toEqual({
      id: 1,
      score: 7.55,
      voters: 69596,
      rank: 2006,
      popularity: 1762,
      members: 157000,
    });
    expect(searches).toHaveLength(1);
  });

  it('does not ask MAL again for a title already being filled', async () => {
    const { service, searches, malFiller } = withMal();
    await service.lookup({ titles: [TITLE] });
    await service.lookup({ titles: [TITLE] });
    await malFiller.idle();
    expect(searches).toHaveLength(1);
  });

  it('serves a stale row at once and refreshes it without asking the page to wait', async () => {
    const { service, malFiller, advance } = withMal();
    await service.lookup({ titles: [TITLE] });
    await malFiller.idle();
    advance(MAL_REFRESH_AFTER_MS);
    const res = await service.lookup({ titles: [TITLE] });
    expect(res.ratings?.[TITLE.slug]?.mal?.score).toBe(7.55);
    expect(res.ratingsPending).toBeUndefined();
    await malFiller.idle();
    const after = await service.lookup({ titles: [TITLE] });
    expect(after.ratings?.[TITLE.slug]?.mal?.score).toBe(8);
  });

  it('gives a title with no match no MAL block and stops being pending', async () => {
    const { service, malFiller } = withMal({ search: async () => [] });
    await service.lookup({ titles: [TITLE] });
    await malFiller.idle();
    const res = await service.lookup({ titles: [TITLE] });
    expect(res.ratingsPending).toBeUndefined();
    expect(res.ratings?.[TITLE.slug]?.mal).toBeUndefined();
  });

  it('keeps unknown numbers as null in a response the web can parse', async () => {
    const { service, malFiller } = withMal({
      search: async () => [
        candidate({ rank: null, score: null, voters: null }),
      ],
    });
    await service.lookup({ titles: [TITLE] });
    await malFiller.idle();
    const res = await service.lookup({ titles: [TITLE] });
    expect(
      LookupResponseSchema.parse(JSON.parse(JSON.stringify(res))).ratings?.[
        TITLE.slug
      ]?.mal,
    ).toMatchObject({
      rank: null,
      score: null,
    });
  });

  it('never touches MAL, and never reports pending, when it is switched off', async () => {
    const { service } = setup();
    const res = await service.lookup({ titles: [TITLE] });
    expect(res.ratingsPending).toBeUndefined();
    expect(res.ratings).toEqual({});
  });
});
