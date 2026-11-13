import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../test-app.ts';

describe('watch progress', () => {
  it('answers 401 without a session', async () => {
    const { http } = await buildApp();

    const res = await http().get('/v1/watch-progress');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unauthenticated' });
  });

  it('saves an episode and shows it on the shelf and in the title’s episode list', async () => {
    const { http, signedIn } = await buildApp({
      now: new Date('2026-03-01T00:00:00Z'),
    });
    const cookie = await signedIn(`ana-${randomUUID()}@example.test`);

    const saved = await http()
      .put('/v1/watch-progress')
      .set('Cookie', cookie)
      .send({
        slug: 'black-clover-a474',
        episodeId: '1',
        positionS: 100,
        durationS: 1400,
        titleName: 'Black Clover',
        image: 'https://img.test/black-clover.jpg',
        episodeLabel: 'Episode 1',
        seasonSlug: 'black-clover-season-2',
      });

    expect(saved.status).toBe(200);
    expect(saved.body).toEqual({
      episodeId: '1',
      positionS: 100,
      durationS: 1400,
      completed: false,
    });
    const shelf = await http().get('/v1/watch-progress').set('Cookie', cookie);
    expect(shelf.body).toEqual({
      items: [
        {
          slug: 'black-clover-a474',
          episodeId: '1',
          episodeLabel: 'Episode 1',
          titleName: 'Black Clover',
          image: 'https://img.test/black-clover.jpg',
          seasonSlug: 'black-clover-season-2',
          positionS: 100,
          durationS: 1400,
          completed: false,
          updatedAt: '2026-03-01T00:00:00.000Z',
        },
      ],
    });
    const episodes = await http()
      .get('/v1/watch-progress/black-clover-a474')
      .set('Cookie', cookie);
    expect(episodes.body).toEqual({
      items: [
        { episodeId: '1', positionS: 100, durationS: 1400, completed: false },
      ],
    });
  });

  it('rejects a save with an episode id that is not a number', async () => {
    const { http, signedIn } = await buildApp();
    const cookie = await signedIn(`ana-${randomUUID()}@example.test`);

    const res = await http()
      .put('/v1/watch-progress')
      .set('Cookie', cookie)
      .send({
        slug: 'black-clover-a474',
        episodeId: 'e1',
        positionS: 100,
        durationS: 1400,
        titleName: 'Black Clover',
        image: '',
        episodeLabel: 'Episode 1',
      });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'invalid_request' });
  });

  it('replaces the position of an episode saved again, and keeps it completed once it was', async () => {
    const { http, signedIn, advance } = await buildApp({
      now: new Date('2026-03-01T00:00:00Z'),
    });
    const cookie = await signedIn(`ana-${randomUUID()}@example.test`);
    const episode = {
      slug: 'black-clover-a474',
      episodeId: '1',
      durationS: 1400,
      titleName: 'Black Clover',
      image: '',
      episodeLabel: 'Episode 1',
    };
    await http()
      .put('/v1/watch-progress')
      .set('Cookie', cookie)
      .send({ ...episode, positionS: 1390 });
    advance(60_000);

    const again = await http()
      .put('/v1/watch-progress')
      .set('Cookie', cookie)
      .send({ ...episode, positionS: 20 });

    expect(again.body).toEqual({
      episodeId: '1',
      positionS: 20,
      durationS: 1400,
      completed: true,
    });
    const shelf = await http().get('/v1/watch-progress').set('Cookie', cookie);
    expect(shelf.body.items).toHaveLength(1);
    expect(shelf.body.items[0]).toMatchObject({
      positionS: 20,
      completed: true,
      updatedAt: '2026-03-01T00:01:00.000Z',
    });
  });

  it('caps a position past the end at the duration and marks the episode completed', async () => {
    const { http, signedIn } = await buildApp();
    const cookie = await signedIn(`ana-${randomUUID()}@example.test`);

    const res = await http()
      .put('/v1/watch-progress')
      .set('Cookie', cookie)
      .send({
        slug: 'black-clover-a474',
        episodeId: '1',
        positionS: 9999,
        durationS: 1400,
        titleName: 'Black Clover',
        image: '',
        episodeLabel: 'Episode 1',
      });

    expect(res.body).toEqual({
      episodeId: '1',
      positionS: 1400,
      durationS: 1400,
      completed: true,
    });
  });

  it('saves a slug of 400 characters', async () => {
    const { http, signedIn } = await buildApp();
    const cookie = await signedIn(`ana-${randomUUID()}@example.test`);
    const slug = 'a'.repeat(400);

    const res = await http()
      .put('/v1/watch-progress')
      .set('Cookie', cookie)
      .send({
        slug,
        episodeId: '1',
        positionS: 100,
        durationS: 1400,
        titleName: 'Black Clover',
        image: '',
        episodeLabel: 'Episode 1',
        seasonSlug: slug,
        seriesKey: slug,
      });

    expect(res.status).toBe(200);
  });

  it('lists a title’s episodes in numeric order, so 9 comes before 10', async () => {
    const { http, signedIn } = await buildApp();
    const cookie = await signedIn(`ana-${randomUUID()}@example.test`);
    for (const episodeId of ['10', '9']) {
      await http()
        .put('/v1/watch-progress')
        .set('Cookie', cookie)
        .send({
          slug: 'black-clover-a474',
          episodeId,
          positionS: 100,
          durationS: 1400,
          titleName: 'Black Clover',
          image: '',
          episodeLabel: `Episode ${episodeId}`,
        });
    }

    const res = await http()
      .get('/v1/watch-progress/black-clover-a474')
      .set('Cookie', cookie);

    expect(
      res.body.items.map((item: { episodeId: string }) => item.episodeId),
    ).toEqual(['9', '10']);
  });

  it('shows the latest episode of each title on the shelf, newest first, up to 20 titles', async () => {
    const { http, signedIn, advance } = await buildApp();
    const cookie = await signedIn(`ana-${randomUUID()}@example.test`);
    const saves = [
      ...Array.from({ length: 21 }, (_, i) => [`title-${i}`, '1']),
      ['title-0', '2'],
    ];
    for (const [slug, episodeId] of saves) {
      advance(1000);
      await http()
        .put('/v1/watch-progress')
        .set('Cookie', cookie)
        .send({
          slug,
          episodeId,
          positionS: 100,
          durationS: 1400,
          titleName: 'A title',
          image: '',
          episodeLabel: `Episode ${episodeId}`,
        });
    }

    const res = await http().get('/v1/watch-progress').set('Cookie', cookie);

    const items: { slug: string; episodeId: string }[] = res.body.items;
    expect(items).toHaveLength(20);
    expect([items[0]?.slug, items[0]?.episodeId]).toEqual(['title-0', '2']);
    expect(items[1]?.slug).toBe('title-20');
    expect(items.at(-1)?.slug).toBe('title-2');
  });

  it('shows one shelf card for the seasons of a series, and counts an episode saved before the series key was known', async () => {
    const { http, signedIn, advance } = await buildApp();
    const cookie = await signedIn(`ana-${randomUUID()}@example.test`);
    const saves = [
      { slug: 'black-clover-2nd-season-a6073', episodeId: '1' },
      { slug: 'one-piece-a1', episodeId: '1' },
      {
        slug: 'black-clover-a474',
        episodeId: '1',
        seriesKey: 'black-clover-a474',
      },
      {
        slug: 'black-clover-2nd-season-a6073',
        episodeId: '2',
        seriesKey: 'black-clover-a474',
      },
    ];
    for (const save of saves) {
      advance(1000);
      await http()
        .put('/v1/watch-progress')
        .set('Cookie', cookie)
        .send({
          ...save,
          positionS: 100,
          durationS: 1400,
          titleName: 'A title',
          image: '',
          episodeLabel: `Episode ${save.episodeId}`,
        });
    }

    const res = await http().get('/v1/watch-progress').set('Cookie', cookie);

    expect(
      res.body.items.map((item: { slug: string; episodeId: string }) => [
        item.slug,
        item.episodeId,
      ]),
    ).toEqual([
      ['black-clover-2nd-season-a6073', '2'],
      ['one-piece-a1', '1'],
    ]);
  });

  it('keeps the progress of two users apart', async () => {
    const { http, signedIn } = await buildApp();
    const ana = await signedIn(`ana-${randomUUID()}@example.test`);
    const ben = await signedIn(`ben-${randomUUID()}@example.test`);
    const episode = {
      slug: 'black-clover-a474',
      episodeId: '1',
      durationS: 1400,
      titleName: 'Black Clover',
      image: '',
      episodeLabel: 'Episode 1',
    };
    await http()
      .put('/v1/watch-progress')
      .set('Cookie', ana)
      .send({ ...episode, positionS: 1390 });
    await http()
      .put('/v1/watch-progress')
      .set('Cookie', ben)
      .send({ ...episode, positionS: 30 });

    const anaEpisodes = await http()
      .get('/v1/watch-progress/black-clover-a474')
      .set('Cookie', ana);
    const benEpisodes = await http()
      .get('/v1/watch-progress/black-clover-a474')
      .set('Cookie', ben);

    expect(anaEpisodes.body.items).toEqual([
      { episodeId: '1', positionS: 1390, durationS: 1400, completed: true },
    ]);
    expect(benEpisodes.body.items).toEqual([
      { episodeId: '1', positionS: 30, durationS: 1400, completed: false },
    ]);
  });
});
