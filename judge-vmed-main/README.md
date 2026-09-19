# judge-vmed

Multi-round judging for VMEDITHON. One Cloudflare Worker serves both the React site and the `/api` backend, with data in D1 and sign-in through Clerk.

## Accounts

- **Admin**: signs in with email + a one-time code sent to their inbox. The first admin is `srijan.guchhait@gmail.com`. Admins add other admins and judges.
- **Judge**: signs in with a username and password created by an admin.

Details and the required Clerk dashboard settings are in [docs/auth.md](docs/auth.md).

## Teams CSV

Admins upload teams from the **Teams** tab.

```csv
Team Name,Team Leader Name,PS,Short Desc
Pulse Pioneers,Asha Sen,PS-01,Remote patient monitoring
Care Connect,Ravi Kumar,PS-02,"Helping patients find nearby care, quickly"
```

- Download the [CSV template](public/vmedithon-teams-template.csv) from the import dialog.
- Required headers: `Team Name` and `Team Leader Name`. Older `Team Lead` files and aliases (`team`, `name`, `team_lead`, `lead`, `leader`) still work; case and spacing don't matter.
- `PS` and `Short Desc` are optional and shown to judges when they select a team to score. Blank values show "Not provided". Each field keeps up to 2000 characters. Quoted descriptions can include commas and newlines.
- The registration form export can be uploaded as is: `Team details - Team name`, `Team leader details - Full name`, `Team details - Problem statement` and `Team details - Short description of your solution` are recognised.
- Only these four fields are saved. Every other column (emails, phone numbers, payment screenshots, member details, timestamps) is ignored and never stored.
- **Add team** in the Teams tab takes the same four fields; problem statement and short description are optional.
- Team name is the key: uploading a name that already exists (any letter case) updates that team.
- The whole file is checked first. If any row is invalid, nothing is imported and the errors list row numbers.
- Limit: 2000 teams per file.

## Rounds

Admins manage rounds from the **Rounds** tab. There can be any number of rounds.

- Each round has its own **criteria**: name, max marks (whole number 1 to 1000), and weightage (above 0, up to 1000). Up to 20 criteria per round.
- Each round has its own **teams**, picked from the uploaded list.
- Status: `draft` (new) → `open` (judges can score) → `closed`. A closed round can be reopened. A round needs at least one criterion and one team to open.
- A team's round score is the weighted percentage: `100 × Σ(marks ÷ max marks × weightage) ÷ Σ weightage`. Weightages don't need to add up to 100; the Share column shows each one's effective percentage.
- Deleting a round deletes its criteria and team list. Deleting a team removes it from every round.

## Judging

The Judging tab offers only rounds that are `open`. The Results tab allows judges to view all rounds.

1. Pick the round, then type to search teams by name or team lead.
2. Select an available team, review its PS and Short Desc, and enter marks for every criterion (0 to max, up to 2 decimals) and optional remarks.
3. Submit. Scores cannot be edited after submitting.

**One judge per team per round.** As soon as one judge submits for a team, every other judge sees it as "Already judged" and cannot select it. The database enforces this with `UNIQUE(round_id, team_id)`, so if two judges submit at the same moment only the first is saved and the second gets an error.

Submissions also re-check at write time that the round is still open and the team is still in it.

## Results

Admins and judges see the **Results** tab per round: rank (ties share a rank, e.g. 1, 1, 3), marks per criterion, weighted score, judge and remarks. Both can refresh results, switch rounds and use **Export CSV** to download the table. Judges have read-only access, including open, closed and draft rounds.

**Reset** is admin-only and deletes one team's score so it can be judged again (for example after a mistake). The API rejects judge reset requests even if sent outside the UI.

To protect scores:
- Criteria are locked once a round has any score. Reset all scores in that round to change them.
- A team that has a score cannot be removed from that round, and a scored team or round cannot be deleted.
- Each score stores a snapshot of the criteria it was given against.

## Local development

Use Bun and Node.js 24 LTS. The test runner uses Node's built-in SQLite support.

```bash
bun install
cp .dev.vars.example .dev.vars   # fill in Clerk keys
bun run db:migrate:local
bun run dev                      # http://localhost:5173
```

## Checks

```bash
bun run typecheck
bun run test
bun run build
bun run db:migrate:local
```

## Loading and Cloudflare performance

- Background auth updates keep the current page and unsaved input mounted. A different Clerk session starts a fresh workspace.
- Reads are cancelled on navigation. Polling waits for the previous request to finish, pauses in hidden tabs, and refreshes when a polling tab becomes visible.
- API calls and startup configuration have a 15-second deadline. Writes are never retried automatically; refresh to check whether a timed-out submission was saved before trying again.
- Cloudflare serves HTML and assets directly. Content-hashed JavaScript and CSS use immutable browser caching; HTML revalidates on each visit so deployments are picked up. Authenticated API responses remain `no-store`.
- The judging team list uses two SQL statements in one D1 batch. Score submission still checks round status and membership at write time.

See [docs/performance.md](docs/performance.md) for the regression measurements and verification steps.

## Deploy

The production Worker `judge` serves `judge.vmedithon.co.in` in the **VMedithon** Cloudflare account (`03dec81fd498c48fe0106857fab5a5ea`). Work from [VMedithon/judge-vmed](https://github.com/VMedithon/judge-vmed). Cloudflare's connected build deploys `main`; pull-request branch uploads are not production deployments. Wrangler's configured build command produces the Vite output before upload.

The custom domain is already configured in Cloudflare. Keep `routes` out of `wrangler.jsonc`; domain and DNS configuration are managed separately.

- D1 `judge-vmed` bound as `DB`, ID `5dbabc18-8eb4-45d4-99d5-3f4319d46d19`. Apply migrations with `bun run db:migrate:remote`; Cloudflare's code deploy does not apply D1 migrations automatically.
- Clerk app **VMEDITHON Judging**, production instance on `clerk.judge.vmedithon.co.in`. `CLERK_PUBLISHABLE_KEY` is set in `wrangler.jsonc` `vars`; `CLERK_SECRET_KEY` is a Worker secret set once per account/Worker and reused by later builds.

This account starts with an empty judging database. The four existing migrations were applied on 2026-09-14; no accounts, teams, rounds or scores were copied from the previous account. The configured `INITIAL_ADMIN_EMAIL` creates the first D1 admin account on successful sign-in.

To set up a fresh deployment:

1. Create the database: `bunx wrangler d1 create judge-vmed`, then put the returned `database_id` in `wrangler.jsonc`.
2. Set `CLERK_PUBLISHABLE_KEY` in `wrangler.jsonc` `vars`.
3. `bunx wrangler secret put CLERK_SECRET_KEY`
4. `bun run db:migrate:remote`
5. Push a branch and open a PR in `VMedithon/judge-vmed`. Cloudflare Builds deploys `main` after the PR is merged.

## Layout

| Path | Purpose |
| --- | --- |
| `worker/` | Hono API on the Worker (`/api/*`) |
| `src/` | React single-page app |
| `shared/` | Types shared by the API and the app |
| `migrations/` | D1 schema, applied in order |
| `docs/` | Auth rules, setup and performance verification |
