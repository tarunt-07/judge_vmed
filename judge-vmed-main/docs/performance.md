# Loading reliability and Cloudflare performance

## Diagnosis

The production client inspected on 2026-09-14 (`index-BqxpsGuz.js`) recreated its API client whenever the `getToken` callback changed. `App` supplied a new callback on each auth render. Every `useResource` then fetched again; `/me` switched the portal back to its loading screen and unmounted the page, losing local form state.

The original poller used `setInterval`, so requests could overlap on a slow connection. Switching resource paths also exposed data from the previous path until the new response arrived. Neither startup configuration nor token acquisition nor API response reading had an application deadline.

The stable-client fix was present on `fix/api-identity-refetch` but absent from the production bundle. Uploading a pull-request version does not make it the deployed version.

## Current behavior

- Keep one API client per mounted Clerk session and read the latest token through a ref. Key the provider by `sessionId` to reset account data when the session changes.
- Keep existing data visible during a refresh of the same resource. Clear data and errors immediately when the path changes or becomes null.
- Abort reads when their resource is replaced or unmounted. Ignore late responses from old requests.
- Schedule the next poll after the current request completes. Pause future polls in hidden tabs and refresh on visibility restoration. The 15-second judging-round interval is a delay after completion, so slow requests reduce polling frequency.
- Bound the entire request operation to 15 seconds, including token acquisition and body reading. Show a recoverable error and never retry a write automatically. Cancellation cannot undo a write that has already reached the server.

## Cloudflare choices

- Preserve `assets.run_worker_first: ["/api/*"]`: pages and assets are served directly without executing the application Worker.
- `public/_headers` adds `Cache-Control: public, max-age=31536000, immutable` only to Vite's content-hashed `/assets/*` files. Keep HTML's default revalidation so the next visit discovers a new deployment. Never place files with stable names under `/assets/`.
- Keep authenticated API responses `no-store` and continue checking the D1 account on every request, so account disabling is enforced. No shared user-data cache is introduced.
- Fetch judging round status and team availability in one D1 batch of two statements. The former implementation loaded all criteria, membership IDs and score counts first, using five statements across two database calls. The submission path and its write-time safeguards are unchanged.
- Retain existing lazy-loaded pages, Worker minification, schema and indexes. No new Cloudflare service or paid feature is needed.

Cloudflare documents [custom static asset cache headers](https://developers.cloudflare.com/workers/static-assets/headers/) and [D1 batch execution](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch).

## Measured regression workloads

These compare the old and fixed implementations with the same local workloads. They are request/query counts, not a claim about production latency or Core Web Vitals.

| Workload | Before | After |
| --- | --- | --- |
| Initial resource load plus ten auth callback updates | 11 fetches | 1 fetch |
| One pending read spanning three 1-second poll intervals | 4 fetches started | 1 fetch started |
| Load a judging list of 2,000 teams | 5 SQL statements in 2 database calls | 2 SQL statements in 1 batch |
| SQLite rows returned for that team fixture (no criteria) | 4,002 | 2,001 |

The auth test also checks that the same input element retains unsaved marks and that a subsequent explicit refresh sends the latest token. Further tests cover request deadlines, cancellation, stale responses, hidden-tab polling, error recovery, role enforcement, round status and team availability.

## Verification

Use Node.js 24 LTS with Bun. Run the repository checks:

```bash
bun run typecheck
bun run test
bun run build
bun run db:migrate:local
```

React tests use happy-dom. Judging route tests execute the route's SQL against SQLite with every repository migration applied; they substitute only the D1 transport. This checks SQL behavior and statement counts, not Cloudflare network latency.

The 2026-09-14 verification passed all 41 tests, type checking, the production build and local D1 migrations. The built Cloudflare preview returned the expected SPA HTML, immutable JavaScript/CSS, uncached health/config JSON and an uncached 401 for unauthenticated `/api/me`. Production authenticated behavior still requires verification after deployment.

For the built deployment, use `bun run preview` and inspect `/`, a `/assets/` JavaScript file, `/api/config`, `/api/health` and an unauthenticated `/api/me`. Check that HTML revalidates, hashed assets are immutable, API responses are uncached, and unauthenticated requests return 401. Preview must use local D1.

After the PR is merged and deployed, sign in and leave a page with unsaved input open through auth updates, switch tabs, and throttle requests while changing rounds. Check that the page stays mounted, input is preserved, polling does not overlap, and stale data is not displayed. Confirm the deployed bundle contains the fix; a successful preview upload alone does not update production.
