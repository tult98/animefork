import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StoredTitle } from '../../src/art/art.store.ts';
import {
  MATCHER_VERSION,
  OVERVIEW_RETRY_AFTER_MS,
} from '../../src/art/retry.ts';
import type { Matcher } from '../../src/art/tmdb/matcher.ts';
import type { OverviewTranslator } from '../../src/art/translator.ts';
import { setup, TONIKAWA } from './helpers.ts';
import * as fx from './tmdb/fixtures.ts';
import { mockTmdb } from './tmdb/tmdb-mock.ts';

const TRANSLATED = 'Bản dịch tiếng Việt của tóm tắt.';
const ENGLISH_ONLY = {
  '/3/tv/100?vi': fx.DETAIL_100_VI_EMPTY,
  '/3/tv/100?en': fx.DETAIL_100_EN,
};

// The episode texts have their own tests, and would add translator calls to the show overview ones.
const STILLS_ONLY = {
  ...fx.SEASON_100_1,
  episodes: fx.SEASON_100_1.episodes.map(({ episode_number, still_path }) => ({
    episode_number,
    still_path,
  })),
};

function recording(overrides: Record<string, unknown> = {}) {
  const overviewCalls: string[] = [];
  const base = mockTmdb({ '/3/tv/100/season/1': STILLS_ONLY, ...overrides });
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const language = url.searchParams.get('language');
    if (language && !url.pathname.includes('/season/')) {
      overviewCalls.push(language);
    }
    return base(input, init);
  };
  return { fetch: fetchImpl, overviewCalls };
}

function fakeTranslator(
  answer: () => Promise<string> = async () => TRANSLATED,
) {
  const translate = vi.fn(answer);
  const translator: OverviewTranslator = { translate };
  return { translator, translate };
}

