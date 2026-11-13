---
paths:
  - apps/api/**
---

# Writing tests in apps/api

Vitest, `supertest` against the Nest app, and `@fetch-mock/vitest` for the calls the service makes to other servers. Run with `pnpm nx test api`.

## What a test covers

- Test a feature, not an implementation unit. A feature is what a caller of the service gets: an endpoint's answer, or the rows a background job leaves in the store.
- Test an endpoint through HTTP. Send the request with `supertest` and assert the status and the body. The controller, the pipes, the guard, the service and the store all run in that one test, so none of them needs a test of its own.
- Test a job that has no endpoint, such as a filler, by calling its public method and reading the store afterwards.
- Test a pure function directly only when it holds real logic a reader would want to see as a table of inputs and outputs, such as a matcher or a query builder.
- Do not test plumbing that has no behavior of its own: a Zod schema in a `contract.ts`, a cookie helper, a config parser or a provider binding that an endpoint test already runs.

## Write the test so it reads on its own

A reader should understand a test from top to bottom without opening another file.

- Inline small things: the path, the status, the request body, the error body, a title, a row. Write `post('/v1/auth/sign-in')` and `toEqual({ error: 'invalid_token' })`, not `post(SIGN_IN_PATH)` and `toEqual(INVALID_TOKEN)`. Do not import the path constants from a `contract.ts`.
- Do not make constants for values a test asserts on or routes by. The test shows them.
- Do not hide a test's steps in helpers such as `signUp()`, `signedIn()` or `setup()`. Repeating two or three requests is fine. When a test needs state that takes a long flow to reach, such as a verified account, write that state to the memory store in the test instead of replaying the flow.
- No `helpers.ts`, no `fixtures.ts`, no `*-mock.ts`. A shared file of named entities (`TONIKAWA`, `TENKEN_2`) or a shared table of routes makes the reader open it to learn what the test received.
- The one shared helper is the app builder in `test/test-app.ts`. It boots `AppModule` with the memory stores and returns `{ app, http, advance }`. A test passes it only what differs, such as an env value or one provider. Do not write a second `Test.createTestingModule` chain in a test file.

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

- Feature tests run on the memory stores, which the app builder binds. Seed a store through its own methods in the test.
- A Postgres store has its own `<thing>.store.pg.test.ts`. Test only what the SQL decides and the memory store cannot show: a constraint, an upsert, an ordering, a migration. The file skips without `DATABASE_URL` (`describe.skipIf(!url)`), uses ids no other file uses, and deletes its own rows in `afterAll`.
- Time comes from the injected clock. Move it with `advance(ms)` from the app builder and write the duration in the test (`advance(31 * 24 * 60 * 60_000)`). Do not use `vi.useFakeTimers` for a duration the clock already controls.

## Files

- Tests live in `apps/api/test/<feature>/`, named `<thing>.test.ts`, beside that feature's `__mockData__/`.
- A model evaluation such as `eval-mal` is not a test of behavior. It keeps its own Nx target and these rules do not apply to it.
