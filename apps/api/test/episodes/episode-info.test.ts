import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ART_SYNC } from '../../src/art/art.filler.ts';
import { ART_STORE, MemoryArtStore } from '../../src/art/art.store.ts';
import {
  EPISODES_PATH,
  EpisodesResponseSchema,
} from '../../src/art/contract.ts';
import { RATINGS_STORE } from '../../src/ratings/ratings.store.ts';
import { AUTH_CLEANUP_EVERY_MS } from '../../src/auth/auth.service.ts';
import {
  TITLE_NAMES_STORE,
  MemoryTitleNamesStore,
} from '../../src/art/title-names.store.ts';
import { AppModule } from '../../src/app.module.ts';
import { configureApp } from '../../src/app.setup.ts';
import { APP_CONFIG, ENV } from '../../src/config/app.config.ts';
import {
  MigrationRunner,
  PG_POOL,
} from '../../src/database/migration-runner.ts';
import { EpisodeInfoService } from '../../src/episodes/episode-info.service.ts';
import { EpisodeFiller } from '../../src/episodes/episode.filler.ts';
import {
  EPISODE_STORE,
  MemoryEpisodeStore,
} from '../../src/episodes/episode.store.ts';
import type { ListedEpisode } from '../../src/episodes/episode.parser.ts';
import { MalFiller } from '../../src/mal/mal.filler.ts';
import {
  MAL_STORE,
  MemoryMalStore,
  type StoredMal,
} from '../../src/mal/mal.store.ts';
import { MemoryRatingsStore } from '../../src/ratings/ratings.store.ts';
import { setup } from '../art/helpers.ts';

const SLUG = 'black-clover-a1';
const NOW = new Date('2026-01-01T00:00:00Z');

const malRow = (over: Partial<StoredMal> = {}): StoredMal => ({
  slug: SLUG,
  status: 'ok',
  malId: 7,
  score: null,
  voters: null,
  rank: null,
  popularity: null,
  members: null,
  airing: 'finished_airing',
  episodes: null,
  startDate: null,
  startSeason: null,
  datesKnown: true,
  matchedTitle: 'Black Clover',
  matchScore: 0.9,
  matchedBy: 'score',
  matcherVersion: 3,
  reason: null,
  attemptedAt: NOW,
  fetchedAt: NOW,
  ...over,
});

function world() {
  const mal = new MemoryMalStore(() => NOW);
  const episodes = new MemoryEpisodeStore();
  const list = vi.fn(async (): Promise<ListedEpisode[] | null> => []);
  const filler = new MalFiller(
    mal,
    { search: async () => [], stats: async () => null },
    () => NOW,
    null,
    new EpisodeFiller(episodes, { list }, null, () => NOW),
  );
  const service = new EpisodeInfoService(mal, filler, episodes, () => NOW);
  return { mal, episodes, list, filler, service };
}

describe('EpisodeInfoService', () => {
  it('answers the MAL episodes sorted by number with no description fields', async () => {
    const { mal, episodes, list, service } = world();
    await mal.save(malRow());
    await episodes.saveListAttempt({
      malId: 7,
      status: 'ok',
      airing: 'finished_airing',
      attemptedAt: NOW,
    });
    await episodes.saveListed(7, [
      { number: 2, title: 'The Door', titleAlt: null, aired: '2026-10-10' },
      { number: 1, title: 'The Boy', titleAlt: null, aired: '2026-10-03' },
    ]);
    await episodes.saveTranslation(7, 1, 'Cậu bé');

    const out = await service.get(SLUG);

    expect(out).toEqual({
      status: 'ready',
      episodes: [
        { number: 1, title: 'The Boy', titleVi: 'Cậu bé', aired: '2026-10-03' },
        { number: 2, title: 'The Door', titleVi: null, aired: '2026-10-10' },
      ],
    });
    expect(list).not.toHaveBeenCalled();
  });

  it('answers pending with no upstream call when the title has no MAL row yet', async () => {
    const { list, service } = world();

    expect(await service.get(SLUG)).toEqual({
      status: 'pending',
      episodes: [],
    });
    expect(list).not.toHaveBeenCalled();
  });

  it('answers pending while the list is still being read in the background', async () => {
    const { mal, list, filler, service } = world();
    await mal.save(malRow());
    let finish: (rows: ListedEpisode[]) => void = () => undefined;
    list.mockReturnValue(new Promise((resolve) => (finish = resolve)));

    expect(await service.get(SLUG)).toEqual({
      status: 'pending',
      episodes: [],
    });
    expect(list).toHaveBeenCalledExactlyOnceWith(7);

    finish([{ number: 1, title: 'The Boy', titleAlt: null, aired: null }]);
    await filler.idle();
    expect((await service.get(SLUG)).status).toBe('ready');
    expect(list).toHaveBeenCalledOnce();
  });

  it('answers none once the title missed on MAL or its list is empty and settled', async () => {
    const { mal, filler, service } = world();
    await mal.save(
      malRow({
        status: 'none',
        malId: null,
        airing: null,
        fetchedAt: null,
        reason: 'no match',
      }),
    );
    expect(await service.get(SLUG)).toEqual({ status: 'none', episodes: [] });

    await mal.save(malRow());
    await service.get(SLUG);
    await filler.idle();
    expect(await service.get(SLUG)).toEqual({ status: 'none', episodes: [] });
  });
});

describe('GET /v1/episodes/:slug', () => {
  const apps: NestExpressApplication[] = [];
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  async function build() {
    const { sync } = setup();
    const mal = new MemoryMalStore();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ENV)
      .useValue({
        DATABASE_URL: 'postgres://unused@localhost:1/unused',
        TMDB_API_KEY: 'key',
        RATE_LIMIT_PER_MINUTE: '2',
      })
      .overrideProvider(PG_POOL)
      .useValue({ end: async () => undefined })
      .overrideProvider(MigrationRunner)
      .useValue({})
      .overrideProvider(ART_STORE)
      .useValue(new MemoryArtStore())
      .overrideProvider(EPISODE_STORE)
      .useValue(new MemoryEpisodeStore())
      .overrideProvider(MAL_STORE)
      .useValue(mal)
      .overrideProvider(RATINGS_STORE)
      .useValue(new MemoryRatingsStore())
      .overrideProvider(TITLE_NAMES_STORE)
      .useValue(new MemoryTitleNamesStore())
      .overrideProvider(ART_SYNC)
      .useValue(sync)
      .overrideProvider(AUTH_CLEANUP_EVERY_MS)
      .useValue(null)
      .compile();
    const app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
      logger: false,
    });
    configureApp(app, app.get(APP_CONFIG));
    await app.init();
    apps.push(app);
    return request(app.getHttpServer());
  }

  it('answers the contract shape, 400 for a bad slug and 429 past the limit', async () => {
    const http = await build();

    const ok = await http.get(`${EPISODES_PATH}/${SLUG}`);
    expect(ok.status).toBe(200);
    expect(EpisodesResponseSchema.parse(ok.body)).toEqual({
      status: 'pending',
      episodes: [],
    });

    const bad = await http.get(`${EPISODES_PATH}/bad_slug!`);
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('invalid_request');

    const limited = await http.get(`${EPISODES_PATH}/${SLUG}`);
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({ error: 'rate_limited' });
  });
});
