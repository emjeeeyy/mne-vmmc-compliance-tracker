# HANDOFF — VMMC TB DOTS Health Management System

**Purpose of this file:** a snapshot of *where things stand right now*, for the team picking this up cold or resuming after a break. Unlike its sibling docs in this folder, this file is expected to go stale — treat it as a checkpoint, not permanent documentation. Update it (or just rewrite it) the next time there's a meaningful state change worth handing off. (This should happen automatically — see §9.)

Last updated: 2026-08-17.

---

## 1 · What this is

A capstone project: a TB DOTS (Directly Observed Treatment, Short-course) pulmonary compliance tracking system for a hospital. Two independent repos — `vmmc backend` (NestJS + Supabase) and `vmmc frontend` (Next.js) — talking over a REST API, no shared code, no monorepo tooling.

**Read [`SYSTEM_ARCHITECTURE.md`](SYSTEM_ARCHITECTURE.md) first** if you want to actually understand the system. This file is only about current status and how to get moving.

## 2 · Current status: feature-complete, in polish/iteration mode

The original 12-phase build plan (`VMMC_TBDOTS_BuildSpec.md`) is done — every phase shipped, verified live (curl + Playwright), no known mock data left unflagged. Since then there have been six follow-up passes closing gaps, fixing real bugs found by actually using the app, and building out proper testing infrastructure (see `docs/SYSTEM_ARCHITECTURE.md` §7 for the full history). Nothing is mid-implementation right now — the repo is in a stable, working state. See §6 for what's actually left to do.

## 3 · Run it

```bash
# from the repo root — boots both, one command
npm install   # first time only
npm run dev
```

- Frontend: **http://localhost:3000**
- Backend API: **http://localhost:8443/api** (Swagger at `/api/docs`)

