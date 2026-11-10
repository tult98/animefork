// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LookupRequestSchema } from '../../../../art-api/src/contract.ts';
import { lookupTitles, watchLookupTitle } from './lookup.ts';
import type { HomeShelves } from './shelves.ts';
import type { Title } from './title.ts';
import { parseWatchPage } from './watch.ts';

const t = (slug: string, over: Partial<Title> = {}): Title => ({
  path: `/phim/${slug}/`,
  name: slug,
  image: '/p.jpg',
  rating: 8,
  episodeLabel: 'Tập 1',
  genres: [],
  ...over,
});

describe('lookupTitles', () => {
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

  it('lists each slug of the hero and card shelves once, not the ranking row', () => {
    expect(lookupTitles(shelves).map((e) => e.slug)).toEqual([
      'a-1',
      'b-2',
      'c-3',
    ]);
  });

  it('keeps the card name, and adds the season marker and known fields', () => {
    const [a, b, c] = lookupTitles(shelves);
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
    const [entry] = lookupTitles([
      {
        kind: 'default',
        id: 'new-episodes',
        title: 'New',
        items: [t('e-5', { episodeLabel: 'Tập 5' })],
      },
    ]);
    expect(entry?.episodeCount).toBeUndefined();
  });

  it('drops fields and titles the contract would refuse', () => {
    const out = lookupTitles([
      {
        kind: 'default',
        id: 'new-episodes',
        title: 'New',
        items: [
          t('ok-1', { name: 'x'.repeat(250), year: 1800, episodeLabel: '1/0' }),
          t('Bad_Slug'),
        ],
      },
    ]);
    expect(out).toEqual([{ slug: 'ok-1', name: 'x'.repeat(200) }]);
  });

  it('builds a request the art API accepts', () => {
    const json = JSON.parse(JSON.stringify({ titles: lookupTitles(shelves) }));
    expect(LookupRequestSchema.safeParse(json).success).toBe(true);
  });
});

describe('watchLookupTitle', () => {
  const page = (slug: string) =>
    parseWatchPage(
      readFileSync(
        resolve(
          import.meta.dirname,
          `../../../public/fixtures/default/phim/${slug}/xem-phim.html`,
        ),
        'utf8',
      ),
      slug,
    );

  it('drops a trailing release tag from the page title', () => {
    expect(watchLookupTitle(page('tonikaku-kawaii-a3860'))).toEqual({
      slug: 'tonikaku-kawaii-a3860',
      name: 'Tonikaku Kawaii',
    });
  });

  it('takes the season from the page title', () => {
    expect(watchLookupTitle(page('tonikaku-kawaii-2nd-season-a4476'))).toEqual({
      slug: 'tonikaku-kawaii-2nd-season-a4476',
      name: 'Tonikaku Kawaii 2nd Season',
      seasonName: '2nd Season',
    });
  });
});
