import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { generateToken, hashToken } from '../../src/auth/tokens.ts';
import {
  WATCH_PROGRESS_PATH,
  WATCH_PROGRESS_SHELF_LIMIT,
  WatchProgressEpisodesResponseSchema,
  SaveWatchProgressResponseSchema,
  WatchProgressShelfResponseSchema,
  watchProgressSlugPath,
} from '../../src/watch-progress/contract.ts';
import { buildAuthApp, START } from '../auth/helpers.ts';

type App = Awaited<ReturnType<typeof buildAuthApp>>;

const DAY_MS = 24 * 60 * 60_000;

// Opens a session straight in the store. Signing in would run scrypt for every test and starve CI.
async function signedIn(app: App, email: string) {
  const user = {
    id: randomUUID(),
    email,
    passwordHash: 'unused',
    createdAt: START,
  };
  app.store.users.set(user.id, user);
  const token = generateToken();
  await app.store.createSession(
    user.id,
    hashToken(token),
    START,
    new Date(START.getTime() + 30 * DAY_MS),
  );
  return token;
}

function save(overrides: Record<string, unknown> = {}) {
  return {
    slug: 'show',
    episodeId: '1',
    positionS: 100,
    durationS: 1400,
    titleName: 'Show',
    image: 'https://img.test/show.jpg',
    episodeLabel: 'Episode 1',
    seasonSlug: 'show-season-2',
    ...overrides,
  };
}

async function shelf(app: App, cookie: string) {
  const res = await app.get(WATCH_PROGRESS_PATH, cookie);
  expect(res.status).toBe(200);
  return WatchProgressShelfResponseSchema.parse(res.body).items;
}

async function episodes(app: App, cookie: string, slug = 'show') {
  const res = await app.get(watchProgressSlugPath(slug), cookie);
  expect(res.status).toBe(200);
  return WatchProgressEpisodesResponseSchema.parse(res.body).items;
}

