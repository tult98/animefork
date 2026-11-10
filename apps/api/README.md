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
    tmdb/          TMDB client, matchers (baseline, Jev, cascade), backdrop pick, title parsing, syncTitle
db/migrations/     numbered SQL files applied at boot
scripts/           eval-matcher.ts, a read-only matcher comparison
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

- **Rows.** `title_art` keeps one row per slug with a status of `matched`, `no_match` or `failed`, and `episode_art` keeps one still per episode. `db/migrations/001_art.sql` creates them, `002_poster.sql` adds `poster_path` and `poster_lang`, and `003_source_and_provenance.sql` adds the provenance columns described under **Jev**, and `004_show_scope.sql` adds `match_scope` (see **Show scope**).
- **Retry.** `src/art/retry.ts` holds the table. New rows are written with `MATCHER_VERSION` 4. Version 2 added the poster, version 3 added Jev and version 4 added show scope.

  | Status     | Written below version       | Settled for | Then                                          |
  | ---------- | --------------------------- | ----------- | --------------------------------------------- |
  | `matched`  | `MATCHED_REFRESH_BELOW` (2) | forever     | answers `ready` and refills in the background |
  | `matched`  | (2 or later)                | forever     | never refilled                                |
  | `no_match` | `MISS_RETRY_BELOW` (4)      | not at all  | retried on its next lookup                    |
  | `no_match` | (4 or later)                | 7 days      | retried on its next lookup                    |
  | `failed`   | `MISS_RETRY_BELOW` (4)      | not at all  | retried on its next lookup                    |
  | `failed`   | (4 or later)                | 10 minutes  | retried on its next lookup                    |

  A stale `matched` row (version 1) still answers `ready` at once with what it stores, with `posterPath` null, while the refill runs. The bump to 4 retries every old miss once, so titles rejected only because their season could not be confirmed get their show's art. It leaves matched rows alone, whatever their version from 2 up. That retry happens whether or not Jev is on, so set `TYPESAFE_API_KEY` before deploying version 4, or old misses are retried by the baseline alone and then wait their 7 days.

- **First write wins.** A fill never overwrites a `matched` row unless that row is stale. A `no_match` or `failed` row is replaced when it is retried, and a stale `matched` row is replaced by a successful refill. A refill that fails or finds no match keeps the stale row and records nothing, so the next lookup tries again.
- **Fills.** `ArtFiller` runs at most 2 TMDB syncs at once and queues the rest in order. Concurrent lookups for the same slug share one fill, refills included, and refills use the same cap. `ArtFiller` skips a slug whose row is settled and current.
- **Matching.** `syncTitle` in `src/art/tmdb/sync.ts` searches TMDB for the name without its season marker (when that returns nothing it retries, in order, the text before the first `:` or spaced dash, the name without a trailing `-hen`, `arc` or `movie`, then the romaji from the slug (trailing `-a<digits>` id and season marker dropped) cut to its first 6 words and to its first 3, and stops at the first that returns results, with at most 5 searches per title; a rejection reason names the query that worked), asks the matcher to pick one of the top 5 candidates, and picks the backdrop and the poster in `images.ts` (`vi`, then `en`, then textless, then vote average, vote count and width). `decide` in `matcher.ts` is the single gate. An answer counts only when its probability is at least `MIN_MATCH_PROBABILITY` (0.85). The baseline matcher scores title similarity, year and episode count. The question also carries `romaji`, the full slug romaji (trailing `-a<digits>` id and season marker dropped, the same helper as the slug search queries), left out when it is empty or equals the display name once normalized. Title similarity is the best score over the display name and the romaji against each candidate name, original name and alternative title, and a romaji of fewer than 2 words is ignored. When it does not settle a title, Jev gets a turn (see **Jev**).

## Jev

The baseline scores mostly title string similarity, so a Vietnamese or romanized source name often loses to TMDB's English name. "Thám Tử Lừng Danh Conan" against TMDB 30983 "Detective Conan" scores 0.53 with year and episode count both matching. Jev, TypeSafe's System One model, reads the source and the candidates and judges whether one is the same show.