const matchedRow = (over: Partial<StoredTitle> = {}): StoredTitle => ({
  slug: TONIKAWA.slug,
  status: 'matched',
  tmdbId: 100,
  tmdbSeason: 1,
  matchScope: 'season',
  backdropPath: '/b.jpg',
  backdropLang: 'en',
  posterPath: '/p.jpg',
  posterLang: 'vi',
  reason: null,
  matcherVersion: MATCHER_VERSION,
  attemptedAt: new Date('2026-01-01T00:00:00Z'),
  sourceName: TONIKAWA.name,
  sourceYear: null,
  sourceEpisodeCount: null,
  matchedBy: 'baseline',
  overview: null,
  overviewLang: null,
  overviewTranslated: false,
  overviewStatus: null,
  overviewAttemptedAt: null,
  ...over,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('overview in a new fill', () => {
  it('stores the Vietnamese TMDB overview and answers it with the art', async () => {
    const tmdb = recording();
    const { translator, translate } = fakeTranslator();
    const { store, filler, service } = setup({ fetch: tmdb.fetch, translator });
    await filler.fill(TONIKAWA);
    expect(store.titles.get(TONIKAWA.slug)).toMatchObject({
      status: 'matched',
      overview: fx.DETAIL_100_VI.overview,
      overviewLang: 'vi',
      overviewTranslated: false,
      overviewStatus: 'ok',
    });
    expect(tmdb.overviewCalls).toEqual(['vi']);
    expect(translate).not.toHaveBeenCalled();
    const out = await service.lookup({ titles: [TONIKAWA] });
    expect(out.art[TONIKAWA.slug]).toMatchObject({
      status: 'ready',
      overview: fx.DETAIL_100_VI.overview,
      overviewTranslated: false,
    });
    expect(filler.hasOverview(TONIKAWA.slug)).toBe(false);
  });

  it('translates an English-only overview and stores the translation', async () => {
    const tmdb = recording(ENGLISH_ONLY);
    const { translator, translate } = fakeTranslator();
    const { store, filler, service } = setup({ fetch: tmdb.fetch, translator });
    await filler.fill(TONIKAWA);
    expect(translate).toHaveBeenCalledExactlyOnceWith(
      fx.DETAIL_100_EN.overview,
    );
    expect(store.titles.get(TONIKAWA.slug)).toMatchObject({
      overview: TRANSLATED,
      overviewLang: 'en',
      overviewTranslated: true,
      overviewStatus: 'ok',
    });
    expect(tmdb.overviewCalls).toEqual(['vi', 'en']);
    expect(
      (await service.lookup({ titles: [TONIKAWA] })).art[TONIKAWA.slug],
    ).toMatchObject({ overview: TRANSLATED, overviewTranslated: true });
  });

  it('stores none and never shows English when there is no translator', async () => {
    const { store, filler, service } = setup({
      fetch: mockTmdb(ENGLISH_ONLY),
      translator: null,
    });
    await filler.fill(TONIKAWA);
    expect(store.titles.get(TONIKAWA.slug)).toMatchObject({
      status: 'matched',
      overview: null,
      overviewStatus: 'none',
    });
    expect(
      (await service.lookup({ titles: [TONIKAWA] })).art[TONIKAWA.slug],
    ).toMatchObject({
      status: 'ready',
      overview: null,
      overviewTranslated: false,
    });
  });

  it('stores none when TMDB has neither overview', async () => {
    const { store, filler } = setup({
      fetch: mockTmdb({
        '/3/tv/100?vi': fx.DETAIL_100_VI_EMPTY,
        '/3/tv/100?en': { ...fx.DETAIL_100, overview: '' },
      }),
      translator: fakeTranslator().translator,
    });
    await filler.fill(TONIKAWA);
    expect(store.titles.get(TONIKAWA.slug)?.overviewStatus).toBe('none');
  });

  it.each([
    ['TMDB fails', { '/3/tv/100?vi': undefined }, undefined],
    [
      'DeepSeek fails',
      ENGLISH_ONLY,
      async () => {
        throw new Error('DeepSeek answered 500');
      },
    ],
  ])(
    'keeps the art and stores failed when %s',
    async (_, overrides, answer) => {
      const warn = vi.spyOn(Logger.prototype, 'warn');
      const { store, filler, service } = setup({
        fetch: mockTmdb(overrides),
        translator: fakeTranslator(answer).translator,
      });
      await filler.fill(TONIKAWA);
      expect(store.titles.get(TONIKAWA.slug)).toMatchObject({
        status: 'matched',
        backdropPath: '/en.jpg',
        overview: null,
        overviewStatus: 'failed',
      });
      expect(warn).toHaveBeenCalledWith(
        expect.stringMatching(
          new RegExp(`^overview ${TONIKAWA.slug} failed: `),
        ),
      );
      expect(
        (await service.lookup({ titles: [TONIKAWA] })).art[TONIKAWA.slug],
      ).toMatchObject({
        status: 'ready',
        backdropPath: '/en.jpg',
        overview: null,
      });
    },
  );
});

describe('overview backfill', () => {
  it('fetches the overview of a matched row by its TMDB id, without search or matcher', async () => {
    const tmdb = recording(ENGLISH_ONLY);
    const { translator, translate } = fakeTranslator();
    const match = vi.fn<Matcher['match']>();
    const { store, filler, service, searches } = setup({
      fetch: tmdb.fetch,
      translator,
      matcher: { match },
    });
    store.titles.set(TONIKAWA.slug, matchedRow());

    const first = await service.lookup({ titles: [TONIKAWA] });
    expect(first.art[TONIKAWA.slug]).toEqual({
      status: 'ready',
      backdropPath: '/b.jpg',
      backdropLang: 'en',
      posterPath: '/p.jpg',
      overview: null,
      overviewTranslated: false,
    });
    expect(filler.hasOverview(TONIKAWA.slug)).toBe(true);
    expect(filler.has(TONIKAWA.slug)).toBe(false);
    await filler.idle();

    expect(searches).toEqual([]);
    expect(match).not.toHaveBeenCalled();
    expect(translate).toHaveBeenCalledOnce();
    expect(store.titles.get(TONIKAWA.slug)).toMatchObject({
      backdropPath: '/b.jpg',
      overview: TRANSLATED,
      overviewStatus: 'ok',
    });
    const later = await service.lookup({ titles: [TONIKAWA] });
    expect(later.art[TONIKAWA.slug]).toMatchObject({
      overview: TRANSLATED,
      overviewTranslated: true,
    });
  });

  it('runs one overview job for concurrent lookups of the same slug', async () => {
    const tmdb = recording(ENGLISH_ONLY);
    const { translator, translate } = fakeTranslator();
    const { store, filler, service } = setup({ fetch: tmdb.fetch, translator });
    store.titles.set(TONIKAWA.slug, matchedRow());
    await Promise.all(
      Array.from({ length: 5 }, () => service.lookup({ titles: [TONIKAWA] })),
    );
    await filler.idle();
    expect(tmdb.overviewCalls).toEqual(['vi', 'en']);
    expect(translate).toHaveBeenCalledOnce();
  });

  it('never refetches or retranslates an ok overview', async () => {
    const tmdb = recording();
    const { translator, translate } = fakeTranslator();
    let now = new Date('2026-01-01T00:00:00Z');
    const { store, filler, service } = setup({
      fetch: tmdb.fetch,
      translator,
      now: () => now,
    });
    store.titles.set(
      TONIKAWA.slug,
      matchedRow({
        overview: TRANSLATED,
        overviewLang: 'en',
        overviewTranslated: true,
        overviewStatus: 'ok',
        overviewAttemptedAt: now,
      }),
    );
    now = new Date(now.getTime() + 365 * 86_400_000);
    const out = await service.lookup({ titles: [TONIKAWA] });
    expect(out.art[TONIKAWA.slug]).toMatchObject({
      overview: TRANSLATED,
      overviewTranslated: true,
    });
    expect(filler.hasOverview(TONIKAWA.slug)).toBe(false);
    await filler.idle();
    expect(tmdb.overviewCalls).toEqual([]);
    expect(translate).not.toHaveBeenCalled();
  });

  it.each(['none', 'failed'] as const)(
    'leaves a %s overview alone inside its window and retries it after',
    async (status) => {
      const tmdb = recording();
      const at = new Date('2026-01-01T00:00:00Z');
      let now = new Date(at.getTime() + OVERVIEW_RETRY_AFTER_MS[status] - 1);
      const { store, filler, service } = setup({
        fetch: tmdb.fetch,
        now: () => now,
      });
      store.titles.set(
        TONIKAWA.slug,
        matchedRow({ overviewStatus: status, overviewAttemptedAt: at }),
      );
      await service.lookup({ titles: [TONIKAWA] });
      expect(filler.hasOverview(TONIKAWA.slug)).toBe(false);

      now = new Date(at.getTime() + OVERVIEW_RETRY_AFTER_MS[status]);
      await service.lookup({ titles: [TONIKAWA] });
      expect(filler.hasOverview(TONIKAWA.slug)).toBe(true);
      await filler.idle();
      expect(tmdb.overviewCalls).toEqual(['vi']);
      expect(store.titles.get(TONIKAWA.slug)).toMatchObject({
        overviewStatus: 'ok',
        overview: fx.DETAIL_100_VI.overview,
      });
    },
  );

  it('schedules no overview job for a miss or for a row whose art refill is running', async () => {
    const { store, filler, service } = setup();
    store.titles.set(
      TONIKAWA.slug,
      matchedRow({ matcherVersion: 1, posterPath: null }),
    );
    await service.lookup({ titles: [TONIKAWA] });
    expect(filler.has(TONIKAWA.slug)).toBe(true);
    expect(filler.hasOverview(TONIKAWA.slug)).toBe(false);
    await filler.idle();
    expect(store.titles.get(TONIKAWA.slug)).toMatchObject({
      matcherVersion: MATCHER_VERSION,
      overviewStatus: 'ok',
    });

    const miss = { slug: 'nothing-a1', name: 'Nothing Here' };
    await filler.fill(miss);
    await service.lookup({ titles: [miss] });
    expect(filler.hasOverview(miss.slug)).toBe(false);
  });

  it.each([
    [
      1,
      [
        'find tonikaku-kawaii-a3860,other-a2',
        'find tonikaku-kawaii-a3860',
        'save tonikaku-kawaii-a3860',
        'find other-a2',
        'save other-a2',
      ],
    ],
    [
      2,
      [
        'find tonikaku-kawaii-a3860,other-a2',
        'find tonikaku-kawaii-a3860',
        'find other-a2',
        'save other-a2',
        'save tonikaku-kawaii-a3860',
      ],
    ],
  ])(
    'shares the fill concurrency cap of %i with art fills',
    async (concurrency, order) => {
      const { store, filler, service } = setup({ concurrency });
      store.titles.set('other-a2', matchedRow({ slug: 'other-a2' }));
      const events: string[] = [];
      const find = store.find.bind(store);
      const saveOverview = store.saveOverview.bind(store);
      store.find = async (slugs) => {
        events.push(`find ${slugs.join()}`);
        return find(slugs);
      };
      store.saveOverview = async (slug, tmdbId, result) => {
        events.push(`save ${slug}`);
        return saveOverview(slug, tmdbId, result);
      };
      await service.lookup({
        titles: [TONIKAWA, { slug: 'other-a2', name: 'Other' }],
      });
      expect(filler.has(TONIKAWA.slug)).toBe(true);
      expect(filler.hasOverview('other-a2')).toBe(true);
      await filler.idle();
      expect(events).toEqual(order);
      expect(store.titles.get('other-a2')?.overviewStatus).toBe('ok');
    },
  );

  it('frees the slug when saving the overview throws', async () => {
    const { store, filler, service } = setup();
    store.titles.set(TONIKAWA.slug, matchedRow());
    store.saveOverview = async () => {
      throw new Error('db down');
    };
    await service.lookup({ titles: [TONIKAWA] });
    await expect(filler.idle()).resolves.toBeUndefined();
    expect(filler.hasOverview(TONIKAWA.slug)).toBe(false);
  });
});
