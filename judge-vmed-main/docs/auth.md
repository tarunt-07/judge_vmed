# Authentication

Clerk handles sign-in. This app's D1 `accounts` table decides who may use the app and in which role.

## Rules (fixed)

| Role | Signs in with | How the account is created |
| --- | --- | --- |
| Admin | Email address + one-time code | An admin enters the email. The row is stored and Clerk sends an invitation email. |
| Judge | Username + password | An admin enters username, name and password. The Worker creates the Clerk user with that username (no email). |

- The first admin is `INITIAL_ADMIN_EMAIL` (`srijan.guchhait@gmail.com`). On their first sign-in the account is created automatically.
- An admin row is linked to a Clerk user only through Clerk's **verified primary email**.
- A judge row is linked at creation time through the Clerk user ID. Judges are never matched by email.
- The database enforces this: admins must have an email and no username; judges must have a username, no email, and a Clerk user ID.
- Disabled accounts are rejected on every API request, including requests with an existing session.
- Admin accounts have no password; sign-in always goes through a code emailed to them. Admins can reset a judge's password from the Accounts tab.
- The API client keeps a stable identity through Clerk token updates and obtains the current token for each request. A change of Clerk session remounts the workspace so the previous account's state is discarded.
- API requests have a 15-second deadline, including token acquisition. Requests are not automatically replayed after failures or timeouts.

## Clerk dashboard setup (one time)

1. Create a Clerk application for this site.
2. **User & authentication → Email, phone, username**
   - Enable **Email address**, allow it for sign-in with **email verification code**, require verification.
   - Enable **Username**, allow it for sign-in.
   - Do **not** make either one required at sign-up (judges have no email, admins have no username).
   - Enable **Password** for judges, but do not require it at sign-up.
3. **Restrictions → Sign-up mode: Restricted.** Nobody can self-register; only invitations and Worker-created users exist.
4. **Users → Create user** (or **Invite**) for `srijan.guchhait@gmail.com` so the initial admin can sign in. No password is needed; the first sign-in code verifies the email.
5. **Domains**: add the production domain of the Worker when deploying. The production instance needs its CNAME records (`clerk`, `accounts`, `clkmail`, and the two DKIM records under `clk*._domainkey`) on the app's domain for sign-in and code emails to work; `clerk-dns-import.txt` lists them.

The current primary domain is `judge.vmedithon.co.in`, with the frontend API on `clerk.judge.vmedithon.co.in`. Its existing domain configuration is managed separately from Wrangler; do not add `routes` to `wrangler.jsonc`.

## Results permissions

All `/api/results` routes require an active signed-in account. `GET /api/results` lists round summaries (ID, name, position and status) for the selector without exposing the admin round-management API. `GET /api/results/:roundId` lets admins and judges read scores, criterion marks, ranks, judge names and remarks in any round. Both roles may export the results shown in the browser.

`DELETE /api/results/:roundId/teams/:teamId` requires an admin and remains protected on the server. Judges do not see reset controls or the actions column. `/api/rounds`, `/api/teams` and `/api/accounts` remain admin-only. Scoring continues through the judge-only `/api/judging` routes with the existing round, membership and duplicate-submission checks.

The judge team-list API includes team name, team lead, PS and Short Desc. CSV imports store only those fields; other columns such as contact details and payment screenshots are dropped before anything is saved. Empty PS or description values are returned as empty strings.

## Keys

- `CLERK_PUBLISHABLE_KEY`: set in `wrangler.jsonc` `vars` (it is public). The browser reads it from `GET /api/config`.
- `CLERK_SECRET_KEY`: secret. Locally in `.dev.vars`; in production `bunx wrangler secret put CLERK_SECRET_KEY`.
- `ALLOWED_ORIGINS`: optional extra origins allowed as Clerk authorized parties. The Worker's own origin is always allowed.
