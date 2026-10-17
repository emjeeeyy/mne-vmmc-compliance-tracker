# Progress Report 3

**Date:** 2026-10-02 (session continues through 2026-10-06, work below covers through today)
**Branch:** `main` (unlike Progress Report 2, this work is being committed and pushed as it lands — see Part C for why that changed)

This file picks up exactly where `docs/PROGRESS_REPORT_2.md` was told to stop — the user ended that file's logging practice ("now stop updating the progress report 2.md and adding screenshots to progress report 2 assets") partway through the session, then asked for a fresh report covering everything from that point forward. Same shape as its predecessor: a running log, not a snapshot, appended to after each phase rather than rewritten — but no screenshots/assets folder this time, since that specific practice is what was asked to stop. Follows the same Attempts / Failures / Progress structure throughout.

---

## Part A — Activity Logs, round 2: bursts of the same action weren't the same action

Direct follow-up to Progress Report 2's Part O (the first accuracy pass). The user came back with "It's still inconsistent."

### Attempts

Pulled the real `/me/activity-logs` feed for the actual test account via `curl` rather than guessing from the earlier screenshot. Found a clear, repeatable pattern: the exact same real page visit was showing up as 2, 3, or even 4 near-identical rows — e.g. one `/me/profile` burst produced 3 "Accessed Profile" entries while `/change-requests/mine` (fired in the same `useEffect`) only produced 1.

### Failures

