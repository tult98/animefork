import { describe, expect, it } from 'vitest';
import { TitleListSchema, TitleSchema } from '../title.ts';

const valid = {
  path: '/phim/x-a1/',
  name: 'X',
  rating: 8,
  episodeLabel: 'Tap 1',
  image: '/p.svg',
};

describe('TitleSchema', () => {
  it('accepts a complete title', () => {
    expect(TitleSchema.parse(valid)).toEqual({ ...valid, genres: [] });
  });

  it.each([
    ['NaN rating', { ...valid, rating: Number.NaN }],
    ['rating above 10', { ...valid, rating: 11 }],
    ['missing episode label', { ...valid, episodeLabel: undefined }],
    ['empty name', { ...valid, name: '' }],
  ])('rejects %s', (_label, input) => {
    expect(TitleSchema.safeParse(input).success).toBe(false);
  });

  it('rejects an empty list so a blank page is an error, not an empty screen', () => {
    expect(TitleListSchema.safeParse([]).success).toBe(false);
  });
});
