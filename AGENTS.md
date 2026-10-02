# capstone-vmmc

Root of a two-repo capstone project: `vmmc-backend` (NestJS + Supabase) and `vmmc-frontend` (Next.js), talking over a REST API. This root folder also holds the consolidated `e2e/` test suite, shared documentation (`docs/`), and repo-wide tooling config (root `package.json`, `.gitignore`, `playwright.config.ts`).

**Start with [`docs/HANDOFF.md`](docs/HANDOFF.md)** — current status, how to run it, test accounts, and what's actually left to do. [`docs/SYSTEM_ARCHITECTURE.md`](docs/SYSTEM_ARCHITECTURE.md) is the deep "how it works" doc; pair it with `docs/BACKEND_ARCHITECTURE.md` and `docs/FRONTEND_ARCHITECTURE.md`.

## Keep the docs in sync — this is a hard rule, not a suggestion

After any change worth remembering, update whichever doc it actually affects **before** considering the change done:

- **A status change** (a bug fixed, a feature landed, a test account added, something reverted, a decision made) → update `docs/HANDOFF.md` (§2 status, §5 test accounts, §6 what's left, as applicable).
- **An architectural change** (new module, new pattern, a design decision with a real "why" behind it) → update the relevant `docs/BACKEND_ARCHITECTURE.md` / `docs/FRONTEND_ARCHITECTURE.md` / `docs/SYSTEM_ARCHITECTURE.md`.
- **A real bug found and fixed** (especially a non-obvious one) → worth its own callout in the relevant architecture doc's testing/cross-cutting section, matching the "found a real bug" narrative style already used throughout those docs — these callouts are some of the most valuable parts of the documentation, more useful to a future reader than the happy-path description around them.

Don't wait to be asked — do this proactively, as part of finishing the change, not as a separate follow-up task. Docs that quietly drift out of sync with the code are worse than no docs at all, because they actively mislead the next person (human or AI) who trusts them instead of just staying silent. If you're unsure whether a change is "worth remembering," err on the side of updating.

## Two independent repos, not a monorepo

`vmmc-backend` and `vmmc-frontend` each own their own `package.json`, `node_modules`, and unit tests — this root's own `package.json` exists only to (a) run both dev servers with one command (`npm run dev`) and (b) hold the consolidated `e2e/` suite (`npm run test:e2e`), which is the one thing that legitimately spans both repos. Don't add cross-repo imports or shared source code between them — the only real contract between them is the REST API.
