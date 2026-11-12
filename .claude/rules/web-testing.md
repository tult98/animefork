---
paths:
  - apps/web/**
---

# Writing tests in apps/web

Vitest, React Testing Library and `@fetch-mock/vitest` (a Vitest wrapper over `fetch-mock`). Run with `pnpm nx test web`.

## What a unit test covers

- Test one small thing: a component, a hook, or a function. Do not render a route or the whole app.
- Pass the component to the custom `render` from `src/test/test-utils.tsx` (`render(<Hero items={items} />)`). Use `renderHook` from the same file for hooks. Both wrap the app providers. Import `screen`, `userEvent` helpers and the rest of Testing Library from `test-utils` too.
- Do not test plumbing that has no behavior of its own, such as `apiRequest` or a Zod schema that the code under test already runs.

## Choose the scenarios

- Name the few behaviors a reader of the feature cares about before writing: the main success, the failure the user sees, and the one edge that changes what is shown. Test those.
- Do not test every branch, and do not split one behavior into several tiny tests. Put the checks that describe one behavior in one test.
- Skip a case that repeats one already covered, such as a second 404 through the same status check.

## Name tests for the behavior

Say what the feature shows or does, not how the call is answered.

- Good: `shows 2 hero titles and the season path of the home page`, `keeps the titles of the pages that loaded when one fails`.
- Bad: `returns the mocked response`, `calls fetchHome`.

## Network: fetch-mock, every call explicit

- `src/test/setup.ts` mocks global `fetch` for every test. A request with no route throws, so a test lists every call it expects. No test reaches a real server.
- Import it with `import fetchMock from '@fetch-mock/vitest'`. Set routes with `fetchMock.get(url, response)`. Chain several routes in one statement:
  ```ts
  fetchMock
    .get(upstream('/'), mockHomeHtml)
    .get(upstream(SEASON_PATH), mockSeasonHtml);
  ```
- A status alone is a response: `fetchMock.get(url, 503)`. Use `{ repeat: 1 }` for a call that fails once and then succeeds.
- Assert that the expected request was made with the matchers, not only the parsed result. Do not read `fetchMock.callHistory` in a test.
  ```ts
  const home = await fetchHome(transport);
  expect(fetchMock).toHaveFetched(upstream('/'));
  expect(home.hero).toHaveLength(2);
  ```
  The matchers are `toHaveFetched(url)`, `toHaveNthFetched(n, url)` (1-based, for order), `toHaveFetchedTimes(n, url)`, `.not.toHaveFetched(url)` for a call that must not happen, and the verb forms such as `toHavePosted(url, body)`.
- First-party API calls use the full URL (`https://api.test/v1/...`) and set `VITE_API_URL` with `vi.stubEnv`.
- Upstream site pages go through the `Transport`, which the custom `render` backs with `FetchTransport`. Name the URL with `upstream(path)` from `src/test/fetch-transport.ts`.
- Do not stub `fetch` with `vi.stubGlobal`, and do not write a fake `Transport` by hand.

## Mock data

- Each feature keeps its mock data in `__mockData__/index.ts` next to the code (`src/lib/titles/__mockData__/index.ts`). Export plain strings and objects such as `mockHomeHtml`.
- Give a test only the data it needs. A page has 2 or 3 titles, not a captured copy of the site. Do not read files from `public/fixtures` in unit tests.
- Change a copy of the mock inside the test when a case needs a variation (`mockHomeHtml.replace(...)`), instead of adding a second full page.

## Files

- Tests live in `__tests__/` next to the code, named `<thing>.test.ts(x)`.
- A test that needs the DOM starts with `// @vitest-environment jsdom`.
