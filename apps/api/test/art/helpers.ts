import {
  ArtFiller,
  DEFAULT_FILL_CONCURRENCY,
} from '../../src/art/art.filler.ts';
import { ArtService } from '../../src/art/art.service.ts';
import { systemClock } from '../../src/common/clock.ts';
import { BaselineMatcher, type Matcher } from '../../src/art/tmdb/matcher.ts';
import { MemoryArtStore } from '../../src/art/art.store.ts';
import { MemoryRatingsStore } from '../../src/ratings/ratings.store.ts';
import { createTmdbClient } from '../../src/art/tmdb/tmdb.ts';
import type { OverviewTranslator } from '../../src/art/translator.ts';
import { mockTmdb } from './tmdb/tmdb-mock.ts';

export const TONIKAWA = {
  slug: 'tonikaku-kawaii-a3860',
  name: 'Tonikaku Kawaii',
  year: 2020,
  episodeCount: 12,
};

export const NOTHING = { slug: 'nothing-a1', name: 'Nothing Here' };

export function countingTmdb(base: typeof fetch = mockTmdb()) {
  const searches: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/search/tv')) {
      searches.push(url.searchParams.get('query') ?? '');
    }
    return base(input, init);
  };
  return { searches, fetch: fetchImpl };
}

export function setup(
  options: {
    fetch?: typeof fetch;
    concurrency?: number;
    now?: () => Date;
    matcher?: Matcher;
    translator?: OverviewTranslator | null;
  } = {},
) {
  const now = options.now ?? systemClock;
  const store = new MemoryArtStore(now);
  const ratings = new MemoryRatingsStore(now);
  const tmdb = countingTmdb(options.fetch);
  const sync = {
    tmdb: createTmdbClient({ apiKey: 'key', fetch: tmdb.fetch }),
    matcher: options.matcher ?? new BaselineMatcher(),
  };
  const filler = new ArtFiller(
    store,
    sync,
    options.concurrency ?? DEFAULT_FILL_CONCURRENCY,
    now,
    options.translator ?? null,
  );
  const service = new ArtService(store, filler, now, ratings);
  return { store, ratings, filler, service, sync, searches: tmdb.searches };
}