- **Cascade.** `CascadeMatcher` in `matcher.ts` asks the baseline first. When `decide` accepts the baseline answer, that answer is final and Jev is not called. Otherwise, when there is at least one candidate, it returns Jev's answer instead. Without `TYPESAFE_API_KEY` the module wires the baseline alone and logs `Jev matcher is off` once at boot.
- **Request.** `JevMatcher` in `src/art/tmdb/jev.ts` sends one `POST /v1/systemone` per title through `@typesafe-ai/sdk`. The state holds the source (`title`, `romaji` when the question has one, `season`, `year`, `episodeCount`) and the candidates (`id`, `title`, `originalTitle`, up to 10 `alternativeTitles`, `firstAirDate` and `episodeCount` for the source's season, `overview`). It asks four questions. `match` is a choice over the candidate ids, and `any_match` is a noul, "At least one candidate is the same anime and the same season as the source". `show_match` is a second choice over the same ids that asks for the same anime franchise, ignoring season, cour, arc or part, and `any_show` is its noul. A different franchise, a movie, a special, a recap or a spin-off of another show does not count as the same. The instructions say the source title may be Vietnamese and that `romaji` is a Hepburn-style romanization of the original Japanese title taken from the source site's URL slug, to compare with candidate original names and alternative titles. The noul is there because a choice always picks something, even when nothing fits.
- **Thresholds.** Jev's season answer is accepted only when `any_match.noul >= JEV_MIN_NOUL`, the chosen option's probability `>= JEV_MIN_CHOICE` and its confidence `>= JEV_MIN_CONFIDENCE`. When it is not, the show answer gets the same test with `any_show` and `show_match`, and passing it gives a show-scope answer. The defaults 0.85, 0.85 and 0.5 are unvalidated starting points. An accepted answer carries `min(noul, choice probability)` of the scope that passed as its probability, so it still has to pass `decide`. Setting `JEV_MIN_NOUL` or `JEV_MIN_CHOICE` below 0.85 therefore has no effect until `MIN_MATCH_PROBABILITY` moves too.
- **Failure.** A Jev network error, timeout, 401, 422 or malformed answer throws, and so does a 429 or 529 once the SDK's retries are spent (2 retries with backoff, 15 s per attempt, so one title can hold a fill slot for about 50 s). The filler then stores `failed`, which is retried after 10 minutes, rather than a `no_match` that would hide the title for 7 days.
- **Logs.** Each Jev call logs one line with the slug, then for the season question and for the show question the chosen id, its probability, the confidence, the noul and every option's probability, and the verdict (`accept season`, `accept show` or `reject`). It logs neither the key nor the state.
- **Provenance.** Every fill stores `source_name`, `source_year` and `source_episode_count`, whether it ends `matched`, `no_match` or `failed`. A `matched` row also stores `matched_by` (`baseline` or `jev`). Rows written before migration 003 have nulls there.
- **Evaluating.** `pnpm nx run api:eval-matcher --status=no_match --limit=20` reads `title_art` rows that have `source_name`, re-runs the TMDB search, the baseline and Jev for each, and prints a table: slug, source name, stored status, baseline probability and verdict, Jev's choice, the scope it would store (`season`, `show`, or `-` when rejected), the season and show noul as `season/show`, choice probability, confidence and verdict. `--status` is `no_match`, `matched` or `all` (the default), and `--limit` defaults to 50. It opens Postgres read-only and writes nothing, but every row costs one Jev request. It needs `DATABASE_URL`, `TMDB_API_KEY` and `TYPESAFE_API_KEY` and stops with a message naming the missing ones.

## Show scope

TMDB backdrops and posters belong to the whole show, and the web app is fine showing Season 1's art for Season 3. Only episode stills depend on the season. So a title whose show is identified with confidence gets the show's backdrop and poster even when the season cannot be confirmed.

- **When it applies.** Scope is `season` or `show`. A baseline match is season scope. Jev answers season scope when its season-strict pair passes the thresholds, and show scope when only the show pair does. `syncTitle` also downgrades any accepted match to show scope when the TMDB detail has no season N, for example a "3rd Season" TMDB lists as part of season 2.
- **What is stored.** A show-scope fill fetches the show's images only, never calls the season endpoint, and writes the backdrop and poster with `match_scope = 'show'` and a null `tmdb_season`. It writes no `episode_art` rows, so a lookup with `episodes: true` returns `stills: {}` for it. The lookup response is otherwise unchanged. Clients see `ready` and the paths, not the scope. Season-scope fills store exactly what they did before.
- **Why it is safe.** The show pair passes the same `JEV_MIN_NOUL`, `JEV_MIN_CHOICE` and `JEV_MIN_CONFIDENCE` thresholds and its probability still has to pass `decide`, so a wrong show, a movie, a special or a spin-off is rejected as before. Only the season requirement is dropped.
- **Rejections.** A title rejected at both scopes stores `no_match` with the season probability and the show probability in its reason, for example `(best probability 0.21, show probability 0.40)`.
- **Schema.** `004_show_scope.sql` adds `match_scope text not null default 'season'` and relaxes the matched-row check. A matched row needs `tmdb_id`, and needs `tmdb_season` only when its scope is `season`. Existing rows read as `season`.

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
| `TYPESAFE_API_KEY`      | no       | TypeSafe API key. Unset turns Jev off                               |
| `JEV_MODEL`             | no       | System One model, `jev-latest` by default                           |
| `JEV_MIN_NOUL`          | no       | Minimum `any_match` noul, 0 to 1, 0.85 by default                   |
| `JEV_MIN_CHOICE`        | no       | Minimum probability of Jev's choice, 0 to 1, 0.85 by default        |
| `JEV_MIN_CONFIDENCE`    | no       | Minimum confidence of Jev's choice, 0 to 1, 0.5 by default          |

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

Copy `.env.example` to `.env` and fill in `TMDB_API_KEY`, and `TYPESAFE_API_KEY` to turn Jev on. Git ignores `.env`.

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

`test/app.test.ts` boots `AppModule` through `@nestjs/testing` and sends requests with supertest. It swaps the env, the pool, the store and the TMDB client for in-memory ones, so it needs neither Postgres nor the network. The `*.pg.test.ts` files run against a real Postgres only when `DATABASE_URL` is set, for example the compose database above. The TMDB fixtures in `test/art/tmdb/fixtures.ts` are hand-written from the API's documented response shapes. The Jev tests run the real SDK against a fake `fetch` (`test/art/tmdb/jev-mock.ts`), so they check the request body on the wire without calling TypeSafe.
