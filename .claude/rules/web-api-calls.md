---
paths:
  - apps/web/**
---

# Making API calls in apps/web

The app talks to two backends. Pick the channel by what the data is.

## First-party API (`VITE_API_URL`)

Never call `fetch` or build the URL by hand. Use the hooks in `apps/web/src/lib/api/`.

- **Read:** `useApiQuery<Body, Data>({ key, endpoint, map?, enabled?, ...reactQueryOptions })`.
- **Write:** `useApiMutation({ method, endpoint })`, then `mutateAsync({ body, keepalive })`.
- **Write the endpoint as a literal** at the call site, for example `'/v1/watch-progress'`. A reader should see which API the code calls without opening another file. Do not use the path helpers from the API `contract.ts` files for this.
- **Use `map`, not `select`,** to reshape a response. Callers that write to the cache with `setQueryData` write the mapped shape, so the cache has to hold it.
- **The hooks do not validate the body.** When a call needs validation or its own error type, wrap the hook in a domain hook. `apps/web/src/lib/auth/use-auth-calls.ts` parses the body with Zod and returns an `AuthResult`. `apps/web/src/lib/progress/save-outcome.ts` turns the result into a `SaveOutcome`.
- **Failures throw `ApiError`,** which holds `status`, `code` and `retryAfterSeconds`. An unset `VITE_API_URL` or a network failure throws a plain `Error`.
- **Query keys:** export a constant or a key function when another file reads or writes that cache entry, like `SESSION_KEY` and `progressKey(slug)`.
- **Use the types from the API** `contract.ts` files for request and response shapes.

## Upstream site content (HTML scraping)

Go through the `Transport` from `useTransport()`, never `fetch`. A fetch function takes the transport, calls `transport.get`, checks the status with `expectOk`, and parses the HTML into Zod-validated types. A component wraps it in plain `useQuery`. These calls do not use `useApiQuery`.

## Known exception

The art lookup in `apps/web/src/lib/titles/art.ts` is a POST used as a `queryFn`. It chunks titles, sets a timeout and takes an injected `fetch`, so it stays as it is.

## Tests

See `.claude/rules/web-testing.md`. Every call, first-party and upstream, is answered by `fetch-mock` in the test, and `apps/web/src/test/setup.ts` clears `VITE_API_URL` so no test reaches a real service.
