// @vitest-environment jsdom
import fetchMock from '@fetch-mock/vitest';
import { describe, expect, it } from 'vitest';
import { avsSubmissions, submitAvs } from '../avs-submit.ts';
import { parseCard } from '../card-parser.ts';
import type { TitleShelf } from '../shelves.ts';
import type { Title } from '../title.ts';

describe('the AVS voter count of a card', () => {
  const card = (attrs: string) =>
    new DOMParser().parseFromString(
      `<article class="TPostMv"><a href="/phim/a-1/"><h2 class="Title">A</h2></a><div class="anime-avg-user-rating"${attrs}>8.4</div></article>`,
      'text/html',
    ).body.firstElementChild!;

  it('is read from the score badge title, and unknown without one', () => {
    expect(
      parseCard(
        card(' title="8.4 trong số 10 dựa trên 1,284 thành viên đánh giá"'),
      ).avsVoters,
    ).toBe(1284);
    expect(parseCard(card('')).avsVoters).toBeUndefined();
  });
});

describe('sending the AVS ratings the page already shows', () => {
  const title = (slug: string, avsVoters?: number): Title => ({
    path: `/phim/${slug}/`,
    name: slug,
    image: 'i.jpg',
    rating: 8.4,
    episodeLabel: 'Tập 1',
    genres: [],
    quality: 'HD',
    ...(avsVoters !== undefined && { avsVoters }),
  });

  it('picks the stale titles that show a voter count, once each', () => {
    const shelves: TitleShelf[] = [
      { kind: 'hero', id: 'hero', items: [title('a-1'), title('b-2', 50)] },
      {
        kind: 'default',
        id: 'new-episodes',
        title: 'New',
        items: [title('b-2', 50), title('c-3', 1284), title('d-4', 9)],
      },
    ];

    expect(avsSubmissions(shelves, ['a-1', 'b-2', 'c-3', 'not-shown'])).toEqual(
      [
        { slug: 'b-2', score: 8.4, voters: 50, quality: 'HD' },
        { slug: 'c-3', score: 8.4, voters: 1284, quality: 'HD' },
      ],
    );
    expect(avsSubmissions(shelves, [])).toEqual([]);
  });

  it('posts 120 ratings in batches of 50', async () => {
    fetchMock.post('path:/v1/ratings/avs', 204);
    const items = Array.from({ length: 120 }, (_, i) => ({
      slug: `s-${i}`,
      score: 8,
      voters: i,
    }));

    await submitAvs('https://api.test/', items);

    expect(fetchMock).toHaveFetchedTimes(3, 'path:/v1/ratings/avs');
    expect(fetchMock).toHaveNthPosted(1, 'path:/v1/ratings/avs', {
      body: { items: items.slice(0, 50) },
    });
    expect(fetchMock).toHaveNthPosted(3, 'path:/v1/ratings/avs', {
      body: { items: items.slice(100) },
    });
  });

  it('fails when the API answers an error', async () => {
    fetchMock.post('path:/v1/ratings/avs', 500);

    await expect(
      submitAvs('https://api.test', [{ slug: 'a-1', score: 8, voters: 1 }]),
    ).rejects.toThrow('500');
  });
});