describe('watch progress', () => {
  it('answers 401 unauthenticated without a session', async () => {
    const app = await buildAuthApp();
    const responses = [
      await app.put(WATCH_PROGRESS_PATH, save()),
      await app.get(WATCH_PROGRESS_PATH),
      await app.get(watchProgressSlugPath('show')),
    ];
    for (const res of responses) {
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'unauthenticated' });
    }
  });

  it('saves with 200 and the stored row, and reads it back on both reads', async () => {
    const app = await buildAuthApp();
    const cookie = await signedIn(app, 'ana@example.test');

    const res = await app.put(WATCH_PROGRESS_PATH, save(), cookie);
    expect(res.status).toBe(200);
    expect(SaveWatchProgressResponseSchema.parse(res.body)).toEqual({
      episodeId: '1',
      positionS: 100,
      durationS: 1400,
      completed: false,
    });

    expect(await shelf(app, cookie)).toEqual([
      {
        slug: 'show',
        episodeId: '1',
        episodeLabel: 'Episode 1',
        titleName: 'Show',
        image: 'https://img.test/show.jpg',
        seasonSlug: 'show-season-2',
        positionS: 100,
        durationS: 1400,
        completed: false,
        updatedAt: START.toISOString(),
      },
    ]);
    expect(await episodes(app, cookie)).toEqual([
      { episodeId: '1', positionS: 100, durationS: 1400, completed: false },
    ]);
  });

  it('saves a slug longer than 200 characters', async () => {
    const app = await buildAuthApp();
    const cookie = await signedIn(app, 'ana@example.test');
    const slug = `${'long-title-'.repeat(21)}a6125`;
    expect(slug.length).toBeGreaterThan(200);

    const res = await app.put(
      WATCH_PROGRESS_PATH,
      save({ slug, seasonSlug: slug }),
      cookie,
    );
    expect(res.status).toBe(200);
  });

  it('upserts the same episode and stamps the server clock', async () => {
    const app = await buildAuthApp();
    const cookie = await signedIn(app, 'ana@example.test');
    await app.put(WATCH_PROGRESS_PATH, save(), cookie);
    app.advance(60_000);
    await app.put(
      WATCH_PROGRESS_PATH,
      save({ positionS: 400, seasonSlug: null }),
      cookie,
    );

    const items = await shelf(app, cookie);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      positionS: 400,
      seasonSlug: null,
      updatedAt: new Date(START.getTime() + 60_000).toISOString(),
    });
  });

  it('clamps a position past the duration', async () => {
    const app = await buildAuthApp();
    const cookie = await signedIn(app, 'ana@example.test');
    const res = await app.put(
      WATCH_PROGRESS_PATH,
      save({ positionS: 9999 }),
      cookie,
    );
    expect(res.body).toEqual({
      episodeId: '1',
      positionS: 1400,
      durationS: 1400,
      completed: true,
    });
    expect(await episodes(app, cookie)).toEqual([
      { episodeId: '1', positionS: 1400, durationS: 1400, completed: true },
    ]);
  });

  it.each([
    [1259, 1400, false],
    [1260, 1400, true],
    [509, 600, false],
    [511, 600, true],
  ])(
    'computes completed for %d of %d',
    async (positionS, durationS, completed) => {
      const app = await buildAuthApp();
      const cookie = await signedIn(app, 'ana@example.test');
      const res = await app.put(
        WATCH_PROGRESS_PATH,
        save({ positionS, durationS }),
        cookie,
      );
      expect(res.body).toMatchObject({ completed });
      expect((await episodes(app, cookie))[0]?.completed).toBe(completed);
    },
  );

  it('never unsets completed on a later save', async () => {
    const app = await buildAuthApp();
    const cookie = await signedIn(app, 'ana@example.test');
    await app.put(WATCH_PROGRESS_PATH, save({ positionS: 1390 }), cookie);
    const res = await app.put(
      WATCH_PROGRESS_PATH,
      save({ positionS: 20 }),
      cookie,
    );
    expect(res.body).toEqual({
      episodeId: '1',
      positionS: 20,
      durationS: 1400,
      completed: true,
    });
    expect(await episodes(app, cookie)).toEqual([
      { episodeId: '1', positionS: 20, durationS: 1400, completed: true },
    ]);
  });

  it('shows the latest episode per slug, newest first', async () => {
    const app = await buildAuthApp();
    const cookie = await signedIn(app, 'ana@example.test');
    const step = async (slug: string, episodeId: string) => {
      app.advance(1000);
      await app.put(WATCH_PROGRESS_PATH, save({ slug, episodeId }), cookie);
    };
    await step('a', '1');
    await step('b', '1');
    await step('a', '2');

    expect(
      (await shelf(app, cookie)).map((i) => [i.slug, i.episodeId]),
    ).toEqual([
      ['a', '2'],
      ['b', '1'],
    ]);
    expect((await episodes(app, cookie, 'a')).map((e) => e.episodeId)).toEqual([
      '1',
      '2',
    ]);
  });

  it('caps the shelf at 20 titles, dropping the oldest', async () => {
    const app = await buildAuthApp();
    const cookie = await signedIn(app, 'ana@example.test');
    const total = WATCH_PROGRESS_SHELF_LIMIT + 3;
    for (let i = 0; i < total; i++) {
      app.advance(1000);
      await app.put(WATCH_PROGRESS_PATH, save({ slug: `title-${i}` }), cookie);
    }
    const items = await shelf(app, cookie);
    expect(items).toHaveLength(WATCH_PROGRESS_SHELF_LIMIT);
    expect(items[0]?.slug).toBe(`title-${total - 1}`);
    expect(items.at(-1)?.slug).toBe(`title-3`);
  });

  it('keeps two users apart', async () => {
    const app = await buildAuthApp();
    const ana = await signedIn(app, 'ana@example.test');
    const ben = await signedIn(app, 'ben@example.test');
    await app.put(WATCH_PROGRESS_PATH, save({ positionS: 1390 }), ana);
    const benRes = await app.put(
      WATCH_PROGRESS_PATH,
      save({ positionS: 30, titleName: 'Ben show' }),
      ben,
    );
    expect(benRes.body).toEqual({
      episodeId: '1',
      positionS: 30,
      durationS: 1400,
      completed: false,
    });

    expect(await episodes(app, ana)).toEqual([
      { episodeId: '1', positionS: 1390, durationS: 1400, completed: true },
    ]);
    expect(await episodes(app, ben)).toEqual([
      { episodeId: '1', positionS: 30, durationS: 1400, completed: false },
    ]);
    expect((await shelf(app, ben)).map((i) => i.titleName)).toEqual([
      'Ben show',
    ]);
    expect(await episodes(app, ben, 'other')).toEqual([]);
  });

  it.each([
    ['a non-numeric episode id', { episodeId: 'e1' }],
    ['a negative position', { positionS: -1 }],
    ['a zero duration', { durationS: 0 }],
    ['a missing title', { titleName: undefined }],
    ['an oversized image', { image: 'x'.repeat(2049) }],
  ])('rejects %s with 400', async (_name, overrides) => {
    const app = await buildAuthApp();
    const cookie = await signedIn(app, 'ana@example.test');
    const res = await app.put(WATCH_PROGRESS_PATH, save(overrides), cookie);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'invalid_request' });
  });
});
