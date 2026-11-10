import type { Home } from 'catalog';
import { describe, expect, it } from 'vitest';
import { flattenHome } from './home.ts';
import { TitleListSchema, TitleSchema } from './title.ts';

const valid = {
  id: 'a1',
  path: '/phim/x-a1/',
  name: 'X',
  rating: 8,
  episodeLabel: 'Tap 1',
  image: '/p.svg',
};

describe('TitleSchema', () => {
  it('accepts a complete title', () => {
    expect(TitleSchema.parse(valid)).toEqual(valid);
  });

  it('accepts a card without rating or episode label', () => {
    const bare = { ...valid, rating: undefined, episodeLabel: undefined };
    expect(TitleSchema.safeParse(bare).success).toBe(true);
  });

  it.each([
    ['NaN rating', { ...valid, rating: Number.NaN }],
    ['rating above 10', { ...valid, rating: 11 }],
    ['missing id', { ...valid, id: undefined }],
    ['empty name', { ...valid, name: '' }],
  ])('rejects %s', (_label, input) => {
    expect(TitleSchema.safeParse(input).success).toBe(false);
  });

  it('rejects an empty list so a blank page is an error, not an empty screen', () => {
    expect(TitleListSchema.safeParse([]).success).toBe(false);
  });
});

describe('flattenHome', () => {
  const card = (id: string, image: string) => ({
    id,
    path: `/phim/x-${id}/`,
    name: id,
    image,
  });

  it('keeps the poster card over the carousel banner of the same title', () => {
    const home: Home = {
      carousel: [card('a1', 'banner.jpg')],
      thisSeason: [card('a1', 'poster.jpg'), card('a2', 'poster.jpg')],
      lastUpdate: [],
      preRelease: [],
      nominate: [],
      hotUpdate: [],
    };
    expect(flattenHome(home).map((t) => [t.id, t.image])).toEqual([
      ['a1', 'poster.jpg'],
      ['a2', 'poster.jpg'],
    ]);
  });
});
