# api

Backend for the web app, built on NestJS. Its first feature is TMDB art for AnimeVsub titles. The browser sends the titles it shows. The service answers from Postgres when it already has a row. On a miss it answers `pending` at once, matches the title against TMDB in the background and stores the result, so the next lookup answers `ready`. The browser never sees the TMDB key or the database.

## Layout

```
src/
  main.ts          bootstrap: config, CORS, body limit, shutdown hooks, listen
  app.module.ts    ConfigModule, DatabaseModule, ThrottlerModule, HealthModule, ArtModule
  app.setup.ts     HTTP setup shared by main.ts and the app tests
  config/          zod-validated env, provided as APP_CONFIG and the raw ENV
  database/        global pg.Pool (PG_POOL) and MigrationRunner
  health/          GET /healthz
  common/          zod validation pipe, error filter, clock token
  art/             the art feature: controller, service, filler, store, retry table, contract
    tmdb/          TMDB client, matcher, backdrop pick, title parsing, syncTitle
db/migrations/     numbered SQL files applied at boot
```

A new feature module sits beside `art/` and imports nothing from it. It reads its own env from the `ENV` provider with `parseEnv`, the way `art/art.config.ts` does, and adds its tables as the next numbered file in `db/migrations/`. Neither `database/` nor `common/` changes for it.

## Endpoints

`POST /v1/art/lookup` takes `{ titles, episodes? }`. `titles` is 1 to 50 `{ slug, name, seasonName?, year?, episodeCount? }`, and `slug` is the source season slug such as `tonikaku-kawaii-a3860`. Set `episodes: true` to get episode stills as well, which only the watch page needs. The answer is `{ art: { [slug]: entry } }`, where an entry is one of these:

- `{ status: 'ready', backdropPath, backdropLang, posterPath, stills? }`. Paths are TMDB image paths. The web app adds the size. `posterPath` is null for a row that has not been refilled yet or when TMDB has no poster.
- `{ status: 'pending' }`. A fill is running or queued. Ask again later.
- `{ status: 'none' }`. TMDB had no confident match, or the last fill failed. The service will not try again until the retry window passes.

Errors answer JSON with an `error` code:

| Status | Body                                       | When                                                     |
| ------ | ------------------------------------------ | -------------------------------------------------------- |
| 400    | `{ error: 'invalid_json' }`                | The body is not JSON                                     |
| 400    | `{ error: 'invalid_request', issues }`     | The body fails the zod contract. `issues` lists up to 10 |
| 413    | `{ error: 'body_too_large' }`              | The body is over 64 KB                                   |
| 429    | `{ error: 'rate_limited' }`, `Retry-After` | More requests than the per-client limit in a minute      |
| 503    | `{ error: 'unavailable' }`                 | Anything unexpected, such as a database failure          |

`GET /healthz` answers `{ ok: true }` and is not rate limited.

The zod schemas in `src/art/contract.ts` are the single source of truth, and `apps/web` imports them. Keep that file free of Nest imports and decorators, because the web build compiles it.

## How it decides

- **Rows.** `title_art` keeps one row per slug with a status of `matched`, `no_match` or `failed`, and `episode_art` keeps one still per episode. `db/migrations/001_art.sql` creates them and `002_poster.sql` adds `poster_path` and `poster_lang`.
- **Retry.** `RETRY_AFTER_MS` in `src/art/retry.ts` sets when a row counts as a miss again. A `matched` row is not retried, `no_match` waits 7 days and `failed` waits 10 minutes. A `matched` row written by an older `MATCHER_VERSION` is stale. It still answers `ready` at once with what it stores (`posterPath` null for version 1 rows), and the lookup schedules a background refill. Version 2 added the poster.
- **First write wins.** Within the current `MATCHER_VERSION` a fill never overwrites a `matched` row. A `no_match` or `failed` row is replaced when it is retried, and a stale `matched` row is replaced by a successful refill. A refill that fails or finds no match keeps the stale row and records nothing, so the next lookup tries again.
- **Fills.** `ArtFiller` runs at most 2 TMDB syncs at once and queues the rest in order. Concurrent lookups for the same slug share one fill, refills included, and refills use the same cap. `ArtFiller` skips a slug whose row is settled and current.
- **Matching.** `syncTitle` in `src/art/tmdb/sync.ts` searches TMDB for the name without its season marker, scores the candidates in `matcher.ts`, and picks the backdrop and the poster in `images.ts` (`vi`, then `en`, then textless, then vote average, vote count and width).

