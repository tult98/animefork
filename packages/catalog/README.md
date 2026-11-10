# catalog

Domain schemas and HTML parsers for the AnimeVsub upstream site. Plain TypeScript with zod 4 and cheerio. No React, no network, no workers.

The upstream has no API, so the scraped markup is the contract. Every parser is a pure function `(html: string) => T`. It returns data validated by a zod schema, or throws `ParseError` with the `parser`, the CSS `selector` and the `field` that drifted.

## Commands

| Command                                                    | What it does                       |
| ---------------------------------------------------------- | ---------------------------------- |
| `pnpm nx run-many -t typecheck lint test build -p catalog` | All checks and the `dist` build    |
| `pnpm nx test catalog`                                     | Vitest, including parser snapshots |

## Parsers

| Export                   | Page                                                       | Returns              |
| ------------------------ | ---------------------------------------------------------- | -------------------- |
| `parseHome`              | `/`                                                        | `Home`               |
| `parseDetail`            | `/phim/<slug>-a<id>/`                                      | `TitleDetail`        |
| `parseEpisodes`          | a watch page, `/phim/<slug>-a<id>/xem-phim-<n>.html`       | `Episode[]`          |
| `parseList`              | `/the-loai/<genre>/`, `/quoc-gia/`, `/danh-sach/`, `/tag/` | `ListPage`           |
| `parseAjaxItem`          | `POST /ajax/item` (hot today, top of the week)             | `RankList`           |
| `parseRanking`           | `/bang-xep-hang/<type>`                                    | `RankList`           |
| `parseSchedule`          | `/lich-chieu-phim/`                                        | `ScheduleDay[]`      |
| `parseSearchSuggestions` | `POST /ajax/suggest`                                       | `SearchSuggestion[]` |

Decisions worth knowing:

- A title id is the `a<number>` suffix of the slug, for example `a4536`.
- Optional fields stay optional. "This season" and "hot update" cards carry no genres, year, description or studio.
- A rating outside 0 to 10 is dropped. The 2022 home carousel printed a vote count (479) where the other cards print a score.
- Home section containers (`#new-home`, `.MovieListSldCn`, ...) are mandatory. A renamed container throws. A present but empty section parses to `[]`.
- `releaseTime` is the date printed on a pre-release card (`2022-11-09`) or just the year. The old parser computed an absolute timestamp from a countdown and the current time. Parsers here take no clock, so they stay pure.

## Fixtures

Files in `fixtures/` are named after the route they stand for. **Real** files are byte-for-byte copies of captures from the old app (`apps/desktop-web/src/__test__/apis/data/*.txt`). **Synthetic** files are hand-written, end in `.synthetic.html` and say so in a header comment.

| File                                             | Status    | Notes                                                                  |
| ------------------------------------------------ | --------- | ---------------------------------------------------------------------- |
| `index.html`                                     | real      | Home page, captured in 2022                                            |
| `phim/tonikaku-kawaii-a3860.html`                | real      | Title page, 2022                                                       |
| `phim/tonikaku-kawaii-a3860/xem-phim-72839.html` | real      | Watch page with the full episode list and player tokens, 2022          |
| `lich-chieu-phim.html`                           | real      | Schedule, 2022                                                         |
| `bang-xep-hang.html`                             | real      | Rankings, 2022                                                         |
| `the-loai/list.synthetic.html`                   | synthetic | Genre list page. Built from the old selectors and the real card markup |
| `ajax-item.synthetic.html`                       | synthetic | `/ajax/item` fragment. Built from the real card markup                 |
| `pre-search.synthetic.html`                      | synthetic | `/ajax/suggest` rows, transcribed from the old spec                    |

Not used on purpose:

- `the-loai/comedy.txt` is not a genre page. It is a second capture of the home page: it differs from `index.txt` only in whitespace, stray `\r` text and the countdown seconds. It has no `#filter`, no `.breadcrumb` and no pagination. A test asserts that `parseList` rejects the home page for that reason.
- `phim/kubo-san-wa-mob-wo-yurusanai-a4738.txt` is also a home page capture (title "Anime Vietsub Online", the six home sections), not a title page.

### What must be re-captured

All real fixtures are from 2022. The plan measured the live site in 2026 with these selectors and found them working, but the snapshots describe the 2022 markup. Capturing needs a human at a real browser with the AnimeVsub Helper extension. The upstream is behind Cloudflare, `curl` gets a 403, and nothing here tries to get around that. `apps/web/scripts/capture-fixtures.ts` does the capture. It only lists `/` today, so add these targets to its `TARGETS` first, then copy the files from `apps/web/public/fixtures/captured/` into `fixtures/`.

| Capture                                                      | Replaces                       | Why                                                                                                                                   |
| ------------------------------------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `/the-loai/hai-huoc/` (and `?page=2`)                        | `the-loai/list.synthetic.html` | No real list page exists. The filter chip groups and pagination selectors are unverified, and the `.fc-quality` group name is a guess |
| `POST /ajax/item` (`top-bo-week`)                            | `ajax-item.synthetic.html`     | The plan did not check its card fields or whether it still returns a bare fragment                                                    |
| `POST /ajax/suggest`                                         | `pre-search.synthetic.html`    | Only an excerpt in an old spec exists                                                                                                 |
| `/`, a title page, `/lich-chieu-phim/`, `/bang-xep-hang/day` | the 2022 real files            | Refresh against the current site. A diff in the snapshots is the drift report                                                         |

Update snapshots with `pnpm nx test catalog -- -u` after a capture, and read the snapshot diff before committing it.

## Not ported

- `account/info`, `ajax/notification`, `ajax/player-fb` and `Mgn`. They serve the account, notification and player flows of the old app, not the catalog.
- The air-time countdown. Schedule cards print the time of day in the same span that pre-release cards use for a date. It is not read yet.
- The watch page `update` field (next episode weekday and time). Playback and episode scheduling belong with the player phase.
