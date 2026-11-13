import { randomUUID } from 'node:crypto';
import fetchMock from '@fetch-mock/vitest';
import type pg from 'pg';
import { describe, expect, it } from 'vitest';
import { ArtFiller } from '../../src/art/art.filler.ts';
import { PG_POOL } from '../../src/database/migration-runner.ts';
import { buildApp } from '../test-app.ts';

describe('AVS ratings', () => {
  it('stores a submitted rating to one decimal and answers it on lookups, flagged stale again after a week', async () => {
    const { http, app, advance } = await buildApp({
      now: new Date(),
      env: { TMDB_API_BASE: 'https://tmdb.test/3' },
    });
    const slug = `black-clover-${randomUUID()}`;
    // Every lookup also starts an art fill for the title, which finds nothing here.
    fetchMock.get('begin:https://tmdb.test/3/search/tv', { results: [] });

    const submitted = await http()
      .post('/v1/ratings/avs')
      .send({ items: [{ slug, score: 8.24, voters: 1284, quality: 'HD' }] });

    expect(submitted.status).toBe(204);
    const fresh = await http()
      .post('/v1/art/lookup')
      .send({ titles: [{ slug, name: 'Black Clover' }] });
    expect(fresh.body.ratings).toEqual({
      [slug]: { avs: { score: 8.2, voters: 1284 }, quality: 'HD' },
    });
    expect(fresh.body.avsStale).toEqual([]);
    await app.get(ArtFiller).idle();
    advance(8 * 24 * 60 * 60_000);
    const aged = await http()
      .post('/v1/art/lookup')
      .send({ titles: [{ slug, name: 'Black Clover' }] });
    expect(aged.body.ratings).toEqual({
      [slug]: { avs: { score: 8.2, voters: 1284 }, quality: 'HD' },
    });
    expect(aged.body.avsStale).toEqual([slug]);
    await app.get(ArtFiller).idle();
  });

  it('rejects a rating above 10', async () => {
    const { http } = await buildApp();

    const res = await http()
      .post('/v1/ratings/avs')
      .send({ items: [{ slug: 'black-clover', score: 11, voters: 1 }] });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'invalid_request' });
  });

  it('keeps the last rating of a title sent twice in one submission, and ignores a new one within the hour', async () => {
    const { http, app } = await buildApp({
      env: { TMDB_API_BASE: 'https://tmdb.test/3' },
    });
    const slug = `black-clover-${randomUUID()}`;
    fetchMock.get('begin:https://tmdb.test/3/search/tv', { results: [] });
    await http()
      .post('/v1/ratings/avs')
      .send({
        items: [
          { slug, score: 7, voters: 1 },
          { slug, score: 9, voters: 5 },
        ],
      });

    const again = await http()
      .post('/v1/ratings/avs')
      .send({ items: [{ slug, score: 1, voters: 99 }] });

    expect(again.status).toBe(204);
    const res = await http()
      .post('/v1/art/lookup')
      .send({ titles: [{ slug, name: 'Black Clover' }] });
    expect(res.body.ratings).toEqual({
      [slug]: { avs: { score: 9, voters: 5 } },
    });
    await app.get(ArtFiller).idle();
  });

  it('replaces a rating stored over an hour ago, and keeps its quality when the new one sends none', async () => {
    const { http, app } = await buildApp({
      env: { TMDB_API_BASE: 'https://tmdb.test/3' },
    });
    const slug = `black-clover-${randomUUID()}`;
    fetchMock.get('begin:https://tmdb.test/3/search/tv', { results: [] });
    await http()
      .post('/v1/ratings/avs')
      .send({ items: [{ slug, score: 7, voters: 1, quality: 'FHD' }] });
    // The store stamps a rating with the database clock, which `advance` does not move.
    await app
      .get<pg.Pool>(PG_POOL)
      .query(
        `update title_ratings set avs_fetched_at = now() - interval '2 hours' where source_slug = $1`,
        [slug],
      );

    await http()
      .post('/v1/ratings/avs')
      .send({ items: [{ slug, score: 6, voters: 2 }] });

    const res = await http()
      .post('/v1/art/lookup')
      .send({ titles: [{ slug, name: 'Black Clover' }] });
    expect(res.body.ratings).toEqual({
      [slug]: { avs: { score: 6, voters: 2 }, quality: 'FHD' },
    });
    await app.get(ArtFiller).idle();
  });
});
