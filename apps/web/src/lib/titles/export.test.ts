import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { TitleInputSchema } from '../../../../art-api/src/contract.ts';
import { exportTitles } from './export.ts';
import type { HomeShelves } from './shelves.ts';
import type { Title } from './title.ts';

const t = (slug: string, over: Partial<Title> = {}): Title => ({
  path: `/phim/${slug}/`,
  name: slug,
  image: '/p.jpg',
  rating: 8,
  episodeLabel: 'Tập 1',
  genres: [],
  ...over,
});

describe('exportTitles', () => {
  const shelves: HomeShelves = [
    {
      kind: 'hero',
      id: 'hero',
      items: [
        t('a-1', { name: 'Show A', year: 2026, episodeLabel: '05/12' }),
        t('b-2', { name: 'Show B 2nd Season', episodeLabel: '05/??' }),
      ],
    },
    {
      kind: 'default',
      id: 'new-episodes',
      title: 'New',
      items: [t('a-1', { name: 'Show A' }), t('c-3', { name: 'Show C Mùa 3' })],
    },
    {
      kind: 'top10',
      id: 'top-10-today',
      title: 'Top',
      items: [{ ...t('d-4', { name: 'Show D' }), rank: 1 }],
    },
  ];

  it('lists each slug once across every shelf, ranking included', () => {
    expect(exportTitles(shelves).map((e) => e.slug)).toEqual([
      'a-1',
      'b-2',
      'c-3',
      'd-4',
    ]);
  });

  it('keeps the card name, and adds the season marker and known fields', () => {
    const [a, b, c] = exportTitles(shelves);
    expect(a).toMatchObject({ name: 'Show A', year: 2026, episodeCount: 12 });
    expect(a?.seasonName).toBeUndefined();
    expect(b).toMatchObject({
      name: 'Show B 2nd Season',
      seasonName: '2nd Season',
    });
    expect(b?.episodeCount).toBeUndefined();
    expect(c?.seasonName).toBe('Mùa 3');
  });

  it('does not treat the current episode as the episode total', () => {
    const [entry] = exportTitles([
      {
        kind: 'default',
        id: 'new-episodes',
        title: 'New',
        items: [t('e-5', { episodeLabel: 'Tập 5' })],
      },
    ]);
    expect(entry?.episodeCount).toBeUndefined();
  });

  it('round-trips through the art-sync titles schema', () => {
    const json = JSON.parse(JSON.stringify(exportTitles(shelves)));
    expect(z.array(TitleInputSchema).safeParse(json).success).toBe(true);
  });
});