None in the sense of a broken fix — the failure was in the earlier mental model, not new code. The real issue: HTTP's `GET` is defined as safe and idempotent specifically so it can be repeated without consequence — React 18 Strict Mode deliberately double-invokes a component's mount effects in development for exactly this reason (to catch effects that *aren't* safe to run twice), and a slow connection or a backgrounded tab refocusing can also silently re-trigger the same fetch. None of that is the user doing the same thing twice; it's normal request plumbing. Treating every repetition as its own "activity" is what made the feed read as inconsistent in the first place.

### Progress

Added `dedupeBursts()` to `activity.service.ts`: walks the already-time-sorted rows and collapses consecutive same-`(action, entity_type)` rows into one — keeping the most recent — whenever the gap between them is under 3 seconds (every real burst observed live lands well under 1 second, so this has margin without risking merging two genuinely separate visits minutes apart). 7 new unit tests (`activity.service.spec.ts`) covering the exact burst shape seen live, two genuinely separate visits staying separate, different entity types in the same burst both surviving, a failed-then-successful login never merging regardless of how close together, and a slow-drifting burst where no single gap exceeds the window but the total span does.

Re-verified live against the same messy real account history that exposed the bug: the 4-row Profile-visit bursts now surface as exactly one "Accessed Profile" and one "Accessed Change Request" per visit, while the genuinely distinct failed-then-successful login sequence from earlier testing stayed intact as separate rows, not merged away. Full sweep after: 75/75 backend unit, 19/19 frontend unit, 16/16 e2e.

---

## Part B — Activity Logs, round 3: a background fetch isn't "touching" a feature

The user reported something very specific: *"when i clicked the home dashboard the top says it's the profile then it say i accessed the change request even though I haven't touched it."*

### Attempts

Traced it directly: `Profile.tsx` fires `refreshMyChangeRequests()` (`GET /change-requests/mine`) unconditionally in the same mount effect as four other calls already excluded as "noise" in the prior pass — notifications, activity-logs, login-history, privacy-settings. This one call had been given a real label (fixing its vague "Accessed Record" text) in the prior pass, but never actually questioned whether it should appear in the feed at all.

### Failures

Tracing this turned up a second, more serious problem in the existing filter: `NOISE_ENTITY_TYPES` excluded an entity type **unconditionally**, regardless of `action`. That silently hid two genuine, deliberate user actions the whole time: removing a registered device (`DELETE /me/devices/:id`) and toggling a data-privacy setting (`PATCH /me/privacy-settings`) — both real clicks, both on entity types that were in the noise set for their *incidental* `ACCESS` rows, but the blanket exclusion swallowed their real mutations too.

### Progress

Renamed to `NOISE_ACCESS_ENTITY_TYPES` and gated the whole filter on `action === 'ACCESS'` (`isNoise()`) — nothing in this app ever mutates on its own, every `CREATE`/`UPDATE`/`DELETE` is the direct result of a user clicking something, so those stay visible regardless of entity type. Added `change-requests` to the now-correctly-scoped set. 4 new unit tests specifically covering the distinction this bug turned on: suppress `ACCESS` on the noise types, never suppress a mutation on those same types, never suppress a real page visit like `me-profile`/`dashboard`, never suppress `LOGIN`/`LOGIN_FAILED`/`ACCESS_DENIED`.

Re-verified live by replaying the exact reported scenario — hit `/me/profile`, `/change-requests/mine`, and `/dashboard/overview` back to back, as one real Profile-then-Dashboard session would — and confirmed "Accessed Change Request" no longer appears while "Accessed Profile" and "Accessed Home Dashboard" still do. Docs updated: `BACKEND_ARCHITECTURE.md` (§4, bug-narrative continuation), `HANDOFF.md`, `SYSTEM_ARCHITECTURE.md` (two pass entries that had fallen behind, caught up in the same pass after the user directly asked "are you updating the docs?").

---

## Part C — Pushing everything to GitHub `main`

Up to this point, every substantial feature built this session (the login/signup merge fixes, change requests, PII index, the compliance dashboard redesign, the email system, all of the Activity Logs work above) was sitting uncommitted in the local working tree, or on a local-only branch never pushed to GitHub. The user asked directly: *"I want you to push the changes that we only made to the main branch of this repo."*

### Attempts

Checked `git remote -v` first — `origin` was already set to exactly the repo named, no setup needed. `git status --short` turned up 39 changed/untracked files, and `git log` showed only one real commit beyond `main` (`1a0b47e`, the groupmate's original login_update merge) — meaning essentially this entire session's work was still uncommitted.

Given the scale and that this would land directly on `main` with no PR/review step, confirmed two things explicitly before touching anything: whether `docs/PROGRESS_REPORT_2.md` (untracked, and the user had just said to stop updating it) should be included in the push, and whether a direct push to `main` was really wanted over opening a PR. User chose to include the progress report and push directly.

### Failures

None in the push itself — reviewed the full `git status --short` output first specifically to check for anything that looked like a secret (`.env` files, credentials) before staging; found nothing, confirmed `.gitignore` already excludes `.env`/`node_modules`/`_scratch`.

### Progress

Staged everything, wrote one comprehensive commit (`7fcab65`, 68 files, +3281/−509) covering the full scope — login/signup fixes, document-access restriction, change-requests module, PII index, document-rejection notifications, the real HTML email system, the compliance dashboard redesign, and the Activity Logs fixes from Parts A–B above. Fetched `origin` first to confirm `main` hadn't diverged (it hadn't — still just the initial commit), fast-forwarded local `main` to include both that new commit and the pre-existing `1a0b47e`, pushed. Confirmed via a fresh `git fetch` that `origin/main` landed exactly as pushed.

This is also the point where the working convention for the rest of this report changed: everything from here on gets committed and pushed as it's verified, rather than accumulating in the working tree — which is why this file's branch line (top of document) says `main`, not a local-only branch like Progress Report 2's did.

---

## Part D — Deploying to Vercel + Railway, and four real bugs only a live deployment could surface

The user asked for a deployment recommendation (Vercel for the Next.js frontend, Railway for the NestJS backend — chosen specifically because this backend has a real `@Cron` job that needs a persistent process, which rules out a serverless target), then worked through the actual deploys live, hitting four distinct real failures along the way.

### Attempts & Failures (interleaved — each bug was found, not anticipated)

**Bug 1 — Vercel rejected the deploy outright: a space in the folder name.** `"A Serverless Function has an invalid name: 'vmmc frontend/___next_launcher.cjs' ... must not contain any space."` Vercel derives its serverless function name directly from the project's directory path, and this repo's top-level folders were literally named `vmmc frontend` / `vmmc backend` — fine for local dev and git, fatal for Vercel. No per-project override exists for this.

Fix required a real repo-wide rename (`vmmc frontend` → `vmmc-frontend`, `vmmc backend` → `vmmc-backend`), confirmed and scoped before touching anything: `git mv` on both folders (preserving history as proper renames, not delete+add), plus updating every reference — root `package.json`'s dev script, `playwright.config.ts`, `AGENTS.md`, every doc, `.claude/commands/`, `.gitignore`, `.env.example` comments. Deliberately left `docs/PROGRESS_REPORT_2.md` and `VMMC_TBDOTS_BuildSpec.md` untouched — both already-frozen historical records. Hit a real snag mid-rename: `git mv` failed with "Permission denied" because the running dev-server process tree (`npm run dev` → `concurrently` → `nest start --watch`) still had file handles open inside the old folder — the obvious top-level PIDs had already been killed, but `Get-CimInstance Win32_Process` revealed a deeper surviving process tree underneath. Killed the full tree, retried, succeeded. Verified: backend (75/75) and frontend (19/19) unit tests both pass under the new paths, full 16/16 e2e passes booting both servers fresh via the renamed `--prefix` commands, and a real local `next build` succeeds cleanly. Pushed as `1374dc2` (211 files, almost all pure renames).

**Bug 2 — a Next.js config warning, fixed in the same pass, that wasn't actually the deploy-breaker but was a real problem anyway.** `next.config.ts` unconditionally forced `turbopack.root` to silence a *local-only* warning (the repo's root-level `package.json`, added for the `npm run dev` convenience script, makes Next mistake this for a monorepo). On Vercel, that forced value fought with Vercel's own auto-detected `outputFileTracingRoot`, logged as "Both 'outputFileTracingRoot' and 'turbopack.root' are set." Fixed by only applying the override when `process.env.VERCEL` isn't set (a standard Vercel-provided build-time variable) — local behavior unchanged, Vercel's own detection wins there instead of being fought.

