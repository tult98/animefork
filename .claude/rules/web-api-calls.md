---
paths:
  - apps/web/**
---

# Making API calls in apps/web

The app talks to two backends. Pick the channel by what the data is.

## First-party API (`VITE_API_URL`)

Never call `fetch` or build the URL by hand. Call the `api` client (a `ky` instance) from `apps/web/src/lib/api/client.ts` inside a plain react-query hook.

- **Read:** `useQuery({ queryKey, queryFn: ({ signal }) => api.get('v1/auth/me', { signal }).json<UserResponse>() })`.
- **Write:** `useMutation({ mutationFn: () => api.post('v1/auth/sign-out') })`, or `api.put('v1/watch-progress', { json: body, keepalive })` from a plain function.
- **Write the endpoint as a literal** at the call site, without a leading slash (ky rejects one). A reader should see which API the code calls without opening another file. Do not use the path helpers from the API `contract.ts` files for this.
- **Reshape a response in the `queryFn`** (`.then((body) => body.user)`), not with `select`. Callers that write to the cache with `setQueryData` write the mapped shape, so the cache has to hold it.
- **`api` does not validate the body.** When a call needs validation or its own error type, wrap the call in a domain hook. `apps/web/src/lib/auth/use-auth-calls.ts` parses the body with Zod and returns an `AuthResult`. `apps/web/src/lib/progress/save-outcome.ts` turns the result into a `SaveOutcome`.
- **Failures throw `ApiError`** (a ky `HTTPError`), which holds `status`, `code` and `retryAfterSeconds`. An unset `VITE_API_URL` or a network failure throws a plain `Error`.
- **Query keys:** export a constant or a key function when another file reads or writes that cache entry, like `SESSION_KEY` and `progressKey(slug)`.
- **Use the types from the API** `contract.ts` files for request and response shapes.

## Upstream site content (HTML scraping)

Call the `upstream` client from `apps/web/src/lib/transport/`, never `fetch`. It is a `ky` instance whose `fetch` goes through the `Transport` (the helper extension, or replay fixtures), so it is used the same way as `api`:

```ts
useQuery({
  queryKey: ['new-episodes'],
  queryFn: ({ signal }) =>
    upstream
      .get('danh-sach/all/all/all/all/all/all/jp/', { signal })
      .text()
      .then(parseNewEpisodes),
});
```

- The path has no leading slash. A path taken from the site's own links goes through `upstreamPath(path)`.
- A non-2xx answer throws a ky `HTTPError`. A missing extension throws `ExtensionMissingError`.
- Put a single request inline in the `queryFn`, so the path is visible where `useQuery` is called. A call with real logic of its own, such as `fetchSeasonRest` (several pages, a failed page dropped), stays a function that calls `upstream` itself. Do not inline it to show the path: a long `queryFn` reads worse than a named function.
- Keep the HTML parsing in pure `parse*` functions that take the HTML string, and parse into Zod-validated types.
- The transport is chosen on first use (`getTransport()`), so no provider or hook is needed. Tests swap it with `setTransport`.

## Known exception

The art lookup in `apps/web/src/lib/titles/art.ts` is a POST used as a `queryFn`. It chunks titles, sets a timeout and takes an injected `fetch`, so it stays as it is.

## Tests

See `.claude/rules/web-testing.md`. Every call, first-party and upstream, is answered by `fetch-mock` in the test (`setup.ts` points the upstream transport at `fetch`), and `apps/web/src/test/setup.ts` clears `VITE_API_URL` so no test reaches a real service.
