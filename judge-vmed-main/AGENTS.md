# Working agreements

- Work only inside this repository. Use a branch and open a pull request; never merge unless asked.
- Do not add Claude or any AI as a commit co-author.
- Authentication rules are fixed: admins sign in with an email address, judges sign in with a username. Do not change this without explicit approval. See `docs/auth.md`.
- Schema changes are new files in `migrations/`; never edit a migration that has been applied remotely.
- Before opening a PR run: `bun run typecheck`, `bun run test`, `bun run build`, and `bun run db:migrate:local`.
- Keep `README.md` and `docs/` in sync with behavior.