**Bug 3 — the real cause of every Railway request 500ing, and a wrong first guess shipped before the right one.** Once Vercel was fixed, Railway deploys started failing too — initially misdiagnosed as an Nx-workspace detection problem (fixed by setting Railway's Root Directory to `vmmc-backend`, a real and necessary fix, but not the one that mattered most). After that, the backend built and showed "Active," but login failed with "Connection is slow or unavailable" — and critically, `/api/health`, which has no DB/auth dependency of its own, was 500ing too, which was the tell that this wasn't a CORS-config or wrong-URL problem on the frontend side, but the backend broken outright.

First hypothesis: `ThrottlerGuard` (a global guard, runs on every request including health) couldn't resolve a real client IP behind Railway's reverse proxy. Plausible, genuinely worth fixing (`app.set('trust proxy', 1)`, pushed as `14293df`) — but shipping it and re-checking live proved it **wasn't** the actual cause; health still 500'd identically. Went to Railway's actual deploy logs (not the sanitized client-facing error) and found the real exception: `TypeError [ERR_INVALID_CHAR]: Invalid character in header content ["Access-Control-Allow-Origin"]`. `CORS_ORIGIN` had a trailing newline in it, almost certainly from pasting the Vercel URL into Railway's multi-line-textarea env var field — Node's `http` module rejects any header value containing a line break outright, and since `app.enableCors()` tries to set that header on every single response, this crashed literally everything, including a bare `curl` to `/api/health` with no CORS-relevant headers at all.

Re-typing the value directly in Railway's dashboard reproduced the exact same crash **twice** — so the fix doesn't rely on the env var being clean: `.trim()` on `CORS_ORIGIN` in `main.ts`, and on `NEXT_PUBLIC_API_URL` in both places the frontend reads it (the identical trailing-newline tell was visible in that Vercel field too). Verified by actually reproducing the bug locally before trusting the fix: restarted the backend with `CORS_ORIGIN` deliberately poisoned with a trailing `\n` — confirmed it crashed the same way, then confirmed a clean `200` with a correctly-set header after the fix. Pushed as `b954797`. Re-verified against the real deployed Railway backend once live: `/api/health` returns `200`, and a real login from the real Vercel origin returns a genuine JWT and real user data.

**Bug 4 — found live on the deployed Signup screen: a malformed Employee ID showed "Internal server error" instead of a real validation message.** `validateEmployeeId()` (`assert-access.ts`) already had the exact right message for this case — `"Permanent employee ID must match VMMC-YY-NNNN."` — but threw it as a plain `Error`, not a NestJS `HttpException`. `AllExceptionsFilter` deliberately sanitizes any non-`HttpException` down to a generic 500 (a real security boundary against leaking stack traces on genuinely unexpected crashes), which meant this function's own correct, specific message never reached the user. Fixed by switching all three throws to `BadRequestException` — the only change needed, since the filter already handles a real `HttpException` correctly. Verified live: the exact reported input (an email address typed into the Employee ID field) now returns a real `400` with the actual message. Pushed as `df3a41e`.

### Progress

All four fixes live and verified against the real deployed infrastructure, not just locally. Full sweep clean after each. Docs updated throughout — `HANDOFF.md`'s stale "No deployment, runs locally only" claim replaced with the real status, and `BACKEND_ARCHITECTURE.md`'s bug-narrative section extended with entries eight through ten covering all of the above (continuing the same numbering convention the file already used for earlier real-bug callouts).

---

## Part E — Real email-based 2FA on login

Grew out of a direct question: *"How does our 2fa work? it seems like its not applied yet."* Correct — the Profile toggle was pure decorative `useState`, no backend, didn't even survive a page reload. Walked through several rounds of design questions before being asked to build it for real: whether to reuse the forgot-password OTP table (no — different trust context, kept separate), whether it needed its own email template (yes — reusing the password-reset copy verbatim would tell someone who just logged in normally "we received a request to reset your password," which is wrong and alarming), and how to actually verify something like this is safe (a concrete checklist: unpredictable generation, can't be brute-forced in time, can't be read from a DB leak, can't be replayed, can't outlive its expiry, enforced server-side not just in the UI, no information leakage on failure).

### Attempts

Full implementation, in order:
- **Migration** (`20261005000000_login_2fa.sql`): new `login_otps` table — separate from `password_reset_otps` on purpose, same proven generation mechanics (`crypto.randomInt`, bcrypt-hashed, 10-minute expiry) — plus `employees.two_factor_enabled` (opt-in, defaults `false`, so no existing account's behavior changes silently). The table also stores `access_token`/`token_expires_at`: the real design problem this flow has to solve is that `signInWithPassword()` already mints a real Supabase session the moment the password checks out, but there's no password left to re-check in the second step (only `employeeId`/`portal`/`otp`) — so that already-issued session has to be stashed somewhere and only handed back once the code is confirmed, which is what actually makes this a second *factor* rather than a second password prompt.
- **Backend**: refactored `AuthService.login()` so a `finishLogin()` helper (the real `LOGIN` audit-log + device-record + session-response step) is only ever reached once authentication has *genuinely* finished — either immediately (2FA off) or after `verifyLoginOtp()` succeeds. `issueLoginOtp()` stashes the session and emails the code via a new `buildLoginOtpEmail()` template (own subject, own copy, including a "wasn't you? change your password immediately" warning line). `verifyLoginOtp()` checks expiry and a 5-attempt lockout (`attempt_count`, checked *before* the hash compare, so a locked-out guess never gets a real pass/fail verdict) before the `bcrypt.compare()`. New endpoints: `POST /auth/verify-login-otp`, `PATCH /me/security/two-factor`. `EmployeeContext` extended with `twoFactorEnabled` so it's available on every authenticated request via the existing guard, with zero new round trips.
- **Frontend**: `Login.tsx` grows an `mfaStep` — on `{ mfaRequired: true }` from `/auth/login`, swaps the normal form for a 6-digit code entry step (both mobile and desktop trees) instead of navigating away; `Profile.tsx`'s toggle now reads the real value from `GET /me/profile` and writes it via `PATCH /me/security/two-factor` with an optimistic update that reverts on failure.

### Failures

Two real TypeScript errors caught by the compiler before they became runtime problems: Supabase's `Session.expires_at` is typed `number | undefined` (not guaranteed present), which an initial `SessionLike` interface didn't account for — fixed by making the field optional to match, plus an explicit runtime guard in `issueLoginOtp()` so a missing value fails with a clear message instead of an opaque `NOT NULL` constraint violation from the insert. A pre-existing mock `EmployeeContext` fixture in `documents.service.spec.ts` was missing the new `twoFactorEnabled` field, caught the same way.

No logic bugs found during live testing — every property tested passed on the first real attempt, which is itself worth being honest about rather than implying problems that weren't there.

### Progress

**The migration had to be applied by the user** (no Supabase CLI/direct DB access in this environment, same constraint as every previous migration this session) — confirmed via a deliberate test first: ran the full e2e suite *before* the migration landed and watched 11 of 16 tests fail exactly as predicted (every login-dependent one), because the code now queried a column that didn't exist yet. Not a bug — the expected state until the required migration ran. Re-ran after the user confirmed it was applied: 16/16 again.

Then verified every safety property live against the real database, each one directly via `curl` (bypassing the UI entirely) rather than trusting the code by inspection:
- Enabled 2FA on the real test account, confirmed plain login now returns `{ mfaRequired: true }` instead of a session, confirmed a real `login_otps` row with a genuine stashed Supabase JWT.
- Wrong code → `400`, confirmed `attempt_count` actually incremented in the database.
- Four more wrong attempts → confirmed lockout fires exactly on the 6th attempt, regardless of what code is submitted.
- Generated a known test code's bcrypt hash directly (`bcryptjs`, same cost factor) and swapped it into a fresh pending row via the service-role key — since reading the real email inbox isn't possible from this environment, and email *sending* was already proven working extensively earlier in this session. Verified success: correct code returns a full session, **and confirmed the returned `accessToken` genuinely works** by calling `GET /me/profile` with it, not just checking the response shape.
- Replayed the same already-used code → rejected; confirmed via direct DB query that this was the *consumed* row's own exclusion doing its job (its `consumed_at` was correctly set), not a coincidental lockout from an unrelated row.
- Forced a fresh row's `expires_at` into the past, confirmed its genuinely-correct code still gets rejected.
- Built an isolated, precise test specifically to check one subtle property in both directions: with 2FA enabled, confirmed that attempting login (getting `mfaRequired: true` back) does **not** write a `LOGIN` audit entry — using a timestamp marker to prove no new entry appeared, rather than eyeballing a noisy timeline that briefly looked ambiguous.
- Restored the real test account fully afterward: all test `login_otps` rows deleted, `two_factor_enabled` set back to `false`, confirmed plain login works normally again with zero pending rows left.

Full sweep clean throughout: 75/75 backend unit, 19/19 frontend unit, 16/16 e2e. Docs updated — `HANDOFF.md`'s known-gap entry replaced with the real status, `BACKEND_ARCHITECTURE.md` §4 extended with the full design rationale and the live-verification steps above.

**Not yet pushed to `main`** — implemented, verified, and documented, but deliberately held pending the user's explicit go-ahead (asked directly per their standing instruction to confirm before any deploy-affecting push), consistent with how every other change in this report was pushed only after being shown and verified first.

---

## Part F — 2FA's default was backwards: opt-in flipped to opt-out, plus the one gap the curl-based verification in Part E never closed

The user tried logging in locally and reported *"f2a still doesn't work on my end when i try to log in"* — investigation found 2FA was working exactly as built, just disabled, because Part E's migration defaulted `two_factor_enabled` to `false` and the real test account had been restored to that same default after testing. The user's actual objection, once that was explained, was sharper than a bug report: *"Did you turn off 2fa to all? If so every account should be 2fa is turned on unless they log in and turn it off whether its created at first or whatever default should be the 2fa is turned on unless the user turns it off on her/his own."*

### Attempts

Confirmed first that no account had been selectively "turned off" — the `false` default in `20261005000000_login_2fa.sql` applied globally the moment it ran, including every account never touched during Part E's testing; only the one test account had ever been directly manipulated, and only ever restored to that same global default, not singled out. The real issue was the design decision itself: opt-in is the wrong default for a system holding health/PII data. Agreed with the user's correction and wrote a second migration rather than editing the already-applied one, per this project's standing convention — `20261006000000_two_factor_default_on.sql`: `alter column two_factor_enabled set default true`, plus an `update employees set two_factor_enabled = true` to retroactively flip every account that already existed, since changing a column default only ever affects *future* inserts on its own.

### Failures

None in the fix itself. But writing up this part surfaced a real gap in Part E's own verification: every 2FA safety property had been tested via `curl` against the API directly, bypassing the UI entirely — the actual `Login.tsx` "Enter Verification Code" screen had never been driven through a real browser. Worth closing before calling 2FA done, not after.

### Progress

User applied the migration via Supabase's SQL Editor. Verified live, same discipline as the rest of this report — nothing trusted from code inspection alone:
- Queried all 23 real employee rows directly: every one now `two_factor_enabled: true`.
- Inserted a throwaway employee row with the column omitted entirely, confirmed it came back `true` on its own (proving the *column default* changed, not just a one-time backfill), then deleted it.
- Closed the UI gap: wrote a Playwright script driving the real running `Login.tsx` against the real `VMMC-25-0021` account (now 2FA-on by default with no manual toggling needed). Since the real OTP goes to a real inbox this environment can't read, swapped the just-issued `login_otps` row's hash for a known test code via the service-role key (same technique Part E used at the API level) — typed that code into the actual rendered OTP screen, submitted, landed on `/dashboard`. Confirms the frontend step genuinely works, not just the API underneath it. Hit a couple of real Playwright friction points along the way worth a one-line note for next time: this app always renders both its mobile and desktop JSX blocks simultaneously (one hidden via Tailwind class, not unmounted — see `FRONTEND_STANDARDS.md` §6), so a plain text/placeholder locator resolves to 2 elements and needs a `:visible` filter; `Login.tsx`'s Employee ID/Password `<label>`s aren't `htmlFor`-linked to their inputs, so `getByLabel` doesn't work there — placeholder-based locators were used instead.
- Restored state afterward: deleted all 5 `login_otps` rows the test run left behind (4 unconsumed from early selector-debugging failures, 1 consumed from the successful run). The successful run also updated the real `devices` row for the account's actual browser (`last_active` bumped to the test's timestamp, since Playwright's Chromium reports as "Chrome on Windows" — the same bucket `recordDeviceLogin` already uses for the user's real browser) — restored that timestamp using the preceding real `LOGIN` audit-log entry as the source of truth. Left the audit-log entry the test login itself created alone; that table is append-only by design, and editing a security audit trail for test cleanup would be a worse outcome than one harmless extra row in it.

Docs updated: `HANDOFF.md`'s 2FA entry rewritten for the opt-out default and the UI-level verification; `BACKEND_ARCHITECTURE.md` §4 updated the same way, plus a new paragraph on the default-on correction and what closing the UI-verification gap actually involved.

---

## Current status

Everything through Part D is live on `main` and deployed (Vercel + Railway, linked and confirmed working via a real cross-origin login). Parts E and F (real 2FA, now correctly defaulting on) are complete and fully verified — including, as of Part F, through the real browser UI, not just the API — but still sitting locally, one confirmation away from being pushed. No outstanding failures or known-broken state as of this entry.
