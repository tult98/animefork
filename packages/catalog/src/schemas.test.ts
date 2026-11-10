import { describe, expect, it } from 'vitest';
import {
  RankEntrySchema,
  ScheduleDaySchema,
  SearchSuggestionSchema,
  TitleDetailSchema,
  TitleSchema,
  titleIdFromPath,
} from './schemas.ts';

const card = {
  id: 'a4536',
  path: '/phim/call-of-the-night-a4536/',
  name: 'Yofukashi no Uta',
  image: 'http://cdn.example/p.jpg',
};

describe('titleIdFromPath', () => {
  it.each([
    ['/phim/call-of-the-night-a4536/', 'a4536'],
    ['/phim/one-piece-dao-hai-tac-a1/', 'a1'],
    ['/phim/tonikaku-kawaii-a3860/xem-phim.html', 'a3860'],
    ['/phim/a77/', 'a77'],
  ])('reads the id from %s', (path, id) => {
    expect(titleIdFromPath(path)).toBe(id);
  });

  it.each(['/the-loai/hanh-dong/', '/phim/banana2/', '/phim/x-a/', ''])(
    'finds no id in %j',
    (path) => {
      expect(titleIdFromPath(path)).toBeUndefined();
    },
  );
});

describe('TitleSchema', () => {
  it('accepts a card with only the fields every home section carries', () => {
    expect(TitleSchema.parse(card)).toEqual(card);
  });

  it('keeps genres, year and description optional', () => {
    const parsed = TitleSchema.parse({ ...card, rating: 9.4 });
    expect(parsed.genres).toBeUndefined();
    expect(parsed.year).toBeUndefined();
  });

  it.each([
    ['a path outside /phim', { path: '/the-loai/x/' }],
    ['an id that is not a<number>', { id: '4536' }],
    ['a rating above 10', { rating: 479 }],
    ['NaN rating', { rating: Number.NaN }],
    ['an empty name', { name: '' }],
    ['an empty genre list', { genres: [] }],
    ['a free-form release time', { releaseTime: 'tomorrow' }],
  ])('rejects %s', (_label, patch) => {
    expect(TitleSchema.safeParse({ ...card, ...patch }).success).toBe(false);
  });
});

describe('the other schemas', () => {
  it('requires the list parts of a title detail', () => {
    expect(TitleDetailSchema.safeParse(card).success).toBe(false);
    expect(
      TitleDetailSchema.safeParse({
        ...card,
        parts: [],
        episodes: [],
        related: [],
      }).success,
    ).toBe(true);
  });

  it('rejects a rank entry below rank 1', () => {
    expect(RankEntrySchema.safeParse({ ...card, rank: 0 }).success).toBe(false);
  });

  it('rejects an empty schedule day', () => {
    expect(
      ScheduleDaySchema.safeParse({
        weekday: 'Chủ Nhật',
        day: 2,
        month: 10,
        titles: [],
      }).success,
    ).toBe(false);
  });

  it('accepts a suggestion without a status', () => {
    expect(SearchSuggestionSchema.safeParse(card).success).toBe(true);
  });
});
