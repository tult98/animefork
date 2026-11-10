# AnimeVsub feature map

Recipes for driving each user-facing feature with `../scripts/pw.cjs` (Playwright + the AnimeVsub Helper extension). Read `../SKILL.md` first for Launch, Doctor, Drive and Cleanup.

## Baseline preconditions

- Dev server up and Doctor all OK (`../SKILL.md`). Anonymous browsing; no login.
- Data is live from the upstream anime site: assert structure and what the test itself typed or clicked, not fixed titles.
- Baseline console noise is listed in `../SKILL.md` Gotchas. Anything else in `$EV/<scenario>.console.log` is worth reporting.

## Driving conventions

- Each scenario is one script, one `pw.open({ runDir: process.env.EV, scenario })`, one `t.close(...)`.
- Wait for `a[href^="/phim/"]` (anime cards) before the first action; allow 120 s on a cold dev server.
- Every drive bullet pairs a user action with an exact command and an observable result. Use `t.step(label, fn)` for user actions so clips are paced.
- Scenario name = the feature file name (`search`, `showtimes`, ...), which becomes `video/<scenario>.webm`.

## Proof and skip reporting

A journey passes only if the observable named in its bullets happened. If a precondition is missing (upstream down, extension not built, playback 403), report that journey as **BLOCKED** with the reason and the evidence, never weaken the journey to make it pass. State what was mocked (nothing is mocked by default). List every bullet you did not drive as _skipped_ in the report.

## Feature-file contract

An H1 and one paragraph of user-visible behavior, then exactly four H2s in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with Playwright`, `Gotchas`.

## Index

| feature                                                                                                     | file                             | status                                    |
| ----------------------------------------------------------------------------------------------------------- | -------------------------------- | ----------------------------------------- |
| Home (trending, new, schedule teasers)                                                                      | [home.md](home.md)               | mapped                                    |
| Search                                                                                                      | [search.md](search.md)           | mapped, proved end to end                 |
| Watch an anime / episode page                                                                               | [watch-anime.md](watch-anime.md) | mapped (playback BLOCKED by upstream 403) |
| Showtimes (weekly schedule)                                                                                 | [showtimes.md](showtimes.md)     | mapped                                    |
| Rankings                                                                                                    | [rankings.md](rankings.md)       | mapped                                    |
| Browse by genre / country / tag / list (`/the-loai/:v`, `/danh-sach/:v`, `/quoc-gia/:v`, `/tag/:v`, season) | -                                | _not yet mapped_                          |
| Account: log in, follow, history, notifications, edit profile (`/tai-khoan/*`, `/notification`)             | -                                | _not yet mapped_ (needs real credentials) |
| Settings, player settings (`/tai-khoan/settings*`)                                                          | -                                | _not yet mapped_                          |
| Playlists (`/playlist/:id`), Feed (`/feed`), News (`/news`)                                                 | -                                | _not yet mapped_                          |
| Task manager / downloads (`/task-manager`)                                                                  | -                                | _not yet mapped_                          |
