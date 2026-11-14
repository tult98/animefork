import { describe, expect, it } from 'vitest';
import type { LibraryResponse } from '../../../../../api/src/library/contract.ts';
import type { Title } from '../../titles/title.ts';
import {
  countsOf,
  playlistsContaining,
  ratingOf,
  sectionsOf,
  slugOf,
  snapshotOf,
  withRating,
} from '../model.ts';

const snap = (name: string) => ({
  titleName: name,
  image: `https://img.test/${name}.jpg`,
  genres: ['Action'],
});

const library: LibraryResponse = {
  ratings: [
    { slug: 'alpha', rating: 'like', ...snap('alpha'), updatedAt: 't1' },
    { slug: 'beta', rating: 'dislike', ...snap('beta'), updatedAt: 't2' },
  ],
  playlists: [
    {
      id: 'p1',
      name: 'Weekend',
      items: [{ slug: 'alpha', ...snap('alpha'), addedAt: 't3' }],
    },
    { id: 'p2', name: 'Empty', items: [] },
  ],
};

describe('library model', () => {
  it('keys a title by the watch-page slug', () => {
    const title = {
      path: '/phim/alpha-a1/',
      name: 'Alpha',
      image: 'https://img.test/a.jpg',
      genres: ['Action'],
    } as Title;
    expect(slugOf(title)).toBe('alpha-a1');
    expect(snapshotOf(title)).toEqual({
      titleName: 'Alpha',
      image: 'https://img.test/a.jpg',
      genres: ['Action'],
    });
  });

  it('reads a rating per slug, so seasons are independent', () => {
    expect(ratingOf(library, 'alpha')).toBe('like');
    expect(ratingOf(library, 'beta')).toBe('dislike');
    expect(ratingOf(library, 'alpha-s2')).toBe('none');
  });

  it('switching a rating moves the title between sections and leaves other slugs alone', () => {
    const next = withRating(library, 'alpha', 'dislike', snap('alpha'), 't9');
    expect(ratingOf(next, 'alpha')).toBe('dislike');
    expect(ratingOf(next, 'beta')).toBe('dislike');
    expect(sectionsOf(next).liked).toEqual([]);
    expect(
      ratingOf(withRating(next, 'alpha', 'none', snap('alpha'), 't9'), 'alpha'),
    ).toBe('none');
  });

  it('lists the playlists that contain a title', () => {
    expect(playlistsContaining(library, 'alpha')).toEqual(['p1']);
    expect(playlistsContaining(library, 'beta')).toEqual([]);
  });

  it('builds a section per rating and per playlist with counts', () => {
    const sections = sectionsOf(library);
    expect(sections.liked.map((t) => t.slug)).toEqual(['alpha']);
    expect(sections.disliked.map((t) => t.slug)).toEqual(['beta']);
    expect(sections.playlists.map((p) => [p.id, p.titles.length])).toEqual([
      ['p1', 1],
      ['p2', 0],
    ]);
    expect(countsOf(library)).toEqual({
      liked: 1,
      disliked: 1,
      playlists: { p1: 1, p2: 0 },
    });
  });
});
