import { ArtFiller } from '../../src/art/art.filler.ts';
import { BaselineMatcher } from '../../src/art/tmdb/matcher.ts';
import { MemoryStore } from '../../src/art/art.store.ts';
import { createTmdbClient } from '../../src/art/tmdb/tmdb.ts';
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
  } = {},
) {
  const store = new MemoryStore({ now: options.now });
  const tmdb = countingTmdb(options.fetch);
  const filler = new ArtFiller({
    store,
    sync: {
      tmdb: createTmdbClient({ apiKey: 'key', fetch: tmdb.fetch }),
      matcher: new BaselineMatcher(),
    },
    concurrency: options.concurrency,
    now: options.now,
  });
  return { store, filler, searches: tmdb.searches };
}
