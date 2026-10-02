# HANDOFF — VMMC TB DOTS Health Management System

**Purpose of this file:** a snapshot of *where things stand right now*, for the team picking this up cold or resuming after a break. Unlike its sibling docs in this folder, this file is expected to go stale — treat it as a checkpoint, not permanent documentation. Update it (or just rewrite it) the next time there's a meaningful state change worth handing off. (This should happen automatically — see §9.)

Last updated: 2026-10-01.

---

## 1 · What this is

A capstone project: a TB DOTS (Directly Observed Treatment, Short-course) pulmonary compliance tracking system for a hospital. Two independent repos — `vmmc-backend` (NestJS + Supabase) and `vmmc-frontend` (Next.js) — talking over a REST API, no shared code, no monorepo tooling.

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

`.env` in `vmmc-backend` needs real Supabase project values (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`) — ask whoever has them if you don't. `.env.local` in `vmmc-frontend` needs nothing but the default `NEXT_PUBLIC_API_URL` (already points at localhost:8443).

Two custom commands exist for this exact workflow: **`/dev-restart`** (kill stale servers, restart both, health-check) and **`/verify`** (typecheck + unit tests + e2e, both repos).

## 4 · Run the tests

Three layers, two of them per-repo and one consolidated:

```bash
cd "vmmc-backend" && npm test    # Jest, 63 unit tests
cd "vmmc-frontend" && npm test   # Vitest, pure src/lib/* logic only (no jsdom/rendering)
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

Login uses **Employee ID**, not email — the email is only the underlying Supabase Auth identity. The Unit Head account logs in via the **Staff** portal tab, not Admin — `UNIT_HEAD` and `STAFF` share the staff portal (`PORTAL_ROLES.staff`), only `ADMIN` uses the admin one; the department-scoped Staff Registry vs. the own-record view is what actually distinguishes STAFF from UNIT_HEAD once logged in. Plus ~20 fictional demo employees from the original seed (`vmmc-backend/supabase/seed.sql`) sharing whatever `SEED_DEMO_PASSWORD` is set to in `.env` — those can't receive real email/SMS.

## 6 · What's left — next steps for whoever picks this up

**Known gaps in what's already built** (flagged on purpose, not bugs to "discover"):
- **Admin Profile's "Two-Factor Authentication" toggle is decorative.** Pure `useState` in `Profile.tsx`, no backend, resets on reload. It isn't in either the original Figma spec or the buildspec — it was left inert rather than inventing a real 2FA-on-login feature nobody asked for. If real 2FA is wanted, that's new scope to define first (what should it actually challenge — TOTP? SMS code post-login?).
- **Office Phone on Account Settings doesn't survive a page reload.** `PATCH /me/profile` saves it, but `GET /me/profile` doesn't select `phone` from the DB, so a fresh load always shows it blank. Small, known, unfixed.
- **`VMMC_TBDOTS_BuildSpec.md`** (repo root) is left as a historical record of the original plan — intentionally *not* updated to reflect post-launch changes. `docs/SYSTEM_ARCHITECTURE.md` is the current source of truth.
- **Signup + first-login password change is built for both desktop and mobile, and genuinely verified end to end — but not yet on `main`.** It arrived via a groupmate's fork (`login_update` branch), merged locally onto `merge-login-update` and fixed there. Three real bugs were found and fixed across two passes — see `SYSTEM_ARCHITECTURE.md` §7 (seventh and eighth passes) and `BACKEND_ARCHITECTURE.md` §9: a TS type error, `employees.must_change_password` missing its migration (`supabase/migrations/20260928000000_must_change_password.sql`), and — the most serious one — `useAuthGuard('auth')` on the `/first-login` page redirected to itself and never rendered, so **the entire first-login flow was a permanent blank screen for any real user hitting it**, undetected because no e2e test exercised it. Full `/verify` sweep is green on that branch, but it's still uncommitted/unmerged pending review.
- **Document access is now genuinely restricted to dept head / TB DOTS staff / HR / ADMIN**, per Aug 31 feedback — previously any STAFF member could see their own department's documents, which was broader than asked. See `BACKEND_ARCHITECTURE.md` §4. `supabase/migrations/20260929000000_add_tbdots_department.sql` (adds a `TB DOTS Program` / `TBDOTS` department) has been applied and verified live — no existing employees are assigned to it yet, that's a real staffing decision left for whoever actually runs the program.
- **"Change request tracker" (Aug 31 feedback) is built and verified live end to end.** `job_title`, `birth_date`, `employment_status`, and `department` now go through a request-and-approve workflow instead of a direct edit — a real gap before this, since `PATCH /me/profile` only ever covered `fullName`/`email`/`phone`, and `birth_date` drives the whole SLA cycle-date calculation with no prior way to fix a wrong one. See `BACKEND_ARCHITECTURE.md` §4 (new `change-requests` module) and `FRONTEND_ARCHITECTURE.md` §6 for a real desktop-navigation gotcha hit while wiring up the UI. `supabase/migrations/20260930000000_change_requests.sql` has been applied and verified live — submitted a real request, approved it, confirmed the employee record actually changed; submitted and rejected a second one, confirmed it didn't.
- **The desktop top header is streamlined per Aug 31 feedback** ("reduce the upperboard... streamline as compact welcome bar"). The literal quoted phrase in that feedback ("protecting those who care") doesn't correspond to any existing text anywhere in the codebase — read instead as a suggested tagline, not a location to find, and interpreted as pointing at `Layout.tsx`'s persistent top bar, the one "upper board" present on every screen. Height trimmed 68px→60px; the right-side "Veterans Memorial Medical Center / Admin Management Portal" block (pure duplication of context already shown in the left branding and the profile pill's own role label) replaced with a compact "Welcome back, {first name}" greeting; the left branding collapsed from two lines to one. See `SYSTEM_ARCHITECTURE.md` §7 for the reasoning. If this interpretation turns out to be wrong once the actual adviser intent is confirmed, the change is isolated to one `<header>` block in `Layout.tsx` and easy to revisit.
- **PII Information Index (Aug 31 feedback) is built as a real on-screen table, not just a CSV export.** New `PiiIndex.tsx` screen + `/pii-index` route, reachable from a new 5th admin nav item (desktop sidebar and mobile bottom tab), ADMIN-only end to end — the backend endpoint (`GET /reports/pii-index`) rejects everyone else with a 403, and the frontend shows a restricted-access message instead of even calling it for non-admins. Table: Employee ID, Full Name, Department, Job Title, Email, Phone, Birth Date, and Employment Type (COS/Permanent, derived from the employee ID format, not a stored column) — searchable, with CSV export as a bonus on top of the on-screen view. See `BACKEND_ARCHITECTURE.md` §4 for why this report is ADMIN-only when the other three allow UNIT_HEAD too.
- **STAFF's own "My Compliance Record" is now one unified dashboard panel, not a small card in an otherwise-empty grid.** Replaced on both desktop and mobile in `Compliance.tsx` (`MyComplianceDashboard` / `MyComplianceDashboardMobile`) — header with status pill, a 4-stat row, an Annual Cycle Progress bar (computed client-side from real `examDate`/`dueDate`, not a stored field), and View PDF / Upload New Result actions. Verified live against the real `VMMC-25-0021` staff account, WCAG-passed (12px text floor, 44px tap targets measured via Playwright, not eyeballed), and the PDF-modal/Upload-navigation actions both confirmed working. See `FRONTEND_ARCHITECTURE.md` §7 for a real data quirk this surfaced (a record can be "Compliant This Cycle" while its next requirement shows as overdue — that's the monitoring engine not having reclassified it yet, not a UI bug). UNIT_HEAD/ADMIN's staff-directory card grid is untouched.
- **Document rejection now actually notifies the employee — it used to be completely silent.** Found while auditing every real email `EmailChannel` sends: `DocumentsService.review()`'s reject branch updated the DB and returned, with no event, no in-app notification, nothing — the employee only found out by re-checking their own upload history. Fixed with a new `DOCUMENT_REJECTED` event (`WARNING`-tier, message embeds the real rejection reason), following the same `emitOther()` pattern PEP/Immunization events already use. Verified live: rejected a real pending document via the actual API, confirmed the event row and all three notification rows (`IN_APP` sent, `SMS` logged via dev fallback, `EMAIL` genuinely sent via Gmail SMTP) — then restored the document to `PENDING` and cleaned up the test notification rows (the `events` row itself is permanent — that table is append-only by DB constraint, by design). See `BACKEND_ARCHITECTURE.md` §8.
- **`THREE_MONTH_HR_NOTICE` bumped from `WARNING` to `EXCEPTION`.** It was sharing the same low-priority visual/dispatch tier as "your window just opened" despite being the most severe state in the timeline dimension (90+ days non-compliant) — bumping it means it now also opens an escalation like `SLA_BREACH`/`CLINICAL_ALERT` do, so admins actually see it in the escalations queue instead of it only reaching the employee's own inbox. Its copy was also rewritten in second person — the old text ("HR notice: this employee has remained non-compliant...") was addressed to HR but the system only ever emails the employee, so they'd have received an email talking about them in third person. See `BACKEND_ARCHITECTURE.md` §5.4.
- **Every real email this system sends is now a designed HTML email, not plain text.** `vmmc-backend/src/notifications/email-templates/` (new folder — deliberately backend-only, since email is sent server-side via `nodemailer` and the two repos share no source code). `EmailChannel.send()` grew an optional `html` 4th param; `AuthService.forgotPassword()` and `NotificationDispatcherService.dispatchOne()` both now build `{ subject, html, text }` via `buildOtpEmail()`/`buildEventEmail()` instead of a hardcoded string. Started as 12 standalone mockups (`vmmc-frontend/_scratch/email-templates.html` — since deleted now that the design is implemented for real; see `PROGRESS_REPORT_2.md` Part N for what they looked like) — 9 of those 12 are wired to real sends (OTP + the 8 M&E subtypes that actually email + document rejection); the other 2 (`WINDOW_OPENED`/`CLEARANCE_RECORDED`) stay in-app-only by design, so their mockups were never converted to code. Fixed a real pre-existing gap along the way: every M&E email used to share one identical subject line regardless of what happened — now each event subtype gets its own. See `BACKEND_ARCHITECTURE.md` §6 for the full breakdown. Verified live against the real running backend (not just typechecked): a real OTP email request and two real document-rejection emails, both confirmed via the `notifications` table with genuine Gmail SMTP message IDs, not just a 200 response.

**Not built yet:**
- **No CI/CD.** The `e2e/` suite and both repos' unit tests exist and pass, but nothing runs them automatically on push/PR — there's no GitHub Actions workflow (or equivalent) yet. Worth setting up once the repo is actually pushed to GitHub (see the root `.gitignore`/repo-hygiene work — §7).
- **No deployment.** This runs locally only. Hosting, environment/secrets management, and a real domain were explicitly out of scope per the original buildspec — revisit if/when this needs to go live somewhere real.

If you pick up any of these, update this section (delete the item, or move it to "known gaps" if you decide not to finish it) — don't let it silently go stale.

## 7 · Where the deep documentation lives

Right here in `docs/`, alongside this file (this was previously split across both repos):

- [`SYSTEM_ARCHITECTURE.md`](SYSTEM_ARCHITECTURE.md) — whole-system view, start here
- [`BACKEND_ARCHITECTURE.md`](BACKEND_ARCHITECTURE.md) — NestJS/Supabase API, the M&E engine, RBAC
- [`FRONTEND_ARCHITECTURE.md`](FRONTEND_ARCHITECTURE.md) — Next.js UI, styling convention, component patterns

`vmmc-frontend/AGENTS.md`/`CLAUDE.md` (plus `FRONTEND_STANDARDS.md`, its visual/interaction conventions rulebook) stayed where they are — that's "how to work in this specific repo" reference, not a system-level doc. `vmmc-backend` has no separate `AGENTS.md`; its equivalent guidance lives directly in `BACKEND_ARCHITECTURE.md`. The repo **root** now has its own [`AGENTS.md`](../AGENTS.md)/`CLAUDE.md` too — repo-wide conventions that apply regardless of which half you're working in, including §9 below.

## 8 · If you're an AI assistant picking this up

Read the root [`AGENTS.md`](../AGENTS.md), [`SYSTEM_ARCHITECTURE.md`](SYSTEM_ARCHITECTURE.md) §7 (phase history), and this file before doing anything. `vmmc-frontend` additionally has its own `AGENTS.md`/`CLAUDE.md` with repo-specific conventions — `FRONTEND_STANDARDS.md` in particular has hard-won gotchas (styling convention, responsive breakpoint traps, Playwright locator quirks) that will waste real time to rediscover if skipped.

## 9 · Keeping this documentation current

This isn't optional, and it isn't just for AI assistants: **after any change worth remembering — a bug fix, a new feature, a reverted experiment, a new test account, a config change — update whichever of these docs it actually affects before considering the change done.** That usually means this file (current status, next steps, test accounts) and, if the change is architectural rather than a status update, the relevant `docs/*_ARCHITECTURE.md` too. See the root `AGENTS.md` for the full rule. The alternative — docs that quietly drift from what the code actually does — is worse than no docs at all, because they actively mislead instead of just being silent.
