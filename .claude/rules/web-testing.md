---
paths:
  - apps/web/**
---

# Writing tests in apps/web

Vitest, React Testing Library and `@fetch-mock/vitest` (a Vitest wrapper over `fetch-mock`). Run with `pnpm nx test web`.

## What a unit test covers

- Test a feature, not an implementation unit. A test covers one behavior a user sees, and the feature can be a function, one component, or several components working together (a sign-in form next to the account menu). Render everything the behavior needs, and no more.
- Do not render the whole app or the full route tree to reach a feature. Render the feature's own components with `render`.
- Pass the component to the custom `render` from `src/test/test-utils.tsx` (`render(<Hero items={items} />)`). It wraps the app providers and re-exports the rest of Testing Library, so import `screen`, `waitFor` and the others from there. `userEvent` comes from `@testing-library/user-event`.
- A component that uses `Link` or `useNavigate` needs a router: pass `{ path: '/start' }`. Its first paint is async, so find elements with `findBy*`. `render` returns `router`, so a test can assert where navigation ended (`router.state.location.pathname`).
- Test a hook through the component that uses it, not on its own, so one test covers the whole feature. Use `renderHook` only when no component uses the hook.
- Do not test plumbing that has no behavior of its own, such as `apiRequest` or a Zod schema that the code under test already runs.

## Write the test so it reads on its own

A reader should understand a test from top to bottom without opening another file.

- Inline small things: URLs, status codes, a user object, an email, a label. Write `fetchMock.get('path:/v1/auth/me', 401)`, not `fetchMock.get(ME, unauthenticated)`.
- Do not hide a test's steps in helpers such as `fill()`, `submit()` or `signUpAndWait()`. Repeating two or three lines of `userEvent` is fine.
- Extract only what is big and used in several tests, such as a page of HTML. That belongs in `__mockData__`, and the test says what it contains in its name or a comment.
- Do not make constants for values a test asserts on or routes by. The test shows them.

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
- Import it with `import fetchMock from '@fetch-mock/vitest'`. Set routes with `fetchMock.get(matcher, response)` and match by path: `'path:/v1/auth/me'` matches that path on any origin, so a test needs no origin constant. Chain several routes in one statement:
  ```ts
  fetchMock
    .get('path:/', mockHomeHtml)
    .get('path:/season/autumn/2026/', mockSeasonHtml);
  ```
- A status alone is a response: `fetchMock.get(url, 503)`. Use `{ repeat: 1 }` for a call that fails once and then succeeds.
- Assert that the expected request was made with the matchers, not only the parsed result. Do not read `fetchMock.callHistory` in a test.
  ```ts
  const home = await fetchHome(transport);
  expect(fetchMock).toHaveFetched('path:/');
  expect(home.hero).toHaveLength(2);
  ```
  The matchers are `toHaveFetched(matcher)`, `toHaveNthFetched(n, matcher)` (1-based, for order), `toHaveFetchedTimes(n, matcher)`, `.not.toHaveFetched(matcher)` for a call that must not happen, and the verb forms such as `toHavePosted(matcher, { body })`.
- The matchers are synchronous: they check the calls that already happened and do not wait for one. Wait for what the user sees with `findBy*`, then assert the request:
  ```ts
  fetchMock.get('path:/v1/auth/me', 401);
  render(<AccountMenu buttonClassName="" />, { path: '/' });
  await screen.findByRole('link', { name: 'Đăng nhập' });
  expect(fetchMock).toHaveFetched('path:/v1/auth/me');
  ```
- To test a state while a request is in flight, give the route a delay: `fetchMock.post(matcher, response, { delay: 200 })`. Do not hold a request open with a promise and a `release()` function.
- First-party API calls need `VITE_API_URL`: set it in the test file with `vi.stubEnv('VITE_API_URL', 'https://api.test')`, then match the route by path (`'path:/v1/auth/me'`).
- Upstream site pages go through the `Transport`, which the custom `render` backs with `FetchTransport`. Match them by path too (`'path:/phim/x/xem-phim.html'`).
- Do not stub `fetch` with `vi.stubGlobal`, and do not write a fake `Transport` by hand.

## Mock data

- A feature keeps its big mock data, such as an HTML page, in `__mockData__/index.ts` next to the code (`src/lib/titles/__mockData__/index.ts`). Export plain strings and objects such as `mockHomeHtml`. Small values stay inline in the test.
- Give a test only the data it needs. A page has 2 or 3 titles, not a captured copy of the site. Do not read files from `public/fixtures` in unit tests.
- Change a copy of the mock inside the test when a case needs a variation (`mockHomeHtml.replace(...)`), instead of adding a second full page.

## Files

- Tests live in `__tests__/` next to the code, named `<thing>.test.ts(x)`.
- A test that needs the DOM starts with `// @vitest-environment jsdom`.
