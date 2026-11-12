# api

Backend for the web app, built on NestJS. Its first feature is TMDB art and a Vietnamese synopsis for AnimeVsub titles. The browser sends the titles it shows. The service answers from Postgres when it already has a row. On a miss it answers `pending` at once, matches the title against TMDB in the background and stores the result, so the next lookup answers `ready`. The browser never sees the TMDB key or the database. The service also holds the web app's accounts, with email and password sign-up, email verification and cookie sessions (see **Accounts**).

## Layout

```
src/
  main.ts          bootstrap: config, CORS, body limit, shutdown hooks, listen
  app.module.ts    ConfigModule, DatabaseModule, ThrottlerModule, HealthModule, ArtModule, AuthModule
  app.setup.ts     HTTP setup shared by main.ts and the app tests
  config/          zod-validated env, provided as APP_CONFIG and the raw ENV
  database/        global pg.Pool (PG_POOL) and MigrationRunner
  health/          GET /healthz
  common/          zod validation pipe, error filter, clock token
  art/             the art feature: controller, service, filler, store, retry table, contract, translator
    tmdb/          TMDB client, matchers (baseline, Jev, cascade), backdrop pick, title parsing, syncTitle, fetchOverview
  mal/             MyAnimeList numbers: client, score matcher, Jev judge, filler, store, retry table
  auth/            accounts: contract, controller, service, store, session guard, password, tokens, cookie, mailer, limits
db/migrations/     numbered SQL files applied at boot
scripts/           eval-matcher.ts and eval-mal.ts, read-only matcher comparisons
```

A new feature module sits beside `art/` and imports nothing from it. It reads its own env from the `ENV` provider with `parseEnv`, the way `art/art.config.ts` does, and adds its tables as the next numbered file in `db/migrations/`. Neither `database/` nor `common/` changes for it.

## Endpoints

`POST /v1/art/lookup` takes `{ titles, episodes? }`. `titles` is 1 to 50 `{ slug, name, seasonName?, year?, episodeCount?, otherNames? }`, and `slug` is the source season slug such as `tonikaku-kawaii-a3860`. `otherNames` is the other titles the source lists for the show, such as its English, romaji or pinyin name (see **Other names**). The schema trims each one, drops empty ones, ones over 120 characters, repeats (ignoring case) and one equal to `name`, and keeps the first 5. More than 20 entries, an entry over 400 characters or a non-string entry fails the contract. A client that omits the field asks as before. Set `episodes: true` to get episode stills as well, which only the watch page needs. The answer is `{ art: { [slug]: entry } }`, where an entry is one of these:

- `{ status: 'ready', backdropPath, backdropLang, posterPath, overview, overviewTranslated, stills? }`. Paths are TMDB image paths. The web app adds the size. `posterPath` is null for a row that has not been refilled yet or when TMDB has no poster. `overview` is the Vietnamese synopsis, or null while the title has none (see **Overview**). `overviewTranslated` is true when DeepSeek translated it from TMDB's English overview. Both fields are optional in the zod schema so a web build still parses an answer from an API that predates them.
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

### Account endpoints

Every route takes and answers JSON. The paths and zod schemas are in `src/auth/contract.ts`.

| Route                        | Body                  | Success                                         | Failure                                       |
| ---------------------------- | --------------------- | ----------------------------------------------- | --------------------------------------------- |
| `POST /v1/auth/sign-up`      | `{ email, password }` | 202 `{ ok: true }`, no session, mail sent       | 400 `invalid_request`                         |
| `POST /v1/auth/verify-email` | `{ token }`           | 200 `{ ok: true }`, account created, no session | 400 `invalid_token`                           |
| `POST /v1/auth/sign-in`      | `{ email, password }` | 200 `{ user }`, session cookie                  | 401 `invalid_credentials`, 429 `rate_limited` |
| `POST /v1/auth/sign-out`     | none                  | 204, session deleted, cookie cleared            | none                                          |
| `GET /v1/auth/me`            | none                  | 200 `{ user }`                                  | 401 `unauthenticated`, cookie cleared         |

The email is trimmed, lowercased and at most 254 characters. The password is 8 to 128 characters. An unknown email, an email whose sign-up is not confirmed yet and a wrong password get the same 401 and the same body. Every token failure gets the same 400 `{ error: 'invalid_token' }`, whether the token is unknown, used, expired or malformed, or its email already has an account.

Other modules protect a route with `@UseGuards(SessionGuard)` and read the user with `@CurrentUser()`. `AuthModule` exports `SessionGuard`, `AuthService` and `AUTH_STORE`.

