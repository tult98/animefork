import { describe, expect, it } from 'vitest';
import {
  LookupRequestSchema,
  LookupResponseSchema,
  MAX_TITLES_PER_LOOKUP,
  normalizeOtherNames,
  TitleInputSchema,
  tmdbImageUrl,
  type LookupResponse,
} from '../../src/art/contract.ts';

describe('contract', () => {
  it('round-trips a response through JSON', () => {
    const response: LookupResponse = {
      art: {
        a: {
          status: 'ready',
          backdropPath: '/b.jpg',
          backdropLang: 'vi',
          posterPath: '/p.jpg',
          stills: { '1': '/s1.jpg' },
        },
        b: {
          status: 'ready',
          backdropPath: null,
          backdropLang: null,
          posterPath: null,
        },
        c: { status: 'pending' },
        d: { status: 'none' },
        e: {
          status: 'ready',
          backdropPath: '/e.jpg',
          backdropLang: 'en',
          posterPath: null,
          overview: 'Tóm tắt.',
          overviewTranslated: true,
        },
        f: {
          status: 'ready',
          backdropPath: null,
          backdropLang: null,
          posterPath: null,
          overview: null,
          overviewTranslated: false,
        },
      },
    };
    expect(
      LookupResponseSchema.parse(JSON.parse(JSON.stringify(response))),
    ).toEqual(response);
  });

  it('rejects an unknown status and a non-numeric still key', () => {
    expect(
      LookupResponseSchema.safeParse({ art: { a: { status: 'done' } } })
        .success,
    ).toBe(false);
    expect(
      LookupResponseSchema.safeParse({
        art: {
          a: {
            status: 'ready',
            backdropPath: null,
            backdropLang: null,
            posterPath: null,
            stills: { one: '/s.jpg' },
          },
        },
      }).success,
    ).toBe(false);
  });

  it('accepts a ready entry without the overview fields and refuses an empty overview', () => {
    const entry = {
      status: 'ready',
      backdropPath: null,
      backdropLang: null,
      posterPath: null,
    };
    expect(LookupResponseSchema.safeParse({ art: { a: entry } }).success).toBe(
      true,
    );
    for (const bad of [
      { ...entry, overview: '' },
      { ...entry, overview: 1 },
      { ...entry, overviewTranslated: 'yes' },
    ]) {
      expect(LookupResponseSchema.safeParse({ art: { a: bad } }).success).toBe(
        false,
      );
    }
  });

  it('bounds titles and their fields', () => {
    const title = { slug: 'a-1', name: 'A' };
    expect(TitleInputSchema.safeParse(title).success).toBe(true);
    // Real slugs of long light-novel titles reach 230 characters.
    expect(
      TitleInputSchema.safeParse({ ...title, slug: `${'a-'.repeat(115)}a1` })
        .success,
    ).toBe(true);
    for (const bad of [
      { ...title, slug: 'A_1' },
      { ...title, slug: 'a'.repeat(401) },
      { ...title, name: '' },
      { ...title, name: 'x'.repeat(201) },
      { ...title, seasonName: 'x'.repeat(101) },
      { ...title, year: 1899 },
      { ...title, episodeCount: 0 },
      { ...title, episodeCount: 2001 },
    ]) {
      expect(TitleInputSchema.safeParse(bad).success).toBe(false);
    }
    expect(LookupRequestSchema.safeParse({ titles: [] }).success).toBe(false);
    expect(
      LookupRequestSchema.safeParse({
        titles: Array(MAX_TITLES_PER_LOOKUP + 1).fill(title),
      }).success,
    ).toBe(false);
  });

  it('cleans the other names a client sends', () => {
    const parsed = TitleInputSchema.parse({
      slug: 'a-1',
      name: 'Đấu La Đại Lục',
      otherNames: [
        '  Soul Land ',
        '',
        '   ',
        'soul land',
        'đấu la đại lục',
        'x'.repeat(121),
        'x'.repeat(120),
        'Douluo Dalu',
        'A',
        'B',
        'C',
      ],
    });
    expect(parsed.otherNames).toEqual([
      'Soul Land',
      'x'.repeat(120),
      'Douluo Dalu',
      'A',
      'B',
    ]);
  });

  it('leaves out other names when none survive, and accepts a title without them', () => {
    expect(
      TitleInputSchema.parse({
        slug: 'a-1',
        name: 'A',
        otherNames: [' a', ''],
      }),
    ).toEqual({ slug: 'a-1', name: 'A' });
    expect(TitleInputSchema.parse({ slug: 'a-1', name: 'A' })).toEqual({
      slug: 'a-1',
      name: 'A',
    });
  });

  it('refuses other names of the wrong shape', () => {
    const title = { slug: 'a-1', name: 'A' };
    for (const otherNames of [
      'Soul Land',
      [1],
      ['x'.repeat(401)],
      Array(21).fill('B'),
    ]) {
      expect(TitleInputSchema.safeParse({ ...title, otherNames }).success).toBe(
        false,
      );
    }
  });

  it('normalizes names on its own for callers outside the schema', () => {
    expect(normalizeOtherNames(['B', ' b ', 'C'], 'c')).toEqual(['B']);
    expect(normalizeOtherNames([])).toEqual([]);
  });

  it('joins size and path into a TMDB image url', () => {
    expect(tmdbImageUrl('/a.jpg', 'w300')).toBe(
      'https://image.tmdb.org/t/p/w300/a.jpg',
    );
  });
});
