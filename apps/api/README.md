# art-api

HTTP service that gives the web app TMDB art for AnimeVsub titles. The browser sends the titles it shows. The service answers from Postgres when it already has a row. On a miss it answers `pending` at once, matches the title against TMDB in the background and stores the result, so the next lookup answers `ready`. The browser never sees the TMDB key or the database.

## Endpoints

`POST /v1/art/lookup` takes `{ titles, episodes? }`. `titles` is 1 to 50 `{ slug, name, seasonName?, year?, episodeCount? }`, and `slug` is the source season slug such as `tonikaku-kawaii-a3860`. Set `episodes: true` to get episode stills as well, which only the watch page needs. The answer is `{ art: { [slug]: entry } }`, where an entry is one of these:

- `{ status: 'ready', backdropPath, backdropLang, stills? }`. Paths are TMDB image paths. The web app adds the size.
- `{ status: 'pending' }`. A fill is running or queued. Ask again later.
- `{ status: 'none' }`. TMDB had no confident match, or the last fill failed. The service will not try again until the retry window passes.

A malformed body answers 400 with a list of zod issues. A body over 64 KB answers 413. More than the per-client rate answers 429 with `Retry-After`. A database failure answers 503.

`GET /healthz` answers `{ ok: true }`.

The zod schemas in `src/contract.ts` are the single source of truth, and `apps/web` imports them.

## How it decides

- **Rows.** `title_art` keeps one row per slug with a status of `matched`, `no_match` or `failed`, and `episode_art` keeps one still per episode. `db/001_art.sql` creates them and the service applies it on every boot.
- **Retry.** `RETRY_AFTER_MS` in `src/retry.ts` sets when a row counts as a miss again. A `matched` row is never retried, `no_match` waits 7 days and `failed` waits 10 minutes.
- **First write wins.** A fill never overwrites a `matched` row. A `no_match` or `failed` row is replaced when it is retried.
- **Fills.** `ArtFiller` runs at most 2 TMDB syncs at once and queues the rest in order. Concurrent lookups for the same slug share one fill.
- **Matching.** `syncTitle` in `src/sync.ts` searches TMDB for the name without its season marker, scores the candidates in `src/matcher.ts`, and picks the backdrop in `src/backdrop.ts` (`vi`, then `en`, then textless).

**Run a single replica.** The single-flight map and the rate limit live in process memory. Two replicas would each call TMDB for the same new slug, and each would allow the full rate.

## Environment

| Variable              | Required | Meaning                                                             |
| --------------------- | -------- | ------------------------------------------------------------------- |
| `DATABASE_URL`        | yes      | Postgres connection string                                          |
| `TMDB_API_KEY`        | yes      | TMDB v3 API key                                                     |
| `TMDB_API_BASE`       | no       | TMDB API root, for example `https://api.tmdb.org/3` or a local stub |
| `PORT`                | no       | Listen port, 3300 by default                                        |
| `ART_ALLOWED_ORIGINS` | no       | Comma list of browser origins allowed by CORS. Unset allows none    |
| `ART_TRUST_PROXY`     | no       | `1` keys the rate limit on the first `X-Forwarded-For` hop          |
| `ART_RATE_PER_MINUTE` | no       | Lookups per client per minute, 60 by default                        |

## Run it locally

Copy `.env.example` to `.env` and fill in `TMDB_API_KEY`. Git ignores `.env`, and the `dev` and `start` scripts load it when it exists. The service needs Node 24 or newer, which runs the TypeScript directly.

```sh
docker compose -f apps/art-api/docker-compose.yml up -d --wait   # Postgres 17 on localhost:54330
pnpm nx dev art-api
curl -s localhost:3300/v1/art/lookup -H 'content-type: application/json' \
  -d '{"titles":[{"slug":"tonikaku-kawaii-a3860","name":"Tonikaku Kawaii"}]}'
VITE_ART_API_URL=http://localhost:3300 pnpm nx dev web
```

`docker compose -f apps/art-api/docker-compose.yml down -v` drops the database.

## Tests

`pnpm nx run-many -t typecheck lint test -p art-api`

`test/store.pg.test.ts` runs against a real Postgres only when `DATABASE_URL` is set, for example the compose database above. The TMDB fixtures in `test/fixtures.ts` are hand-written from the API's documented response shapes.