The zod schemas in `src/art/contract.ts` are the single source of truth, and `apps/web` imports them. Keep that file free of Nest imports and decorators, because the web build compiles it.

## How it decides

- **Rows.** `title_art` keeps one row per slug with a status of `matched`, `no_match` or `failed`, and `episode_art` keeps one still per episode. `db/migrations/001_art.sql` creates them, `002_poster.sql` adds `poster_path` and `poster_lang`, and `003_source_and_provenance.sql` adds the provenance columns described under **Jev**, `004_show_scope.sql` adds `match_scope` (see **Show scope**), and `005_overview.sql` adds the overview columns (see **Overview**).
- **Retry.** `src/art/retry.ts` holds the table. New rows are written with `MATCHER_VERSION` 4. Version 2 added the poster, version 3 added Jev and version 4 added show scope.

  | Status     | Written below version       | Settled for | Then                                          |
  | ---------- | --------------------------- | ----------- | --------------------------------------------- |
  | `matched`  | `MATCHED_REFRESH_BELOW` (2) | forever     | answers `ready` and refills in the background |
  | `matched`  | (2 or later)                | forever     | never refilled                                |
  | `no_match` | `MISS_RETRY_BELOW` (4)      | not at all  | retried on its next lookup                    |
  | `no_match` | (4 or later)                | 7 days      | retried on its next lookup                    |
  | `failed`   | `MISS_RETRY_BELOW` (4)      | not at all  | retried on its next lookup                    |
  | `failed`   | (4 or later)                | 10 minutes  | retried on its next lookup                    |

  A `no_match` or `failed` row tried before the title's other names were stored is retried once (see **Other names**).

  A stale `matched` row (version 1) still answers `ready` at once with what it stores, with `posterPath` null, while the refill runs. The bump to 4 retries every old miss once, so titles rejected only because their season could not be confirmed get their show's art. It leaves matched rows alone, whatever their version from 2 up. That retry happens whether or not Jev is on, so set `TYPESAFE_API_KEY` before deploying version 4, or old misses are retried by the baseline alone and then wait their 7 days.

