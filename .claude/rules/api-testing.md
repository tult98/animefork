---
paths:
  - apps/api/**
---

# Writing tests in apps/api

Vitest, `supertest` against the Nest app, a real Postgres, and `@fetch-mock/vitest` for the calls the service makes to other servers. Start the database with `docker compose up -d` in `apps/api`, then run `pnpm nx test api`.

## What a test covers

- Test a feature, not an implementation unit. A feature is what a caller of the service gets: an endpoint's answer, or the rows a background job leaves in the store.
- Test an endpoint through HTTP. Send the request with `supertest` and assert the status and the body. The controller, the pipes, the guard, the service and the store all run in that one test, so none of them needs a test of its own.
- Test a job that has no endpoint, such as a filler, by calling its public method and reading the store afterwards.
- Test a pure function directly only when it holds real logic a reader would want to see as a table of inputs and outputs, such as a matcher or a query builder.
- Do not test plumbing that has no behavior of its own: a Zod schema in a `contract.ts`, a cookie helper, a config parser or a provider binding that an endpoint test already runs.
- Replace only what the service does not own: other servers (fetch-mock), the clock and the mailer. The database is real Postgres. Do not replace a service, a guard, a pipe or a controller of this codebase with `vi.fn`, `vi.mock` or `overrideProvider`. A test that replaces them passes while the real wiring is broken.

## Shape of a test

- Write three blocks with a blank line between them: set up the state and the routes, make one call, assert.
- Assert every outcome the caller or the next request depends on. That is the response (status and body together), the rows the store holds afterwards, the requests sent to other servers, and the mail sent.
- Assert an error by its status and its body (`401` and `{ error: 'invalid_credentials' }`). The web app branches on that code, so it is part of the contract.
- A guarded endpoint gets one test without a session (`401`). An endpoint with a body gets one test with an invalid body (`400`). One each is enough, because every endpoint goes through the same guard and pipe.
- Each test builds its own app and writes its own data. No test depends on another test's rows or on the order the tests run in. Do not seed data in `beforeAll` or in a shared file.
- Test files run in parallel against one database, so a test uses keys no other test uses. Give the email, the slug or the id a random part in the test (``const email = `ana-${randomUUID()}@example.test` ``). Assert on the rows of those keys, never on a whole table or a total count.

## Write the test so it reads on its own

A reader should understand a test from top to bottom without opening another file.

- Inline small things: the path, the status, the request body, the error body, a title, a row. Write `post('/v1/auth/sign-in')` and `toEqual({ error: 'invalid_token' })`, not `post(SIGN_IN_PATH)` and `toEqual(INVALID_TOKEN)`. Do not import the path constants from a `contract.ts`.
- Do not make constants for values a test asserts on or routes by. The test shows them.
- Do not hide a test's steps in helpers such as `signUp()`, `signedIn()` or `setup()`. Repeating two or three requests is fine. When a test needs state that takes a long flow to reach, such as a verified account, write that state through the store in the test (`app.get(AUTH_STORE)`) instead of replaying the flow.
- No `helpers.ts`, no `fixtures.ts`, no `*-mock.ts`. A shared file of named entities (`TONIKAWA`, `TENKEN_2`) or a shared table of routes makes the reader open it to learn what the test received.
- The one shared helper is the app builder in `test/test-app.ts`. It boots the real `AppModule` through `Test.createTestingModule`, connects the Postgres stores to the test database, overrides only the env, the clock and the mailer with `overrideProvider`, applies `configureApp` so the pipes, filters and CORS match production, and closes the app after the test. It returns `{ app, http, advance }`. A test passes it only what differs, such as an env value or one provider. Do not write a second `Test.createTestingModule` chain in a test file.

## Choose the scenarios

- Name the few behaviors a caller of the feature cares about before writing: the main success, the failure the caller sees, and the one edge that changes the answer. Test those.
- Do not test every branch, and do not split one behavior into several tiny tests. Put the checks that describe one behavior in one test.
- Skip a case that repeats one already covered, such as a second 400 through the same validation pipe.
- Use `it.each` only for a pure function whose rows are different behaviors. Do not use it to run one behavior through many inputs.

## Name tests for the behavior

Say what the caller gets, not how the test is built.

- Good: `keeps the owner's password when someone else signs up the same email after them`, `reads every page and keeps the synopsis without its credit`.
- Bad: `validates response shapes`, `calls the client twice`, `returns the mocked response`.

## Outbound HTTP: fetch-mock, every call explicit

- `test/setup.ts` mocks global `fetch` for every test. A request with no route throws, so a test lists every call it expects. No test reaches TMDB, MyAnimeList, Tenrai, AniSkip, DeepSeek or Resend.
- Build the client without a `fetch` option so it uses the mocked global. Do not write a fake by hand: no `vi.fn<typeof fetch>`, no `async (input) => Response.json(...)`, no array that records the calls.
- Import it with `import fetchMock from '@fetch-mock/vitest'`. The service calls several servers, so write the full URL in the route. Chain several routes in one statement:
  ```ts
  fetchMock
    .get('https://tenrai.test/v1/anime/21/episodes?page=1', {
      pagination: { has_next_page: true },
      data: [{ mal_id: 1, title: 'The Door to Hell', synopsis: null }],
    })
    .get('https://tenrai.test/v1/anime/21/episodes?page=2', {
      pagination: { has_next_page: false },
      data: [{ mal_id: 2, title: 'The Key', synopsis: null }],
    });
  ```
- A status alone is a response: `fetchMock.get(url, 503)`. Use `{ repeat: 1 }` for a call that fails once and then succeeds.
- Assert that the expected request was made, not only what the endpoint answered. The request has finished by the time the awaited call returns, so use the synchronous matchers: `toHaveFetched(matcher)`, `toHaveFetchedTimes(n, matcher)`, `toHaveNthFetched(n, matcher)`, `.not.toHaveFetched(matcher)` for a call that must not happen, and `toHavePosted(matcher, { body })`. Do not read `fetchMock.callHistory`.

## Mock data

- Give a route only the fields and rows the test needs. A search answer has 1 or 2 results, not a captured copy of the real response.
- Small payloads stay inline in the test. A big payload that several tests use lives in `test/<feature>/__mockData__/index.ts` as a plain export such as `mockTmdbSeason`, and the test says what it contains in its name or a comment.
- Change a copy of the mock inside the test when a case needs a variation (`{ ...mockTmdbSeason, episodes: [] }`), instead of adding a second full payload.

## Stores and time

- Tests run on real Postgres through the Postgres stores, so a test runs the SQL that ships. Do not write a memory twin of a store, and do not bind a fake store in a test.
- Tests use a database of their own, never the one the dev server uses. `test/global-setup.ts` runs the migrations and empties the tables once before the run. A test does not truncate or delete between tests, because another file is using the same tables.
- A test fails when the database is unreachable. Do not skip it with `describe.skipIf`, because a skipped suite looks like a passing one.
- An endpoint test covers its store. Write a test against a store directly only for what no endpoint reaches, such as the migration runner or two writes that race for one constraint.
- Read stored state the way a caller would, with the next request (`GET /v1/watch-progress` after the `PUT`). Read the store directly (`app.get(WATCH_PROGRESS_STORE)`) only when no endpoint returns that state.
- Time comes from the injected clock. Move it with `advance(ms)` from the app builder and write the duration in the test (`advance(31 * 24 * 60 * 60_000)`). Do not use `vi.useFakeTimers` for a duration the clock already controls.

## Files

- Tests live in `apps/api/test/<feature>/`, named `<thing>.test.ts`, beside that feature's `__mockData__/`.
- A model evaluation such as `eval-mal` is not a test of behavior. It keeps its own Nx target and these rules do not apply to it.
