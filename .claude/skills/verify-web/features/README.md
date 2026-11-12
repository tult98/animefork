# apps/web feature map

Index and conventions. Read this, then the one feature file you need. Harness: Playwright with the real extension, headed, live site (`../SKILL.md` Drive and Record).

## Baseline preconditions

- Dev server on 5180 and Doctor green. Extension built. No other Chrome holds the profile.
- Signed out. Account features are not mapped.
- Data is **live**. Never assert a title, id or exact count. Assert structure (a shelf has cards, a sort changes the order, the URL carries the state).

## Driving conventions

- One scenario script per journey in `../scripts/`. Run `EV=$(cat apps/web/artifacts/verify-web/latest) node .claude/skills/verify-web/scripts/<name>.mjs`.
- Handles are `data-testid`, listed in each file.
- Load the route once and reload before recording. Wait for `:not([disabled])` on listing controls.

## Proof and skip reporting

Each run reports per feature: PASS or FAIL, the clip, the screenshots, and the state read. A journey that cannot run because of a precondition (a Cloudflare challenge, a 403, a missing extension build) is **SKIPPED: <reason>**, never a pass and never weakened to fit.

## Feature-file contract

An H1 and one paragraph of user-visible behavior. Then exactly four H2s in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with Playwright`, `Gotchas`. Every drive bullet pairs a user action with an exact command and an observable result. When the app adds an entry point, add it to its file. A proof that drives one entry point is incomplete when the file lists others.

## Index

| feature                                           | file              | status                                             |
| ------------------------------------------------- | ----------------- | -------------------------------------------------- |
| Home (hero, shelves, hover preview)               | `home.md`         | proved end to end (`home-live.mjs`)                |
| Listings (airing this season, upcoming)           | `listings.md`     | proved end to end (`listing-sort-page.mjs`)        |
| Watch page and player                             | `watch-player.md` | proved end to end (`watch-player.mjs`)             |
| Browse, schedule, rankings, my list, new episodes | -                 | _not yet mapped_                                   |
| Sign-in, sign-up, verify-email, account menu      | -                 | _not yet mapped_ (needs `apps/api` and a database) |
| Details modal, continue-watching card             | -                 | _not yet mapped_                                   |
| Design page (`/design`)                           | -                 | _not yet mapped_                                   |