- **First write wins.** A fill never overwrites a `matched` row unless that row is stale. A `no_match` or `failed` row is replaced when it is retried, and a stale `matched` row is replaced by a successful refill. A refill that fails or finds no match keeps the stale row and records nothing, so the next lookup tries again.
- **Fills.** `ArtFiller` runs at most 2 TMDB syncs at once and queues the rest in order. Concurrent lookups for the same slug share one fill, refills included, and refills use the same cap. `ArtFiller` skips a slug whose row is settled and current.
- **Matching.** `syncTitle` in `src/art/tmdb/sync.ts` searches TMDB for the name without its season marker (when that returns nothing it retries, in order, the text before the first `:` or spaced dash, the name without a trailing `-hen`, `arc` or `movie`, then the romaji from the slug (trailing `-a<digits>` id and season marker dropped) cut to its first 6 words and to its first 3, and stops at the first that returns results, with at most 5 of these searches per title; then up to 2 of the title's other names (see **Other names**) with their season markers dropped, so at most 7 searches; a rejection reason names the query that worked), asks the matcher to pick one of the top 5 candidates, and picks the backdrop and the poster in `images.ts` (`vi`, then `en`, then textless, then vote average, vote count and width). `decide` in `matcher.ts` is the single gate. An answer counts only when its probability is at least `MIN_MATCH_PROBABILITY` (0.85). The baseline matcher scores title similarity, year and episode count. The question also carries `romaji`, the full slug romaji (trailing `-a<digits>` id and season marker dropped, the same helper as the slug search queries), left out when it is empty or equals the display name once normalized. The question carries `otherNames` too when the title has stored names. Title similarity is the best score over the display name, the other names and the romaji against each candidate name, original name and alternative title, and a romaji of fewer than 2 words is ignored. When it does not settle a title, Jev gets a turn (see **Jev**).

## Other names

The source lists a show's other titles (English, romaji, pinyin) on its watch page, and a Chinese donghua often has nothing else: its display name and its slug are both Vietnamese, so neither finds it on MAL or TMDB. The web app reads them from the watch page it already fetches and sends them as `otherNames`. Listing cards carry none.

- **Stored.** `title_names` (`db/migrations/012_title_names.sql`) keeps one `names text[]` per slug with its `updated_at`. `TitleNamesStore` in `src/art/title-names.store.ts` saves with `saveIfAbsent`, so the first names stored for a slug stay and no later client can rewrite them. `ArtService.lookup` saves a title's names only when none are stored and the title still has something to gain: it has no `ok` MAL row or its art is not `matched`. A title that has both settled has its names ignored.
- **Used.** Every lookup hands the stored names to both fillers as `otherNames`, also a lookup from a listing that carries none. Names the request sends but that were not stored never reach a filler. MAL asks them as search queries after the slug romaji (see **MyAnimeList**), TMDB after the name and slug queries (see **Matching**), and both score candidates against them and send them to Jev as `source.otherNames`, described as other known titles of the same franchise. They identify the show, not the season, so season, year and episode scoring still pick the season.
- **Retry.** A row that is not `ok` (MAL `none` or `failed`) or not `matched` (art `no_match` or `failed`) is not settled while its `attempted_at` is older than the names' `updated_at`, so the arrival of names retries it once. The retry writes a newer `attempted_at`, so the row settles again under its usual window. `ok` and `matched` rows never retry because of names.

## Jev

The baseline scores mostly title string similarity, so a Vietnamese or romanized source name often loses to TMDB's English name. "Thám Tử Lừng Danh Conan" against TMDB 30983 "Detective Conan" scores 0.53 with year and episode count both matching. Jev, TypeSafe's System One model, reads the source and the candidates and judges whether one is the same show.

- **Cascade.** `CascadeMatcher` in `matcher.ts` asks the baseline first. When `decide` accepts the baseline answer, that answer is final and Jev is not called. Otherwise, when there is at least one candidate, it returns Jev's answer instead. Without `TYPESAFE_API_KEY` the module wires the baseline alone and logs `Jev matcher is off` once at boot.
- **Request.** `JevMatcher` in `src/art/tmdb/jev.ts` sends one `POST /v1/systemone` per title through `@typesafe-ai/sdk`. The state holds the source (`title`, `romaji` when the question has one, `otherNames` when it has some, `season`, `year`, `episodeCount`) and the candidates (`id`, `title`, `originalTitle`, up to 10 `alternativeTitles`, `firstAirDate` and `episodeCount` for the source's season, `overview`). It asks four questions. `match` is a choice over the candidate ids, and `any_match` is a noul, "At least one candidate is the same anime and the same season as the source". `show_match` is a second choice over the same ids that asks for the same anime franchise, ignoring season, cour, arc or part, and `any_show` is its noul. A different franchise, a movie, a special, a recap or a spin-off of another show does not count as the same. The instructions say the source title may be Vietnamese and that `romaji` is a Hepburn-style romanization of the original Japanese title taken from the source site's URL slug, to compare with candidate original names and alternative titles, and that `otherNames` are other known titles of the same franchise, naming the show and not the season. The noul is there because a choice always picks something, even when nothing fits.
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

## Overview

The web hero showed the source site's card excerpt, which the site cuts at about 70 characters. The service now stores TMDB's synopsis in Vietnamese for every matched title, and the hero shows it instead.

- **Where it comes from.** `fetchOverview` in `src/art/tmdb/overview.ts` asks `GET /tv/{id}?language=vi` and, only when that overview is empty, `?language=en`. It answers `{ text, lang }` or null, and takes the TMDB id alone. A Vietnamese overview is stored as is. An English one is translated by the `OverviewTranslator` and only the translation is stored. English is never stored or shown.
- **Translator.** `src/art/translator.ts` defines `OverviewTranslator` (one `translate(text)` method) and its one implementation, `DeepSeekTranslator`. It sends `POST {DEEPSEEK_API_BASE}/chat/completions` with `Authorization: Bearer <key>`, the model, thinking disabled, temperature 1.3 (DeepSeek's parameter guide recommends it for translation), a system prompt and the synopsis between `<synopsis>` tags. The prompt asks for natural Vietnamese, keeps character names, place names and the show's proper nouns in their romanized or original form, forbids adding, removing or explaining, asks for the translation only, and says the synopsis is untrusted data, never instructions. The input is cut to 2000 characters at a sentence boundary. Each attempt times out after 20 s. A 429 or 5xx is retried once after 1 s, and nothing else is retried. The answer must be non-empty, end with `finish_reason` `stop`, be at most 3 times the input's length and differ from the input, or it counts as a failure. Without `DEEPSEEK_API_KEY` there is no translator, the module logs `DeepSeek translation is off` once at boot, and a title with only an English overview stores `none`. The key is never logged.
- **New fills.** After a match is saved, the same fill fetches the overview and translates it when needed. An overview or translation failure never fails the fill: the art is stored, `overview_status` becomes `failed`, and the filler logs `overview <slug> failed: <reason>`.
- **Backfill.** A lookup that answers `ready` for a matched row whose overview is missing or past its retry window schedules an overview-only job, unless an art fill for that slug is running. The job uses the stored `tmdb_id`, with no search, no matcher and no Jev. Overview jobs are single-flight per slug in their own map, so they never block or skip an art fill, and they share the fill concurrency cap. The answer that scheduled the job carries `overview: null`. The next lookup carries the overview.
- **Retry.** `overview_status` has its own table in `src/art/retry.ts`:

  | `overview_status` | Meaning                                     | Settled for | Then                       |
  | ----------------- | ------------------------------------------- | ----------- | -------------------------- |
  | (null)            | never attempted                             | not at all  | fetched on its next lookup |
  | `ok`              | stored, Vietnamese or translated            | forever     | never fetched again        |
  | `none`            | TMDB has neither overview, or no translator | 7 days      | fetched on its next lookup |
  | `failed`          | TMDB or DeepSeek error                      | 10 minutes  | fetched on its next lookup |

  An `ok` row is final, so a title is translated at most once.

- **Schema.** `005_overview.sql` adds `overview`, `overview_lang` (`vi` or `en`, the language TMDB wrote it in), `overview_translated`, `overview_status` and `overview_attempted_at` to `title_art`. The check `title_art_overview_ok` makes an `ok` row carry text and a language, and makes `overview_translated` true exactly when `overview_lang` is `en`, so untranslated English cannot be stored as `ok`. A refill that matches a different TMDB id clears the overview columns.

## Accounts

- **Rows.** `db/migrations/010_auth.sql` creates `users`, `sessions` and `pending_signups`. Every `users` row is a confirmed account. An email is unique among users whatever its case. Deleting a user deletes its sessions. A `pending_signups` row is a sign-up waiting for its link: the token's SHA-256, the email and the password hash that sign-up chose.
- **Passwords.** `src/auth/password.ts` hashes with scrypt at N = 2^17, r = 8, p = 1 into a 64-byte key with a 16-byte random salt. The stored string is `scrypt$N$r$p$salt$hash` in base64url, and verify reads N, r and p from it, so `SCRYPT_PARAMS` can change without breaking old hashes. A sign-in for an unknown email verifies against `DUMMY_PASSWORD_HASH`, so it takes as long as a wrong password. A test fails when `SCRYPT_PARAMS` moves away from the dummy hash's parameters.
- **Sign-up.** Nothing is a user until its email is confirmed. Sign-up always answers the same 202 and hashes the password on every path, so every path costs the same. An email that already has an account gets a notice that someone tried to sign up with it, and nothing is stored. Any other email gets a new `pending_signups` row with this sign-up's own hash and a link. Earlier pending rows for the email stay, each with its own hash, so a second sign-up never changes what the first one's link creates. An email keeps at most its 5 newest pending rows. There is no resend endpoint. To get a new link, sign up again. Sign-up answers 503 when neither `WEB_BASE_URL` nor `ALLOWED_ORIGINS` is set, because no link can be built.
- **Confirming.** A token is 32 random bytes in base64url, and only its SHA-256 is stored. It lives 24 hours. The mailed link is `{WEB_BASE_URL}/verify-email#token=...`. The token rides in the fragment, so it never reaches a server log or a `Referer` header. The web page posts it to `/v1/auth/verify-email`. One statement deletes the live pending row for the token, inserts the user with that row's email and hash (`on conflict do nothing`), and deletes every other pending row for the email. So two requests with one token cannot both win, and two links for one email create one account. It answers 400 `invalid_token` when no row was deleted or the email already had an account.
- **No session on confirm.** Confirming opens no session and sets no cookie. The user signs in afterwards with the password they chose. Two people can sign up the same address, and both links reach its owner. An owner who clicks the link from someone else's sign-up creates an account with that person's password but does not land inside it, so they never use an account someone else can open. Their own password then fails, and until a password reset exists they cannot take that account back.
- **Sessions.** The `session` cookie holds another 32-byte random token, and only its SHA-256 is stored. The cookie is `HttpOnly; SameSite=Lax; Path=/` and `Secure` unless `COOKIE_SECURE=0`. Its `Max-Age` is the session's remaining life. A session lives `SESSION_TTL_DAYS` (30) from its last refresh. An authenticated request more than a day after the last refresh moves `last_seen_at` to now and `expires_at` to the earlier of now plus the TTL and 90 days after sign-in, and sends the cookie again. A request within the day changes nothing. A missing or expired session answers 401 and clears the cookie, and is never extended.
- **Limits.** `src/auth/auth.limits.ts` holds them. Sign-up, verify-email and sign-in allow 10 requests a minute per client each, on top of the global limit. After 5 failed sign-ins for one email in 15 minutes, that email answers 429 `rate_limited` with `Retry-After` until the oldest failure is 15 minutes old. Unknown emails are counted the same way. A successful sign-in clears the count. Sign-up mails one email at most 3 times an hour, the notice included, and still answers 202 past that, sending nothing and changing nothing. The per-email counters live in process memory, like the route throttler.
- **Cleanup.** `AuthService.cleanup()` runs every hour on an `unref()`'d timer. It deletes expired pending sign-ups and expired sessions, and prunes the per-email counters. The app tests turn the timer off by overriding `AUTH_CLEANUP_EVERY_MS` with null.
- **Mail.** `Mailer` in `src/auth/mailer.ts` has one method, `send({ to, subject, text })`. `createMailer` picks the implementation and is where a real provider goes. Today it returns `LogMailer`, which logs the sender, recipient and subject and never the body, because the body holds the link. So until a provider is added, nobody receives a link and no account can be created. Tokens, passwords and hashes are never logged.
- **Time.** Every time the module compares or stores comes from the `CLOCK` token, so tests move time by hand.

**Run a single replica.** The single-flight map, the rate limit counters and the auth limits live in process memory. Two replicas would each call TMDB for the same new slug, and each would allow the full rate.

## MyAnimeList

A lookup also carries the MAL score, rank and airing status of each title. `MalFiller` in `src/mal/mal.filler.ts` matches a slug to a MAL id in the background and stores the result in `title_mal`. Without `MAL_CLIENT_ID` it is off.

- **Score.** `matchMal` in `mal.matcher.ts` scores each candidate on name (0.45), season (0.2), year (0.2), episode count (0.1) and media type (0.05), and drops `pv`, `cm` and `music` entries. The best one is accepted at 0.8 or more with a lead of at least 0.05. The filler searches the queries from `sourceQueries` in `mal.queries.ts`: the slug romaji when it differs from the name, then up to 2 of the title's other names with their season markers dropped, then the display-name queries. Without other names that is at most 4 queries, and each name query adds one, so at most 6. The other names also feed the name score as aliases. When every search is rejected it tries up to 2 names TMDB knows the show by. It stops at the first accepted search.
- **Jev.** When the score rejects every search and `TYPESAFE_API_KEY` is set, the filler asks Jev once. It sends the show candidates of all searches, first search first, each id once, at most 20. With no candidate at all Jev is not asked. `MalJevJudge` in `mal.jev.ts` asks only the season pair: `match`, a choice over the MAL ids, and `any_match`, a noul. MAL lists each season as its own entry, so there is no show-scope question. The state holds the source (`title`, `romaji` when the slug romaji differs from the name, `otherNames` when the title has some, `season`, `year`, `episodeCount`) and per candidate `id`, `title`, `englishTitle`, up to 10 `synonyms`, `startDate` (or `year`), `episodeCount`, `mediaType` and `airingStatus`. The instructions add that a currently airing show's source episode count may be only the episodes aired so far. The answer passes on the same `JEV_MIN_*` thresholds as TMDB, and an accepted pick is stored with `min(noul, choice probability)` as its match score. The module logs `MAL Jev matcher is on (model ...)` or `MAL Jev matcher is off: TYPESAFE_API_KEY is not set` once at boot, and each call logs one line with the slug, the choice, its probability, the confidence, the noul, every option's probability and `accept` or `reject`. The key and the state are never logged.
- **Outcomes.** A score match is `ok` with `matched_by` `score`. A Jev pick is `ok` with `matched_by` `jev`. A Jev rejection is `none` with a reason such as `jev rejected: best 53913 p=0.62 noul=0.71`, and with Jev off the reason stays `no candidate cleared the match`. A Jev error (network, timeout, 401, 422, malformed answer, a choice that is not a candidate) is `failed`, never `none`. `011_mal_matched_by.sql` adds `matched_by`, null for misses and for rows saved before it.
- **Retry.** `src/mal/mal.retry.ts` holds the table. New rows carry `MAL_MATCHER_VERSION` 3. Version 2 read the season from the slug and version 3 asks Jev, so every `none` saved below 3 is matched again on its next lookup.

  | `status` | Settled for                                                          | Then                                      |
  | -------- | -------------------------------------------------------------------- | ----------------------------------------- |
  | (none)   | not at all                                                           | matched on its next lookup                |
  | `ok`     | 7 days since fetched (1 day while airing), or 10 minutes since a try | served as is, refreshed in the background |
  | `none`   | 7 days, not at all below the matcher version                         | matched again on its next lookup          |
  | `failed` | 10 minutes                                                           | matched again on its next lookup          |

  A `none` or `failed` row tried before the title's other names were stored is matched again once (see **Other names**).

- **Evaluating.** `pnpm nx run api:eval-mal --status=none --limit=20` reads `title_mal` rows joined to `title_art` on the slug for `source_name`, `source_year` and `source_episode_count`, and `title_names` for the stored other names when the slug has some, re-runs the MAL searches and the score with those names the way the filler does, and asks Jev for every row that has candidates, also the rows the score accepts, so the two can be compared. It skips the TMDB alias queries. It prints the slug, the stored status and id, the score verdict, Jev's choice and verdict, and whether the two agree. `--status` is `none`, `ok` or `all` (the default), and `--limit` defaults to 50. It opens Postgres read-only and writes nothing, but every row costs up to 4 MAL searches (6 with other names) and one Jev request. It needs `DATABASE_URL`, `MAL_CLIENT_ID` and `TYPESAFE_API_KEY` and stops with a message naming the missing ones.

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
| `TYPESAFE_API_KEY`      | no       | TypeSafe API key. Unset turns Jev off for TMDB and MAL              |
| `JEV_MODEL`             | no       | System One model, `jev-latest` by default                           |
| `JEV_MIN_NOUL`          | no       | Minimum `any_match` noul, 0 to 1, 0.85 by default                   |
| `JEV_MIN_CHOICE`        | no       | Minimum probability of Jev's choice, 0 to 1, 0.85 by default        |
| `JEV_MIN_CONFIDENCE`    | no       | Minimum confidence of Jev's choice, 0 to 1, 0.5 by default          |
| `DEEPSEEK_API_KEY`      | no       | DeepSeek API key. Unset turns overview translation off              |
| `DEEPSEEK_API_BASE`     | no       | DeepSeek API root, `https://api.deepseek.com` by default, or a stub |
| `DEEPSEEK_MODEL`        | no       | DeepSeek chat model, `deepseek-flash` by default                    |
| `MAL_CLIENT_ID`         | no       | MyAnimeList API client id. Unset turns the MAL numbers off          |
| `MAL_API_BASE`          | no       | MyAnimeList API root, `https://api.myanimelist.net/v2` by default   |
| `WEB_BASE_URL`          | no       | Web app root for mailed links. First `ALLOWED_ORIGINS` if unset     |
| `SESSION_TTL_DAYS`      | no       | Session life after its last refresh in days, 30 by default          |
| `COOKIE_SECURE`         | no       | `0` drops `Secure` from the session cookie. `1` by default          |
| `MAIL_FROM`             | no       | Sender of account mail, `Animefork <no-reply@localhost>` by default |

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

Copy `.env.example` to `.env` and fill in `TMDB_API_KEY`, `TYPESAFE_API_KEY` to turn Jev on, `DEEPSEEK_API_KEY` to translate English-only overviews, and `MAL_CLIENT_ID` for the MyAnimeList numbers. Git ignores `.env`.

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

`test/app.test.ts` boots `AppModule` through `@nestjs/testing` and sends requests with supertest. `test/auth/auth.app.test.ts` does the same for accounts with `MemoryAuthStore`, `FakeMailer` and a clock it moves by hand. `test/auth.store.pg.test.ts` checks `PostgresAuthStore` against a real database. It swaps the env, the pool, the store and the TMDB client for in-memory ones, so it needs neither Postgres nor the network. The `*.pg.test.ts` files run against a real Postgres only when `DATABASE_URL` is set, for example the compose database above. The TMDB fixtures in `test/art/tmdb/fixtures.ts` are hand-written from the API's documented response shapes. The Jev tests run the real SDK against a fake `fetch` (`test/art/tmdb/jev-mock.ts`, and `test/mal/jev-mock.ts` for the season-only MAL answer), so they check the request body on the wire without calling TypeSafe. The DeepSeek tests run `DeepSeekTranslator` against a fake `fetch` the same way.
