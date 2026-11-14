import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../test-app.ts';

const snapshot = {
  titleName: 'Black Clover',
  image: 'https://img.test/bc.jpg',
  genres: ['Action'],
};

async function signedInUser() {
  const app = await buildApp({ now: new Date('2026-03-01T00:00:00Z') });
  const cookie = await app.signedIn(`ana-${randomUUID()}@example.test`);
  return { ...app, cookie };
}

describe('library', () => {
  it('answers 401 without a session', async () => {
    const { http } = await buildApp();

    const res = await http().get('/v1/library');

    expect(res.status).toBe(401);
  });

  it('keeps one rating per title when it switches from like to dislike, and clears it', async () => {
    const { http, cookie } = await signedInUser();

    await http()
      .put('/v1/library/ratings/bc-s1')
      .set('Cookie', cookie)
      .send({ ...snapshot, rating: 'like' });
    const switched = await http()
      .put('/v1/library/ratings/bc-s1')
      .set('Cookie', cookie)
      .send({ ...snapshot, rating: 'dislike' });

    expect(switched.status).toBe(200);
    expect(switched.body).toEqual({
      slug: 'bc-s1',
      rating: 'dislike',
      ...snapshot,
      updatedAt: '2026-03-01T00:00:00.000Z',
    });
    const library = await http().get('/v1/library').set('Cookie', cookie);
    expect(library.body.ratings).toHaveLength(1);

    const cleared = await http()
      .delete('/v1/library/ratings/bc-s1')
      .set('Cookie', cookie);
    const again = await http()
      .delete('/v1/library/ratings/bc-s1')
      .set('Cookie', cookie);

    expect(cleared.status).toBe(204);
    expect(again.status).toBe(204);
    const empty = await http().get('/v1/library').set('Cookie', cookie);
    expect(empty.body.ratings).toEqual([]);
  });

  it('rates each season on its own', async () => {
    const { http, cookie } = await signedInUser();

    await http()
      .put('/v1/library/ratings/bc-s1')
      .set('Cookie', cookie)
      .send({ ...snapshot, rating: 'dislike' });
    await http()
      .put('/v1/library/ratings/bc-s2')
      .set('Cookie', cookie)
      .send({ ...snapshot, rating: 'like' });

    const library = await http().get('/v1/library').set('Cookie', cookie);
    const bySlug = Object.fromEntries(
      library.body.ratings.map((r: { slug: string; rating: string }) => [
        r.slug,
        r.rating,
      ]),
    );
    expect(bySlug).toEqual({ 'bc-s1': 'dislike', 'bc-s2': 'like' });
  });

  it('creates a playlist, rejects a duplicate name, adds an item once and removes it', async () => {
    const { http, cookie } = await signedInUser();

    const created = await http()
      .post('/v1/library/playlists')
      .set('Cookie', cookie)
      .send({ name: '  Favorites ' });
    const duplicate = await http()
      .post('/v1/library/playlists')
      .set('Cookie', cookie)
      .send({ name: 'favorites' });

    expect(created.status).toBe(201);
    expect(created.body).toEqual({
      id: expect.any(String),
      name: 'Favorites',
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body).toEqual({ error: 'playlist_name_taken' });

    const itemPath = `/v1/library/playlists/${created.body.id}/items/bc-s1`;
    await http().put(itemPath).set('Cookie', cookie).send(snapshot);
    const second = await http()
      .put(itemPath)
      .set('Cookie', cookie)
      .send(snapshot);

    expect(second.status).toBe(204);
    const withItem = await http().get('/v1/library').set('Cookie', cookie);
    expect(withItem.body.playlists).toEqual([
      {
        id: created.body.id,
        name: 'Favorites',
        items: [
          { slug: 'bc-s1', ...snapshot, addedAt: '2026-03-01T00:00:00.000Z' },
        ],
      },
    ]);

    const removed = await http().delete(itemPath).set('Cookie', cookie);
    const removedAgain = await http().delete(itemPath).set('Cookie', cookie);

    expect(removed.status).toBe(204);
    expect(removedAgain.status).toBe(204);
    const empty = await http().get('/v1/library').set('Cookie', cookie);
    expect(empty.body.playlists[0].items).toEqual([]);
  });

  it('treats another user’s playlist as not found', async () => {
    const { http, cookie, signedIn } = await signedInUser();
    const created = await http()
      .post('/v1/library/playlists')
      .set('Cookie', cookie)
      .send({ name: 'Mine' });
    const other = await signedIn(`bo-${randomUUID()}@example.test`);
    const itemPath = `/v1/library/playlists/${created.body.id}/items/bc-s1`;

    const add = await http().put(itemPath).set('Cookie', other).send(snapshot);
    const remove = await http().delete(itemPath).set('Cookie', other);
    const unknown = await http()
      .put(`/v1/library/playlists/${randomUUID()}/items/bc-s1`)
      .set('Cookie', other)
      .send(snapshot);

    expect(add.status).toBe(404);
    expect(remove.status).toBe(404);
    expect(unknown.status).toBe(404);
    const library = await http().get('/v1/library').set('Cookie', cookie);
    expect(library.body.playlists[0].items).toEqual([]);
  });
});