`.env` in `vmmc backend` needs real Supabase project values (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`) — ask whoever has them if you don't. `.env.local` in `vmmc frontend` needs nothing but the default `NEXT_PUBLIC_API_URL` (already points at localhost:8443).

Two custom commands exist for this exact workflow: **`/dev-restart`** (kill stale servers, restart both, health-check) and **`/verify`** (typecheck + unit tests + e2e, both repos).

## 4 · Run the tests

Three layers, two of them per-repo and one consolidated:

```bash
cd "vmmc backend" && npm test    # Jest, 51 unit tests
cd "vmmc frontend" && npm test   # Vitest, pure src/lib/* logic only (no jsdom/rendering)
npm run test:e2e                 # from the repo root — Playwright, e2e/api/ + e2e/ui/, both repos
```

`npm run test:e2e` boots (or reuses, if already running) both dev servers itself — no manual setup needed. See `SYSTEM_ARCHITECTURE.md` §2 for how these three fit together.

## 5 · Test accounts

Real, working accounts (not the fictional `@vmmc.gov.ph` seed data — these use real inboxes, so password-reset/OTP email testing actually works end to end):

| Role | Employee ID | Login email | Password |
|---|---|---|---|
| Staff (Radiologist) | `VMMC-25-0021` | mjlor1126@gmail.com | `asd123` |
| Admin | `VMMC-25-0022` | markjoseph.arambulo.cics@ust.edu.ph | `asd123` |
| Unit Head (Dietary Unit Supervisor) | `VMMC-25-0023` | emjeeyy.arambulo@gmail.com | `asd123` |

Login uses **Employee ID**, not email — the email is only the underlying Supabase Auth identity. The Unit Head account logs in via the **Staff** portal tab, not Admin — `UNIT_HEAD` and `STAFF` share the staff portal (`PORTAL_ROLES.staff`), only `ADMIN` uses the admin one; the department-scoped Staff Registry vs. the own-record view is what actually distinguishes STAFF from UNIT_HEAD once logged in. Plus ~20 fictional demo employees from the original seed (`vmmc backend/supabase/seed.sql`) sharing whatever `SEED_DEMO_PASSWORD` is set to in `.env` — those can't receive real email/SMS.

## 6 · What's left — next steps for whoever picks this up

**Known gaps in what's already built** (flagged on purpose, not bugs to "discover"):
- **Admin Profile's "Two-Factor Authentication" toggle is decorative.** Pure `useState` in `Profile.tsx`, no backend, resets on reload. It isn't in either the original Figma spec or the buildspec — it was left inert rather than inventing a real 2FA-on-login feature nobody asked for. If real 2FA is wanted, that's new scope to define first (what should it actually challenge — TOTP? SMS code post-login?).
- **Office Phone on Account Settings doesn't survive a page reload.** `PATCH /me/profile` saves it, but `GET /me/profile` doesn't select `phone` from the DB, so a fresh load always shows it blank. Small, known, unfixed.
- **`VMMC_TBDOTS_BuildSpec.md`** (repo root) is left as a historical record of the original plan — intentionally *not* updated to reflect post-launch changes. `docs/SYSTEM_ARCHITECTURE.md` is the current source of truth.

**Not built yet:**
- **Desktop signup + first-login password change flow is working end to end.** The API understands employee-ID signup, creates the user with the default password `password123`, and marks the employee's record with a `must_change_password` flag so the UI forces a reset on first login. The desktop screens are built and verified; the mobile version remains intentionally deferred.
- **No CI/CD.** The `e2e/` suite and both repos' unit tests exist and pass, but nothing runs them automatically on push/PR — there's no GitHub Actions workflow (or equivalent) yet. Worth setting up once the repo is actually pushed to GitHub (see the root `.gitignore`/repo-hygiene work — §7).
- **No deployment.** This runs locally only. Hosting, environment/secrets management, and a real domain were explicitly out of scope per the original buildspec — revisit if/when this needs to go live somewhere real.

If you pick up any of these, update this section (delete the item, or move it to "known gaps" if you decide not to finish it) — don't let it silently go stale.

## 7 · Where the deep documentation lives

Right here in `docs/`, alongside this file (this was previously split across both repos):

- [`SYSTEM_ARCHITECTURE.md`](SYSTEM_ARCHITECTURE.md) — whole-system view, start here
- [`BACKEND_ARCHITECTURE.md`](BACKEND_ARCHITECTURE.md) — NestJS/Supabase API, the M&E engine, RBAC
- [`FRONTEND_ARCHITECTURE.md`](FRONTEND_ARCHITECTURE.md) — Next.js UI, styling convention, component patterns

`vmmc frontend/AGENTS.md`/`CLAUDE.md` (plus `FRONTEND_STANDARDS.md`, its visual/interaction conventions rulebook) stayed where they are — that's "how to work in this specific repo" reference, not a system-level doc. `vmmc backend` has no separate `AGENTS.md`; its equivalent guidance lives directly in `BACKEND_ARCHITECTURE.md`. The repo **root** now has its own [`AGENTS.md`](../AGENTS.md)/`CLAUDE.md` too — repo-wide conventions that apply regardless of which half you're working in, including §9 below.

## 8 · If you're an AI assistant picking this up

Read the root [`AGENTS.md`](../AGENTS.md), [`SYSTEM_ARCHITECTURE.md`](SYSTEM_ARCHITECTURE.md) §7 (phase history), and this file before doing anything. `vmmc frontend` additionally has its own `AGENTS.md`/`CLAUDE.md` with repo-specific conventions — `FRONTEND_STANDARDS.md` in particular has hard-won gotchas (styling convention, responsive breakpoint traps, Playwright locator quirks) that will waste real time to rediscover if skipped.

## 9 · Keeping this documentation current

This isn't optional, and it isn't just for AI assistants: **after any change worth remembering — a bug fix, a new feature, a reverted experiment, a new test account, a config change — update whichever of these docs it actually affects before considering the change done.** That usually means this file (current status, next steps, test accounts) and, if the change is architectural rather than a status update, the relevant `docs/*_ARCHITECTURE.md` too. See the root `AGENTS.md` for the full rule. The alternative — docs that quietly drift from what the code actually does — is worse than no docs at all, because they actively mislead instead of just being silent.
