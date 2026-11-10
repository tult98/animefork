# art-sync

Offline tool that matches AnimeVsub titles to TMDB and stores image paths in a self-hosted PostgreSQL. The web app looks the paths up by source slug and falls back to the source site's own image when a title has no row.

It writes `title_art` (one TMDB backdrop per season slug) and `episode_art` (one TMDB still per episode). The row shapes live in `src/schema.ts`, which `apps/web` also imports. The tables come from `db/migrations/001_title_art.sql`, plain Postgres that is safe to re-run. It creates two roles without logins. `web_anon` has SELECT only and is the role PostgREST uses for anonymous requests. `art_writer` can insert and update, and the sync job connects as a login that is a member of it. Logins and passwords belong to the deployment.

## Usage

```sh
export TMDB_API_KEY=...
pnpm --filter art-sync sync titles.json --dry-run   # prints matches, skips and counts as JSON
DATABASE_URL=postgres://user:pass@host/db pnpm --filter art-sync sync titles.json   # upserts
```

`titles.json` is an array of `{ slug, name, seasonName?, year?, episodeCount? }`. `slug` is the season slug from the source site, for example `tonikaku-kawaii-a3860`. The tool needs Node 24 or newer, which runs the TypeScript directly.

With `DATABASE_URL` missing, or with `--dry-run`, nothing touches the database. A write runs in one transaction. The report has `matches`, `skipped` (each with a reason) and `counts` (titles, matched, skipped, withBackdrop, withStills, episodeRows).

## Local stack

`docker-compose.yml` starts Postgres 17 and PostgREST. Postgres applies `db/local/000_roles.sql` (public local-only logins), then the migration, then `db/local/002_grants.sql`. PostgREST serves the `public` schema on port 3000 as `web_anon`, with CORS open to every origin.

```sh
docker compose -f tools/art-sync/docker-compose.yml up -d --wait
DATABASE_URL=postgres://art_sync:local-art-sync@localhost:54329/animefork pnpm --filter art-sync sync titles.json
curl 'http://localhost:3000/title_art?source_slug=eq.tonikaku-kawaii-a3860'
VITE_ART_API_URL=http://localhost:3000 pnpm nx dev web
docker compose -f tools/art-sync/docker-compose.yml down -v
```

Init scripts run only on an empty data directory, so `down -v` is how a changed migration is picked up locally.

## How it decides

- **Matching.** The `Matcher` interface in `src/matcher.ts` takes a question (source title, season name, year, episode count, TMDB candidates) and answers `{ choice, probability, episodeOffset? }`. `BaselineMatcher` scores title similarity, year and episode count. A probability under `MIN_MATCH_PROBABILITY` writes no row, as does a near tie between two candidates. `createJevMatcher` is the placeholder where a Jev (typesafe.ai) adapter will plug in. It is not implemented.
- **Backdrop.** Art with a language wins over textless art. Tier 1 is `vi`, tier 2 is `en`, tier 3 is textless. Inside a tier the order is vote average, vote count, width. Other languages are ignored.
- **Season.** `seasonName` such as `Season 2` or `Mùa 2` picks the TMDB season. No match means season 1. A season TMDB lacks skips the title.
- **Episodes.** Source episode `n` is TMDB episode `n - episodeOffset`. A missing still writes no row for that episode, and the web app keeps the source thumbnail.

Re-running upserts. It never deletes, so a still that TMDB later removes stays until its row is deleted by hand.

## Tests

`pnpm nx run-many -t typecheck lint test -p art-sync`

The TMDB fixtures in `test/fixtures.ts` are hand-written from the API's documented response shapes. They are unverified against the live API until a dry run with a real key.