**Run a single replica.** The single-flight map and the rate limit counters live in process memory. Two replicas would each call TMDB for the same new slug, and each would allow the full rate.

## Migrations

`MigrationRunner` runs when the app starts, before it listens. It takes a Postgres advisory lock, creates `schema_migrations(name text primary key, applied_at timestamptz)` if needed, and applies every `db/migrations/NNN_name.sql` that table does not list, in name order. Each file runs in its own transaction together with its `schema_migrations` row, so a failed file leaves nothing behind and stops the boot. Restarting is safe because applied files are skipped. Never edit an applied file. Add the next number instead.

## Environment

| Variable                | Required | Meaning                                                             |
| ----------------------- | -------- | ------------------------------------------------------------------- |
| `DATABASE_URL`          | yes      | Postgres connection string                                          |
| `PORT`                  | no       | Listen port, 3100 by default                                        |
| `ALLOWED_ORIGINS`       | no       | Comma list of browser origins allowed by CORS. Unset allows none    |
| `TRUST_PROXY`           | no       | `1` keys the rate limit on the first `X-Forwarded-For` hop          |
| `RATE_LIMIT_PER_MINUTE` | no       | Requests per client per minute, 60 by default                       |
| `TMDB_API_KEY`          | yes      | TMDB v3 API key, read by the art module                             |
| `TMDB_API_BASE`         | no       | TMDB API root, for example `https://api.tmdb.org/3` or a local stub |

A missing or invalid variable stops the boot with `missing or invalid env:` and its name.

## Build and run

Node runs TypeScript by stripping types, but it does not run decorators, and Nest needs them. So the service is compiled, not run from source:

- `pnpm nx build api` runs `tsc -p tsconfig.build.json` (TypeScript 7, the same `tsc` as `typecheck`) into `dist/`. It emits legacy decorators (`experimentalDecorators`) and rewrites the `.ts` import extensions to `.js`. Helpers are inlined, so `dist/` needs no `tslib`.
- `pnpm nx start api` builds, then runs `node dist/main.js`.
- `pnpm nx dev api` builds, then runs `tsc --watch` and `node --watch dist/main.js` side by side.

`start` and `dev` load `.env` when it exists.

There is no `emitDecoratorMetadata`. Every constructor parameter names its provider with `@Inject(Token)`, so Nest never needs type metadata. This keeps swc and `unplugin-swc` out of the build and the tests. Forgetting `@Inject` on a constructor parameter does not fail at boot. Without metadata Nest passes `undefined` for it. `test/di.test.ts` catches that: it boots `AppModule` and fails for any of our classes whose constructor has a parameter without `@Inject`.

Vitest compiles the same decorators without a plugin. Vite's built-in transform reads `experimentalDecorators` from `tsconfig.json`. `test/setup.ts` loads `reflect-metadata`, which Nest needs at runtime, and silences the Nest logger.

`typecheck`, `lint` and `test` work like the other projects.

## Run it locally

Copy `.env.example` to `.env` and fill in `TMDB_API_KEY`. Git ignores `.env`.

```sh
docker compose -f apps/api/docker-compose.yml up -d --wait   # Postgres 17 on localhost:54330, database api
pnpm nx dev api
curl -s localhost:3100/v1/art/lookup -H 'content-type: application/json' \
  -d '{"titles":[{"slug":"tonikaku-kawaii-a3860","name":"Tonikaku Kawaii"}]}'
VITE_API_URL=http://localhost:3100 pnpm nx dev web
```

`docker compose -f apps/api/docker-compose.yml down -v` drops the database.

## Tests

`pnpm nx run-many -t typecheck lint test build -p api`

`test/app.test.ts` boots `AppModule` through `@nestjs/testing` and sends requests with supertest. It swaps the env, the pool, the store and the TMDB client for in-memory ones, so it needs neither Postgres nor the network. The `*.pg.test.ts` files run against a real Postgres only when `DATABASE_URL` is set, for example the compose database above. The TMDB fixtures in `test/art/tmdb/fixtures.ts` are hand-written from the API's documented response shapes.
