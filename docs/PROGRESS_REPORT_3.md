# Progress Report 3

**Date:** 2026-10-02 (session continues through 2026-10-21, work below covers through today)
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

## Part G — Pushing 2FA broke production login outright, and the real cause took three fixes to fully resolve

The user said "Push the recent code now" — Parts E and F (2FA, default-on) went to `main` as `497dff6`. Railway auto-deployed it. Shortly after, the user reported: *"Connection is slow or unavailable. Please try again. This appears in the deployment can you check what's wrong."*

### Attempts

Checked the deployed backend directly rather than guessing from the symptom. `/api/health` responded fine (`200`), ruling out a repeat of the earlier CORS-trailing-newline total-outage bug. A real login attempt against the deployed API, though, timed out outright — no response at all within 20s. A wrong-password attempt on the same account returned a clean `401` in 1.3s, which narrowed the hang to specifically *after* password verification — i.e., somewhere inside the new 2FA code path, not the password check itself (and incidentally confirmed the two 2FA migrations *were* applied to production, since that query path clearly succeeded).

### Failures

**First real bug: the login request was blocking on the OTP email send, and Railway's connection to Gmail SMTP wasn't completing at all.** `issueLoginOtp()` (and, found by testing it directly, the pre-existing `forgotPassword()` — unrelated to 2FA, confirmed to hang identically) both `await`ed `EmailChannel.send()` before returning a response, and nodemailer had no configured timeout, so a stuck SMTP connection could block the HTTP response indefinitely. Not a regression introduced by the 2FA work itself — forgot-password had this exact same latent bug already; 2FA defaulting to on for every account just turned a rarely-hit code path into the one every single login now depends on. Fixed by (a) adding explicit 5–10s timeouts to the nodemailer transport, bounding every email attempt app-wide, and (b) no longer awaiting the email send in either call site — neither used its result, and a login response should never be hostage to a third-party mail server. Verified live: the same login request that previously timed out at 20s+ now returned `{"mfaRequired":true,...}` in under 2 seconds. Pushed as `fc9b024`.

**Second real bug, found immediately after confirming the first fix worked: the OTP email still never arrived.** Login no longer hung, but the user reported no email showed up at all. Asked for Railway's live deploy logs around the attempt (not the sanitized client error) and got a precise answer: `Error: connect ENETUNREACH 2a00:1450:4009:c0f::6c:587`. Root cause: Railway's container reports an IPv6-capable network interface that isn't actually routable to the internet; nodemailer resolves both the A and AAAA records for `smtp.gmail.com` and — per its own source (`lib/shared/index.js`, `formatDNSValue()`) — picks a **random** address from the combined list rather than deterministically preferring IPv4, so roughly every other attempt picked the unreachable IPv6 address and failed outright. Fixed by resolving the SMTP host to a literal IPv4 address ourselves at startup (`dns/promises`' `resolve4()`) and connecting directly to it — bypassing nodemailer's own dual-stack selection — with `tls.servername` set to the real hostname so certificate validation still checks out. Pushed as `98cb866`.

**Third issue, found immediately after the second fix: forcing IPv4 didn't fix delivery either — the error just changed.** The next live deploy-log check showed `Error: Connection timeout` instead of `ENETUNREACH` — meaning the IPv4 connection attempt itself wasn't completing, not a DNS/address-family quirk. Taken together with the first error, this meant Railway's outbound network genuinely cannot reliably reach Gmail's SMTP port at all, which no further low-level nodemailer tuning was going to fix. Raw SMTP from a cloud container is a known-bad pattern for exactly this reason (ports frequently blocked or filtered, independent of the specific platform).

### Progress

Rather than keep iterating on sockets, asked the user how they wanted to handle it (quick stabilization by temporarily defaulting 2FA off again, vs. switching to a real HTTP-based email provider now) — chose to fix it properly. Compared providers against this project's two real constraints (no owned domain, needs to stay free for a capstone's volume): Brevo's 300/day free-forever tier with no-domain single-sender verification was the clear fit over Resend (domain required for real recipients), SendGrid (free tier has trended toward time-limited trials), Mailgun/Postmark (no perpetual free tier), and SES (sandbox approval friction). User confirmed Brevo.

Replaced `EmailChannel` entirely: `nodemailer`'s raw SMTP socket swapped for a plain `fetch()` POST to Brevo's HTTP API (`https://api.brevo.com/v3/smtp/email`) — the exact same shape `SmsChannel` already used for Semaphore, so the whole notification layer is now consistently HTTP-based instead of one channel owning a raw socket. `nodemailer`/`@types/nodemailer` removed as dependencies (confirmed nothing else in the backend imported them first). `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASSWORD` removed from env validation and `.env.example`, replaced with `BREVO_API_KEY`/`EMAIL_FROM`. Verified clean: `tsc --noEmit` passes, all 75 backend unit tests still pass (none exercised `EmailChannel` directly, so nothing needed updating there). Docs updated: `BACKEND_ARCHITECTURE.md` §6 gets the full root-cause writeup (the only place an old "Gmail SMTP" factual claim needed correcting outside frozen historical narrative in `SYSTEM_ARCHITECTURE.md`, which stays as-is since it correctly describes what was true in past passes), `HANDOFF.md` gets a new deployment-bug bullet alongside the Vercel/Railway ones from Part D.

User signed up for Brevo, added a single verified sender (`mjlor1126@gmail.com`, restricted-scope API key with only Transactional Email → All), and set `BREVO_API_KEY`/`EMAIL_FROM` in both the local `.env` and Railway's variables (removing the four now-dead `SMTP_*` ones from Railway). Verified twice: once locally via a real `forgot-password` call against the real Brevo API before touching Railway, then again against the live deployed backend after Railway redeployed with the new variables — a real login returned `{"mfaRequired":true}` and the OTP email genuinely arrived in the real inbox this time. **Production login is fully functional again, 2FA included, end to end.**

---

## Part H — Enter key now submits the login/OTP forms

Small, user-requested UX fix: *"make the login button enter when i click enter in the keyboard."* `Login.tsx`'s Employee ID, Password, and verification-code inputs are plain `<input>`s with no surrounding `<form>`, so pressing Enter did nothing by default — only clicking the actual button worked.

### Progress

Added an `onKeyDown` handler to each of the three inputs (`if (e.key === 'Enter') handleLogin()` / `handleVerifyOtp()`), reusing the exact same handlers the buttons already call — no new logic. `employeeIdField`/`passwordField`/the OTP step are each a single shared JSX const referenced in both the mobile and desktop render trees (`Login.tsx`'s usual two-tree pattern), so one edit covers both without duplication. `tsc --noEmit` clean. Pure frontend, no backend impact — matches the general rule given to the user when they asked whether an upcoming UI redesign would affect the backend (visual/interaction-only changes don't; only new data needs do).

**Not yet committed/pushed** — sitting locally alongside the already-written but also-unpushed PROGRESS_REPORT_3.md update confirming Part G's live Brevo verification, pending the user's go-ahead per the standing push-confirmation rule.

---

## Part I — Hep B Titers: a new screening category, planned properly before any code

User shared two Figma mockups of an upcoming redesign: a staff landing page with a "My Screening Progress" card (APE + Q3 Flu Immunization + Hep B Titers combined into a 3/4-requirements ring), and a "Submit Health Documents" screen with a "Select Health Screening Category" dropdown. Asked what Hep B Titers would actually mean for the system, then — after a walkthrough of the clinical distinction (a titer is a blood antibody test confirming immunity, different from an immunization *dose*) and the architectural implications — asked for this to be properly planned before any implementation.

### Attempts

Used the harness's plan-mode workflow rather than jumping to code: two Explore agents in parallel (one over the backend `tracking`/`monitoring`/`documents` modules, one over the frontend `Upload.tsx`/`Compliance.tsx`), then a Plan agent to draft a concrete file-level design from their findings, then verified the Plan agent's single most load-bearing claim by reading the real `documents.service.ts` directly before trusting it.

Scope needed real decisions first, asked via `AskUserQuestion` rather than assumed: whether to build the whole mockup (Hep B Titers + Immunizations' first-ever frontend + a new circular-progress component that doesn't exist anywhere in this app) or just Hep B Titers alone (chose the latter, on my recommendation — three genuinely separate efforts bundled into one pass was too much surface area to verify properly in one go); whether staff self-submits with admin review (matching APE) or admin enters it directly (matching the existing PEP/Immunizations pattern) — chose self-submit+review, matching what the Figma screen actually shows; whether a titer needs recurring/overdue tracking — chose one-time, no M&E engine involvement.

### Failures

None in the shipped code, but the exploration surfaced two things worth recording. First: Immunizations, PEP, and Pre-Employment have **zero frontend presence** today — full backend CRUD support, but nothing in `vmmc-frontend` references any of the three. This directly shaped the scope decision above. Second, and the important one: the Plan agent's draft design initially claimed `review()` "needs zero changes because `compliance_record_id` naturally comes back null for non-APE docs" — reading the real `documents.service.ts` before trusting it showed this was **wrong**: `upload()` called `complianceRecordService.getCurrentCycleRecordId()` completely unconditionally, with no `doc_type` branching at all. Left as-is, every Hep B Titer upload would have silently attached itself to the employee's real APE compliance cycle, and approving it would have overwritten that cycle's `approved_document_id` and re-run the M&E classifier against a document that was never an X-ray result. This became the plan's central fix, not an afterthought.

### Progress

Implemented exactly per the reviewed plan:
- **Migration** (`20261020000000_hepb_titer.sql`): adds `'HEPB_TITER'` to the `tracking_type` enum, a new `titer_result` enum (`REACTIVE`/`NON_REACTIVE`/`NOT_APPLICABLE`), and the column on `documents` — purely additive, every existing row stays valid via the same `NOT_APPLICABLE` default `cxr_result`/`genexpert_result` already use.
- **Backend**: `UploadDocumentDto` gets a required `category` field; `DocumentsService.upload()` branches validation on it and — the fix the whole plan existed to make — only calls `getCurrentCycleRecordId()` when `category === 'APE'`, `null` otherwise; `getReviewQueue()`/`toResponse()` extended to carry `titerResult` through. `review()` genuinely needed zero changes, confirmed by both reading the code and a new regression test.
- **Frontend** (`Upload.tsx`): a category toggle in the (single, shared, not breakpoint-duplicated) upload modal; `resultLabel()` gets a `HEPB_TITER` branch so the review queue and Recent Submissions show "Hepatitis B Titer" instead of a nonsensical CXR label; the admin detail modal gets a third result row with **inverted** color semantics from CXR/GeneXpert's (`REACTIVE` = immune = green, the opposite of "positive finding = red") — flagged in the plan specifically as an easy-to-get-backwards trap; three APE-specific copy strings on the desktop staff screen generalized since they were simply wrong once a second category existed.
- **Tests**: 4 new backend unit tests (`documents.service.spec.ts`) — a `HEPB_TITER` upload never calls `getCurrentCycleRecordId`, inserts the right `doc_type`/`compliance_record_id: null`/`titer_result`; rejects a `HEPB_TITER` upload missing its result; an `APE` upload still calls the lookup (regression guard); a new `review()` test confirming a null-`compliance_record_id` approval never touches the event classifier. 79/79 backend, 19/19 frontend, both `tsc --noEmit` clean.
- **Live verification, twice over**: once via `curl` directly against the local backend (upload → review-queue → approve, then an independent `compliance_records` read confirming the employee's real APE cycle was byte-for-byte unchanged before/after), then again through the **real browser UI** end to end — staff logs in, drops a file, switches the category toggle, submits; admin logs in, sees "Hepatitis B Titer" in the queue, opens the detail modal, confirmed `REACTIVE` renders in the correct green (`rgb(47, 133, 90)` = `#2f855a`, not red), approves — then the same independent APE-record check, confirmed unchanged a second time. Hit one real, unrelated infrastructure snag mid-verification: the frontend dev server's Turbopack cache panicked with "Next.js package not found" on the `/dashboard` route specifically — fixed by stopping the server and clearing `.next` before restarting (per `FRONTEND_STANDARDS.md` §9's own warning, safe once the server is actually stopped first). All test documents (DB rows + Storage objects) deleted afterward; both test accounts' `two_factor_enabled` and `devices.is_current` restored to their real pre-test values — the browser pass in particular created one genuinely new stray `devices` row for the admin account (Playwright's Chromium reports as "Chrome on Windows" regardless of host OS, colliding with neither of the admin's two real device buckets), deleted rather than just flipped since it hadn't existed before the test.

Docs updated: `BACKEND_ARCHITECTURE.md` §8 gets the full category/bug-prevention writeup, `HANDOFF.md` gets a new bullet.

---

## Part J — The staff landing page + Submit Health Documents redesign, planned properly in a second plan-mode pass

Follow-up to Part I, picking up the two pieces explicitly deferred there: the "My Screening Progress" ring/checklist and the Upload screen's restructure to match the second Figma mockup. User asked mid-build "what's been removed on the new UI, what's worth included and not," prompting an honest accounting before continuing — see below.

### Attempts

Same plan-mode discipline as Part I: two Explore agents (one confirming `Dashboard.tsx`'s current STAFF branch and `dashboard.service.ts`'s actual response shape, one re-confirming `Upload.tsx`'s/`documents.service.ts`'s current state since Part I had already changed them), then a Plan agent for the concrete design, then direct verification of its key claims by reading the real `dashboard/types.ts` before trusting the plan.

Real scope decisions made via `AskUserQuestion` before writing code: Immunization data stays admin-entered-only (no new self-submit flow this pass — the checklist just reads what's already on file); both screens (landing page + Upload restructure) in one pass, the user's choice over landing-page-only; the hero's building photo would be user-supplied, so the section was built with a real asset slot rather than a fake placeholder graphic; the mockup's second "Select Health Screening Category"-labeled field (placeholder "e.g. Chest Radiograph Report 2026") confirmed as a Figma labeling mistake, built as a free-text Document Title field instead.

### Failures

None in the shipped code, but two things surfaced mid-build worth recording:

1. **A real, user-flagged content removal, not silently dropped.** Replacing "My Department Compliance" with "My Screening Progress" at the same dashboard slot meant department compliance rate and department pending-staff count stopped being shown anywhere on the desktop staff dashboard — a real loss, and a more significant one than it first looked, since this exact page is shared by UNIT_HEAD accounts too (confirmed: `isUnitHead` only adds an Escalations card on top, it doesn't branch the rest of the layout), and a Unit Head has a real reason to care about their department's numbers at a glance. Asked directly rather than assumed either way; the user said leave it dropped for now, come back to it later — recorded here so it doesn't quietly get forgotten.
2. **A genuine mock-testing trap, caught before it shipped a bad test, not after.** `getStaffOverview()`'s new queries were added to its existing `Promise.all` alongside `fetchRecords()`, an async helper with its own internal sequential awaits. A throwaway diagnostic test proved empirically that the real `.from()` call order does **not** match the `Promise.all` array's declaration order — `fetchRecords()`'s second internal call gets delayed behind every sibling element's own first synchronous call. A naive queued-mock integration test would have silently fed each query the wrong canned response and still reported green, since the FIFO mock has no way to tell table names apart. Resolved by extracting `buildScreeningProgress()` as a standalone pure function (no DB access) so the real logic is directly, reliably testable — same precedent `sla-evaluator.ts` already set — and verifying the thin query-wiring glue around it live instead.

### Progress

**Backend**: `StaffOverview` (`dashboard/types.ts`) gains `employeeId`, `totalPersonnel`, `lastAuditedAt`, `screeningProgress` (`{verifiedCount, total: 3, percent, items}` — `total` is a hardcoded 3, deliberately never padded to match the mockup's literal "3/4" and never shrunk for missing data, per the user's explicit instruction). `buildScreeningProgress()` computes each of the 3 items from data `getStaffOverview()` already fetches in parallel: APE from the existing `own` compliance record, Hep B Titer from the latest `HEPB_TITER` document (`VERIFIED` only on `review_status === 'APPROVED'` — a pending submission is `DUE`, "Pending review," never counted early), Immunization from the latest dose on file checked against its own `next_due_date` (same shape `ImmunizationsService.findOverdueDoses()` already uses, scoped to one employee). New migration `20261021000000_upload_metadata_fields.sql` adds `documents.title`/`facility_name`/`notes` — all nullable, all real and persisted, all surfaced in the admin review detail modal, matching this session's standing rule against decorative UI fields (the Profile 2FA-toggle incident precedent). `UploadDocumentDto`, `DocumentsService` (`DOCUMENT_COLUMNS`, `upload()`, `toResponse()`, `getReviewQueue()`), and `DocumentsController`'s Swagger schema all extended to carry the three fields through.

**Frontend — `Dashboard.tsx`**: new hero section (badge, two-tone heading, real `totalPersonnel` stat chip, a static "Birth-Month APE Cycle" chip, a photo slot referencing `public/vmmc-building.jpg` for the user to fill in) in both mobile and desktop trees. `AnimatedRing` generalized from `{percent, pendingCount}` (hardcoded "PENDING STAFF" caption) to `{percent, centerValue, caption}`. Surveillance Cycle card's footer extended from Department/Department Code to Department/Staff ID/Last Audited, plus a new "Pending Health Requirement + Submit File" row. New `ScreeningChecklistRow` component renders the 3-item checklist under the ring.

**Frontend — `Upload.tsx`**: the whole staff upload flow rebuilt from click-dropzone-then-modal into one page. New `UploadFormFields` component — shared verbatim between mobile and desktop (only the dropzone slot differs, matching this file's existing single-shared-modal precedent now applied to a non-modal context) — covers category toggle → Document Title → Clinic/Facility Name → Date → read-only Department display (reusing `GET /dashboard/overview`'s existing `department` field rather than a new endpoint) → dropzone → category-conditional results → reviewer Notes → "Save Clearance Record." `DocumentEntry.labelFor()` and the review-queue chip/detail-modal header now all prefer a document's `title` when present, falling back to the computed `resultLabel()` for older rows. Admin detail modal gained Facility and Notes rows.

**Tests**: `tsc --noEmit` and the full suite clean on both repos throughout (90 backend, 19 frontend — no net-new test files this part, since the plan's reliable test coverage was already added in the extraction described under Failures above).

**Live verification, curl then real browser, same discipline as every prior part**: `GET /dashboard/overview` confirmed `totalPersonnel: 23`, `screeningProgress` computed correctly from real data (`1/3` verified, matching the account's actual real state); `POST /documents` with all three new fields echoed back correctly; an over-length `notes` string correctly rejected with 400. Real browser pass: staff login → hero renders real `"23 Staff Registered"` → Screening Progress card shows the real `1/3 REQUIREMENTS` (confirmed NOT the mockup's literal fabricated count) with correct per-item statuses, including watching an item visibly flip from `MISSING` ("Not yet submitted") to `DUE` ("Pending review") after a real submission and before admin approval; new single-page Upload form confirmed rendering all fields correctly, including the live Department read-only display; a real submission with a custom title, facility name, and notes confirmed showing up correctly in Recent Submissions; admin login → review queue shows the custom title → detail modal shows facility name and notes → approved → the employee's real APE compliance record confirmed byte-for-byte unchanged, same regression check as Part I. All test documents (DB rows + Storage objects) deleted afterward; both test accounts' `two_factor_enabled` and `devices.is_current` restored — the browser pass again produced one stray `devices` row for the admin account (same Playwright-reports-as-Windows collision as Part I), deleted rather than kept.

Docs updated: `BACKEND_ARCHITECTURE.md` §8 gets the full `screeningProgress`/metadata-fields writeup including the mock-ordering trap, `HANDOFF.md` gets a new bullet alongside the Hep B Titers one.

### Addendum — a pixel-level pass against the final mockups, and two real bugs it caught

User shared the actual final Figma exports (not the earlier description) and asked for an exact match. Comparing closely surfaced real content/layout gaps beyond what the earlier pass approximated: the nav bar's labels ("Home Dashboard"/"Compliance Tracker"/"Results & Upload"/"Profile Settings" → "My Health Profile"/"Submit Health Documents"/"My Clearance & Logs"/"Profile", confirmed in scope since the user explicitly said yes to renaming shared chrome, not just the two screens); the Surveillance Cycle card's two separate pills collapsed into one "SURVEILLANCE CYCLE: {year}" pill plus a new "✓ Account Active" pill; a "Document Upload Portal" badge added above the Upload heading; the Upload form's fields regrouped into 2-column rows (Category+Title, Facility+Date) via Tailwind responsive grid classes rather than the stacked full-width layout from the first pass; the "Save Clearance Record" button changed from full-width to a right-aligned pill, matching the mockup exactly.

One more judgment call reconfirmed rather than re-litigated: the mockup's ring literally shows "3/4" and "75% Complete," but its own listed checklist only has 3 items (2 Verified + 1 Due ≈ 67%, not 75%) — asked again explicitly given the user's "exactly like the mockups" instruction, and confirmed real computed data stays, not the mockup's internally-inconsistent fabricated numbers.

Two real bugs surfaced only by actually looking at a live screenshot, not from reading the code:

1. **A negative day-count**: "Next Screening Due: -51 Days Remaining." The account's APE record was already cleared this cycle, but the due date itself (the last day of birth month) had already passed by the time this was screenshotted — the raw `daysRemaining()` arithmetic was correct, but subtracting past-due from already-cleared produces a negative number with no framing to make sense of it. Fixed with `screeningCycleStatusText()`: cleared → "Cleared for this cycle," genuinely overdue (not cleared, date passed) → "Overdue by N Days" with the status dot turning red, otherwise the normal "N Days Remaining" countdown — the three real states this number can actually be in, rather than one formula blindly applied to all of them.
2. **A missing space**: "My Health Clearance& Screening Center" — the heading's `</span> &amp;` had a literal space in the source, correct per JSX whitespace rules, but rendered glued together in the browser. Rather than spend time determining whether it was a genuine collapse or a font-kerning illusion, replaced it with an explicit `{' '}` expression, removing the ambiguity outright.

Both caught by actually taking a real screenshot of the real running page and looking at it, not by reading the diff — the same lesson this project's own docs already name repeatedly (a fifth-pass/eighth-pass/ninth-pass recurring theme in `SYSTEM_ARCHITECTURE.md` §7): a feature that type-checks and passes its tests can still be visibly wrong, and the only way to catch *that* class of bug is to look at the actual rendered output.

Re-verified via fresh screenshots after both fixes — confirmed resolved, full `tsc`/test suite re-run clean on the frontend (19/19), no backend changes needed for this pass.

---

## Part K — Chrome rebuild: persistent sidebar → single top nav bar, to actually match the mockup

User shared a screenshot of their own live running app side-by-side with the very first mockup ever shared and asked "does this look the same to you?" It didn't: every prior pass (Parts I/J and its addendum) had only ever updated *content* inside the existing sidebar+header chrome — the chrome's actual structure (a persistent left sidebar with a separate top header bar) had never been compared against the mockup's real structure (one single top bar: logo+tagline, inline nav links with a filled-pill active state, bell, profile pill — no sidebar at all). Asked directly whether to rebuild the chrome to match; the user said yes, explicitly: **"Yes match the whole dashboard like the layout and all. Forget about the frontend standards."**

### Attempts

Read the full existing `Layout.tsx` (384 lines) first to inventory everything it does before touching it — phone-only mini header, the sm+ top bar + sidebar combo, notification bell+panel, profile dropdown+logout, role-branched nav arrays (staff vs. admin), active-route highlighting via a `layoutId` animated pill, and the phone-only bottom tab bar — so none of it got lost in the restructure.

### Progress

Replaced the sm+ top-bar-plus-`<aside>`-sidebar combo with one integrated `<header>`: logo+tagline on the left, inline nav links in the center (`lg:` and up — a filled green pill for the active item, matching the mockup's active state exactly), and hamburger/bell/profile pill on the right. The `<aside>` sidebar element is gone entirely for sm+ widths. Below `lg` (tablet range, 640–1023px), the inline nav has nowhere to fit, so the hamburger now opens a dropdown panel directly under the header instead of a side drawer — there's no sidebar left to drawer out from. The phone-only mini header and bottom tab bar (< 640px) are untouched; no mobile mockup was ever shown, and that pattern already works well on its own terms. `<main>` no longer shares a flex row with a sidebar — it's full width now.

Deliberately kept the app's actual brand colors (navy `#1c2538`/`#1f3151`, green `#00b06b`/`#4ade80`) and inline-style convention rather than inventing a different system — "forget about the frontend standards" was read as license to restructure the chrome's shape freely, not as license to throw out the project's real brand identity.

`npx tsc --noEmit` clean on the frontend after the change.

### Failures — two rounds the user rejected, and why

The first rebuild only moved the nav into a top bar and kept a green filled-pill active state. The user's screenshot came back with "this doesn't match the mockup... why won't you match the mockups and keep on staying on the design of the original UI?" The second round sampled header colors from the mockup PNG (gradient header, stacked logo, per-item icon accent colors, a small icon badge as the active state instead of a pill) and fixed some label casing. It was rejected again as "far from being identical."

**The root cause was method, not effort.** Both rounds had two gaps. Every check was against memory of the mockup or a single crop, never the whole page side by side. And the work kept fixing details inside the existing page structure, while the real differences were structural:

1. **The header and the hero are one continuous band in the mockup.** Sampling each pixel column top to bottom gives the same color from y=0 to the band's end. Our hero was a separate rounded card floating on a gray page.
2. **The content uses a wide 1440-frame container whose left edge lines up with the logo.** Ours was a narrow 1100px centered column.
3. **The page ends after the two cards.** Ours continued with four stat cards and an "upload laboratory report" banner.

The fix was to stop eyeballing and **build a comparison harness.** A Playwright script in the scratchpad (Playwright already ships in the root `node_modules` for the e2e suite) does three things:

- It injects a `vmmc_session` into sessionStorage and mocks every API response with `page.route()`, filled with the mockup's own sample data (Nursing, VMMC-02-1234, 384 staff, 2 verified + 1 due).
- It screenshots the real running app at the mockup's 1440px frame.
- It pastes that screenshot next to the mockup PNG, upscaled from 820px to 1440px, so every region can be cropped and compared at the same scale.

This also got around the problem that blocked verification in the first round. Real login needs email OTP, and temporarily disabling the test account's 2FA was correctly refused as a database write. The mocked harness needs neither: no login, no OTP, no DB access.

### Progress

All values were measured from the mockup at 1440 scale (exact pixel colors, element positions, and text widths converted to font sizes), not guessed:

- **Header (`Layout.tsx`, shared by every page).**
  - 112px tall, background `linear-gradient(90deg, #1b2a47, #265d4c)`.
  - Content sits in the same 1440/38px-padding container as the page body.
  - 50px seal; logo text stacked as "VMMC" / "SURVEILLANCE" / tagline.
  - Poppins 14px nav, where each item has its own icon accent color and the active item gets a small filled icon badge plus bold text.
  - 57px profile pill in dark green (`#173d32`) with a `#097542` border. Page background is now `#f4f7f6`.
  - The inline nav needs about 1190px. It shows at `xl`+, and between 1280 and 1439px the tagline and profile name hide so everything fits. Below 1280px the hamburger dropdown takes over.
  - Checked by screenshot at 1024, 1280, 1366, 1440, and 1920.
  - **One more bug, caught only by screenshot.** The first attempt at the 1280–1439px range used `xl:hidden min-[1440px]:block`, and at exactly 1440 the tagline stayed hidden: the `xl:hidden` rule won on CSS order. The fix was a stacked range variant, `xl:max-[1439px]:hidden`, which doesn't depend on rule order.
- **Staff dashboard, desktop (`Dashboard.tsx`).**
  - The hero breaks out of `<main>`'s padding (`sm:-mx-6 sm:-mt-6 lg:-mx-12 lg:-mt-12`) and repeats the header's exact gradient, so the two read as one band.
  - The heading breaks as "My Health Clearance / & Screening Center", and the 760×300 photo has rounded corners.
  - The two cards sit in a 2fr/1fr grid with a 40px gap. The cycle card uses the mockup's radial top-right green glow, has an outlined teal "Account Active" pill, and its footer is pinned to the bottom in three spread-out columns.
  - The progress card has a thin open `#008d46` arc with no track, and its checklist rows are tinted boxes (gray for verified, amber for due) with sentence-case statuses.
- **Removed from the staff desktop view to match the mockup:** the four stat cards (urgent actions / registry compliance / reports verified / cycle refresh) and the "upload laboratory report" banner. The Unit Head escalations card stays. It's functional and role-specific, and the mockup is a plain staff view.
- **Deliberate differences from the mockup:**
  - The notification bell is kept. It's real working functionality, and the mockup simply doesn't show one.
  - The active nav item follows the page you're actually on. The mockup's dashboard export happens to highlight "Submit Health Documents".
  - The ring shows real data (2/3, 67%), not the mockup's internally inconsistent "3/4 / 75%".

`tsc --noEmit` is clean and frontend tests pass 19/19. The mobile tree (no mobile mockup exists) only picked up the restyled ring and checklist rows.

**Not yet done:** the Upload screen (`Upload.tsx`) has its own final mockup and hasn't had the same side-by-side pass. It inherits the new header but still uses its old content width and card styling.

---

## Part L — WCAG accessibility audit of the dashboard, then making the mockup layout responsive

The user asked two things in a row: "Is the dashboard all WCAG accessibility standards?", then "The mockup is i think just for laptops that's why make it responsive". The second came in alongside an earlier observation that the header felt too large.

### Attempts

- **Automated audit.** axe-core 4.10.2 was installed in the scratchpad only (not the project). The Part K mocked-API harness injected it into the real running dashboard and ran the `wcag2a/2aa/21a/21aa/22aa` rule sets. The matrix covered staff and admin, at 1920 desktop, the 1366 avatar-only header range, and a 390px phone.
- **Manual contrast check.** Every color pair used on the page was also computed by hand, because axe skips text over gradients or inside fading containers.
- **Other checks.** A keyboard Tab pass with a screenshot of the focus ring, and a 320px reflow check for horizontal scroll (WCAG 1.4.10).

### Failures — real, and some predated this redesign

1. **Color contrast (1.4.3) was the only automated failure, but it was widespread.**
   - The app's standard muted gray `#a0aec0` is 2.26:1 on white, used for the phone header subtitle, notification timestamps, and admin labels.
   - White on the bright brand green `#00b06b` is 2.83:1: phone buttons, the active bottom-tab pill, and "Account Active".
   - The admin badge `#3182ce` on `#ebf8ff` is 3.72:1.
   - Several colors sampled straight from the Figma also fail: the "Submit File" button 4.38:1, the "67% Complete" pill 3.71:1, "REQUIREMENTS" 2.54:1, and the cycle card footer labels 4.41:1. **Matching a mockup pixel-exactly can still ship an accessibility failure if the mockup's own colors fail.**
2. **Hand computation caught failures axe didn't flag.** "REQUIREMENTS" sits in a container that fades in, and the cycle-card labels sit on a radial gradient, so axe skipped them. An automated pass alone would have reported this page clean.
3. **Gaps in the accessible state of controls.**
   - The menu buttons didn't expose open/closed state (`aria-expanded`).
   - The active nav item was marked only by color and bold weight, with no `aria-current`.
   - In the 1280–1439px range the profile button's name was hidden with `display:none`, leaving screen readers only the initials.

### Progress

- **Contrast fixes.** Each replacement is the closest passing shade:
  - `#a0aec0` → `#5f6b7d` (passes on all four light surfaces)
  - white-on-green → `#008541` (4.74:1)
  - green text on light green → `#047857`
  - the Submit File button → `#007a53`
  - the caption → `#64748b`
  - the cycle-card labels → `#8aa1b3`
  - the admin badge → `#2b6cb0`
- **Control state and names.** Added `aria-expanded` on the hamburger, bell, and profile buttons. The bell's label now includes the unread count. Added `aria-current="page"` on every nav variant (inline, dropdown, phone tabs). The profile name uses `sr-only` instead of `display:none` in the narrow range. The decorative ring SVG is `aria-hidden`; its value is in real text.
- **Result: axe reports 0 violations across all five configurations.** The 320px reflow check shows no horizontal scroll for staff or admin. The browser's two-tone focus ring is clearly visible on the dark header.
- **Not covered by these checks:** a full screen-reader walkthrough, 200% zoom on desktop, and the other screens. Compliance, Upload, Profile, and PiiIndex still use `#a0aec0` and `#00b06b` for text.

**Responsive pass.** The mockup is a 1440px laptop frame, so Part K's literal pixel sizes didn't adapt to other screens. On the user's 1920×950 monitor the 112px header and fixed 300px photo felt oversized.
- **Header.** Now 72px (80px from `xl`) with a smaller seal, logo text, bell, and pill.
- **Width.** The container is `maxWidth: 1600` / `px-6 lg:px-10`, so wide monitors get more content width.
- **Hero.** The heading, description, date, and spacing use `clamp()`, and the photo uses `aspect-ratio: 760/300` (max 360px) instead of a fixed height.
- **Cards.** The grid is 3:2 at `lg` (the progress checklist was truncating at 1024px) and the mockup's 2:1 from `xl`.

Screenshotted at 768, 1024, 1366, and 1920. axe still reports 0, `tsc` is clean, and tests pass 19/19.

**Second responsive correction: fluid, not centered.** The user sent their 1920 screenshot next to the mockup: "It utilizes its spaces rather than the actual that is compressed in the center whenever it enlarge or little the screen sizes." The `maxWidth: 1600` centered container left about 160px of empty margin on each side, while the mockup runs edge to edge.
- **Width.** The header, hero, and card rows now have no max-width and use `px-6 lg:px-[2.7vw]`, the mockup's own side margin (22/820 of its frame).
- **Scaling.** The large elements grow with viewport width in the mockup's proportions at 1440: the heading (`clamp(28px, 2.57vw, 60px)`), the deadline date, the hero photo (aspect-ratio, no height cap), the gaps, and the progress ring (`clamp(140px, 11.3vw, 240px)`, now an SVG sized by its container). Body text, nav, and chips stay at fixed readable sizes.
- **Verified.** Screenshots at 1024, 1280, 1440, and 1920, each in the mockup's aspect ratio, were tiled next to the mockup and look like the mockup scaled. axe still reports 0 violations across all five configurations, there's no horizontal scroll at 320px, and tests pass 19/19.

**Header follow-up: the name kept disappearing, and the tabs weren't centered.** At about 1380px wide the user saw the profile name collapse to initials ("it should be there whenever i resize it"), and the tabs sitting "almost on the left side rather than the center."
- **Why.** The name collapse was deliberate: an earlier fit-the-nav fix hid the name and tagline between 1280 and 1439px. The tabs simply followed the logo, so their position depended on the logo's width.
- **Change.** The header became a 3-column grid (`minmax(0,1fr) auto minmax(0,1fr)`), which keeps the nav at the exact center, and the name and tagline are never hidden.
- **A real bug found while verifying.** The first centered version looked right, but measuring the profile group's right edge (not just where columns start) showed the pill running **40px past the right edge at 1280 even with a normal name**. Centering makes both side columns equal: at 1280 each got 259px, and the bell plus full-name pill needs about 300. The fix: 1280–1439 gets a slightly denser header (13px nav, tighter gaps, 40px bell), and the name's max-width is capped per range at the room that side actually has, so unusually long names get an ellipsis plus a tooltip instead of overflowing.
- **Verified.** A measurement script covered 12 widths (1024–1920) × a normal and a 37-character name: 0 overflows, the nav centered to the pixel at every xl+ width, and the normal name shown in full everywhere. axe still reports 0 violations, and tests pass 19/19.

---

## Part M — Submit Health Documents matched to its mockup, with the same harness

The user shared the final Upload mockup ("Now this for submit health documents").

### Attempts

This used the Part K method from the start, not after a rejection:
- Upscaled the mockup to 1440, located the card edges by scanning pixel rows, and sampled every color with PIL.
- Screenshotted the real page with the mocked API.
- Compared the two side by side, then checked 1024 and 1920.

The harness's mock had been returning `{}` for `/me/documents`, which crashed this page in Part K's check. It now returns a realistic list.

### Progress

- **Layout (staff desktop).** A full-width header card (4.4vw margins, 18px radius, the mockup's heavier bottom shadow) holds the mint "Document Upload Portal" badge, the heading, and the subtitle. Below it, the form sits in one centered white card at 79.5% of the content width (1045px at 1440, as measured).
- **Shared form, used by mobile and desktop.**
  - Title Case Poppins 14px labels in `#454545`; 41px inputs with a 12px radius and an `#ebebeb` border.
  - The category toggle buttons became the mockup's dropdown ("1. Annual Physical Exam (APE)" / "2. Hepatitis B Titer").
  - Facility and date sit side by side.
  - The upload area is a 228px box with long-dash borders: CSS `dashed` can't set dash length, so the dashes are drawn as an SVG background. It has a mint icon tile and the mockup's copy.
  - The Save button is a dark green (`#006042`) rounded rectangle.
- **Deliberate differences from the mockup:**
  - The mockup's second "Select Health Screening Category" label stays **Document Title** (the Figma slip was confirmed in Part J).
  - The read-only **Department** value is kept as a field. The mockup shows the label but no box.
  - The required **result** fields are kept, restyled as dropdowns in the same input style. The backend rejects an APE with no X-ray/GeneXpert result, and a Hep B Titer with no titer result.
  - **Recent Submissions** moved under the form at the same width. The mockup is cropped just below the form, and this is staff's only view of review status.
  - The category starts on "Select a category" rather than pre-selecting APE, so a Hep B document isn't filed as APE by default.
- **Accessibility, fixed on the way:**
  - None of the form's labels were linked to their fields before. Every field now has a `useId()`-based `htmlFor`/`id` pair.
  - The desktop dropzone was a clickable `div` with no keyboard access. It now has `role="button"`, `tabIndex`, Enter/Space handling, and a label that names the selected file. Mobile's picker became a real `<button>`.
  - Inputs had `outline: none` with no replacement focus style. They now get a green `focus-visible` outline.
  - The error message has `role="alert"`.
  - The mockup's placeholder and helper gray (`#c6c6c6`, 1.7:1) became `#767676`.
  - The status badge text and the review queue's `#a0aec0`/`#718096`/`#dd8b3a` text colors got passing shades.
- **Verified:**
  - **Functional flow.** A Playwright test (mocked API) covered the empty-save error, Enter on the dropzone opening the file chooser, filling every field *by its label* (which also proves the label↔field links), the missing-result error, switching to Hep B to show the titer field, and saving. It confirmed POST `/documents` carried category, examDate, title, facilityName, notes, cxrResult, and the file (and no empty genexpertResult), that the new row appeared in Recent Submissions, and that the form reset.
  - **Audits and tests.** axe reports 0 violations for staff desktop/1366/phone and admin desktop/phone. There's no horizontal scroll at 320px, `tsc` is clean, and tests pass 19/19.

---

## Part N — My Clearance & Logs became the mockup's submission-history table (plus a small backend change)

The user shared the mockup ("Now for the my clearance and logs"). They had just asked whether the backend needed changes, and the honest answer for Parts K–M was no. This page is the exception: the mockup's **Verified By** column needs data the API never returned.

### Attempts

Inventoried the current staff view first. It was a single "My Compliance Record" card: X-ray/GeneXpert results, exam and due dates, a cycle-progress bar, and a "View Official X-Ray PDF" button, which only opens a results-summary modal and not an actual PDF. The mockup replaces all of that with a table of every submitted document and its verification status.

Checked the schema before planning any backend work. `documents.reviewed_by`, `reviewed_at`, and `rejection_reason` have existed since the initial migration and simply weren't returned by `GET /me/documents`, so **no migration was needed**.

### Progress

- **Backend.** `listMine` now also returns `reviewedBy` (the reviewer's name via `employees!documents_reviewed_by_fkey`), `reviewedAt`, and `rejectionReason`, with 4 new unit tests. The FK embed was checked against the real database with a read-only query, because a wrong FK name passes mocked tests but fails at runtime. It returned real reviewer names, `null` for pending rows, and also `null` for some older approved seed rows that predate reviewer tracking. See `BACKEND_ARCHITECTURE.md` for details.
- **Frontend (STAFF only; the Unit Head/Admin registry on this route is unchanged).**
  - The old record card and its helpers are replaced by `MySubmissionHistory`. It has the mockup's header card (amber "Submission History" badge) and a five-column table: a 54px header row with icons, 75px rows, a gray category chip, YYYY-MM-DD dates, Verified By, and Pending / Verified & Cleared status pills.
  - **Additions the mockup doesn't show:** a red "Rejected" pill with the rejection reason under it, since a rejected upload is useless to staff without knowing why. An empty state with a button to Submit Health Documents. Pending rows (and older rows with no recorded reviewer) say "TB DOTS Reviewer", as the mockup does.
  - **"DOC-904"-style IDs.** Documents have UUIDs, not sequential numbers, so the reference is derived from the id (`DOC-904A7C`). It's stable, but not a real sequence.
- **Responsive.** The table shows from `lg` (1024px) up. Below that, the same rows are cards (one column on phones, two on tablets), because at 768px the table pushed the Status column out of view. The Status column is 22% wide rather than the mockup's 19.3% so the widest pill fits at 1024. Measured: the pills keep at least 30px from the card edge at 1024–1920, and the table never scrolls sideways.
- **Two bugs caught by screenshot, both the same documented trap** (FRONTEND_STANDARDS §2: inline style beats a Tailwind class on the same property):
  - The phone card list had `className="sm:hidden"` plus an inline `display: 'flex'`, so it rendered on desktop *under* the table. Moved `flex` into the class list.
  - Minutes later, an inline `marginTop` collided with an `sm:mt-6` class; also moved into the class list.

  A grep for the pattern across the redesigned screens found one other instance: the header's profile chevron, which is harmless because that whole header is hidden on phones.
- **Accessibility.** The table has a screen-reader caption and `scope="col"` headers. The faint document-ID gray from the mockup became `#64748b`. The admin registry's `#a0aec0`/`#718096` text became `#5f6b7d`. axe reports 0 violations for staff desktop/1366/phone and admin desktop/phone.
- **Verified.** The empty state renders and its button navigates to `/upload`, and the rejected-row reason renders. `tsc` is clean on both repos. Backend tests pass 94/94 and frontend 19/19.

**Deploy note:** the frontend reads the new `reviewedBy`/`rejectionReason` fields, so this backend change must ship together with the frontend. Pushed alone, the frontend would show "TB DOTS Reviewer" on every row and no rejection reasons; nothing would break.

---

## Part O — Profile matched to its mockup, without the mockup's false security claims

The user shared the Profile mockup ("Now for the profile"). It was the first mockup in this series that described **security features the system doesn't have**, so the claims were inventoried before any building:

| Mockup | Reality |
|---|---|
| 2FA "VMMC Mobile Authenticator" | Real, but **email** one-time codes |
| "Immutable SHA-256 Ledger" | `audit_logs` **is** append-only (DB trigger blocks UPDATE/DELETE, `20260802000000_audit_privacy.sql`), but nothing is hashed |
| RBAC "Full Administrative Access" (for a nurse) | Roles are real; staff have own-records-only access |
| "RA 10173 Consent Verified & Active" | No consent is recorded anywhere |
| "AES-256 (2026-KEY-VMMC)" key | No such key; Supabase encrypts stored data at rest with AES-256, but there's no key ID to show |
| "All interactions cryptographically signed" | Not true (admin approvals carry a signature *image*) |
| Audit table of other users' actions | Showing a staff member everyone's activity would itself be an RA 10173 problem |

The user chose all three recommended options via `AskUserQuestion`:
- Keep the mockup's layout, with **truthful wording** in every spot where its claims don't hold.
- **Keep** working features the mockup omits (edit contact details, PIN, devices, privacy settings, Request a Change, Log Out), tucked into a "More Account Settings" card.
- Limit the audit table to **the user's own activity**.

### Progress

- **Backend.** `GET /me/activity-logs` now also returns the raw `action`, `entityType`, and a short `entityRef` from `entity_id`, so the audit table and data-log export can show the mockup's code-style columns. 3 new unit tests; the column selection was verified against the real database with a read-only query. No migration.
- **Staff desktop Profile (`Profile.tsx`), rebuilt in the mockup's layout:**
  - **Profile card:** name, title • department, ID, Sync Profile (re-reads profile, activity, and sign-ins), and four tiles. Department and email are as in the mockup. Contact number and APE schedule replace the mockup's fabricated consent and encryption-key tiles. Also: last active login from real login history, Change Password, and Download Data Log (a CSV of the user's own audit entries).
  - **Security Controls:** 2FA "Email one-time code at sign-in" with a live ENABLED/DISABLED badge; the tile opens a real toggle. Audit Trail "Append-only log, cannot be altered". RBAC with the user's actual access level. An RA 10173 footnote stating only what's true.
  - **Three info cards,** reworded to be accurate.
  - **The audit table:** own actions only, 3 rows plus "View all".
  - **More Account Settings.**
  - Admin and phone layouts are unchanged in structure.
- **Found and fixed: staff could never change their password or 2FA in the UI.** Both controls were reachable only from the admin profile, although `PATCH /me/security/password` and `/two-factor` aren't role-restricted. The mockup's Change Password button and 2FA tile now open new `password`/`2fa` panels in the shared modal.
- **Found and fixed: `getInitials` used the trailing credential as the last initial.** "Maria Santos, RN" showed "MR" (and "Juan Dela Cruz, RN" showed "JR" in the header). It now ignores everything after a comma. 1 new test.
- **Accessibility.**
  - The shared modal's icon-only close button had no accessible name; it now has `aria-label="Close"`.
  - `ToggleSwitch` now has `role="switch"`, `aria-checked`, and a label.
  - The new password fields have linked labels and `autocomplete` hints.
  - Failing text colors across the rest of Profile were replaced: `#a0aec0`/`#718096` → `#5f6b7d`, `#e53e3e` → `#b42318`, green text → `#047857`, white-on-`#008d46` → `#008541`.
  - axe reports **0 violations** for staff 1920/1366/phone and admin 1920/phone.
- **Verified with a Playwright interaction test (mocked API):**
  - Sync re-fetches the profile.
  - Download produces `VMMC-21-012-data-log.csv` with all entries.
  - Change Password shows the empty and mismatch errors, then sends the correct `PATCH` and closes.
  - The 2FA switch sends `{"enabled":false}`, and the tile badge updates to DISABLED.
  - All five tucked-in settings open the right panel, and Log Out lands on `/login`.
  - Screenshots at 1024, 1440, and 1920. `tsc` is clean; backend tests pass 97/97 and frontend 20/20.

### Known gap, flagged and not fixed (it predates this work)

The **Data Privacy Settings** switches ("Encrypt Health Records", "Share Analytics with Department", "Enable Telemetry Logging") are saved to `privacy_settings`, but **nothing in the backend reads them**. "Encrypt Health Records — apply end-to-end encryption" is the misleading one: data is encrypted at rest regardless, and turning the switch off changes nothing. It's the same kind of decorative-control problem as the earlier Profile 2FA-toggle incident. It should be reworded, wired up, or removed; that's the user's decision.

---

## Part P — Admin landing page ("Health Overview"), plus a real Send Reminder

The user moved on from the Upload result-fields question ("nevermind that for now") and shared the admin landing mockup. Unlike the staff pages, this one needed real backend work: department breakdowns, a due-soon count, an overdue follow-up list, and a "Send Reminder" button that didn't exist.

Decisions made via `AskUserQuestion`, all taking the recommended option:
- **Nav:** rename, keep real pages. Health Overview · Document Verification · Modules Registry · PII Index · Profile. The mockup's "Notifications" item has no page behind it (the header bell already shows notifications), and the mockup omits PII Index, which is still a working admin screen.
- **Extra content:** keep what the mockup doesn't draw (Critical Cases, Detailed Analytics, the CSV reports) in a "More Overview" section at the bottom.
- **Send Reminder:** make it real.

### Progress

- **Backend (no migration).**
  - `GET /dashboard/overview` (admin) now also returns `trackedPercent`, `previousCycleRate`, `clearanceCounts` (up to date / due soon within 15 days / overdue), `departmentClearance`, and `followUps` (the 10 most overdue, plus `followUpTotal` and each person's `lastReminderAt`). The bucketing and ordering are pure functions with 8 unit tests.
  - **New `POST /monitoring/records/:id/remind` (ADMIN only).** It emits a `MANUAL_REMINDER` event through the existing event → notification pipeline, so the person gets an in-app notification, an SMS, and an email (a new email template). It is limited to one per record per 24 hours (409 otherwise), refuses already-cleared people (400) and unknown records (404), and says so if the event couldn't be recorded rather than claiming success. 5 unit tests.
  - Verified read-only against the real database. The new joins work, and today's real numbers are 23 active staff, 23 records, **4 up to date / 1 due soon / 18 overdue**, across 4 departments, with no previous-cycle records.
- **Frontend.**
  - New `AdminLanding.tsx` and a shared `HeroBand.tsx`, which the staff dashboard now uses too. A before/after screenshot shows the staff page is pixel-identical.
  - **Stat tiles:** each shows what it can truthfully show. Clearance Rate says "No previous cycle on file" rather than the mockup's invented "+4.2% vs previous cycle", and appears with a real delta once last year's records exist. "Reminders dispatch weekly" is accurate: automatic reminders repeat every 7 days.
  - **Stacked department chart and donut:** hand-built, with hover and keyboard-focus readouts and a screen-reader data table.
  - **Follow-up table:** shown from 1280px up, as cards below that. At 1024px the Action column clipped the button, so it moved to the card list.
- **Chart colors were validated, not eyeballed** (the `dataviz` skill's palette validator). The mockup's three status colors (dark green `#006042`, orange, a pinkish red) failed two checks: the green reads as low-chroma, and red vs orange were too close for normal vision (ΔE 14.4 against a floor of 15). The closest passing set is green `#00703f`, orange `#e36e15`, red `#be123c`: protanopia separation 10.5, normal-vision 18.6, 3:1+ contrast on white. Every chart also has a labeled legend, and tooltips and readouts name the series, so color is never the only encoding.
- **Verified.**
  - **Interaction test (mocked API; no real reminder is ever sent from tests):** hover and keyboard-focus tooltips show exact counts. The donut readout shows 78% (18 of 23). Send Reminder was run through success, "already reminded" (409, shown as sent), a 500 failure (error shown, retry stays enabled), and the in-flight "Sending…" state. Detailed Analytics opens, Back returns, Reports still exports, and "See everyone in Modules Registry" goes to `/compliance`.
  - **Audits and tests:** axe reports 0 violations at 1920 / 1366 / 1024 / phone / empty-data, with no sideways scroll anywhere. `tsc` is clean on both repos, backend tests pass 109/109 (15 new this part), and frontend 20/20.

### Two follow-ups from the user's first look at it

1. **A second, page-level scrollbar appeared.** The user saw two vertical scrollbars side by side.
   - **Cause.** Tailwind's `.sr-only` (the screen-reader data table under the chart, and the audit-table caption I'd added to Profile last time) is `position: absolute`. `<main>` wasn't positioned, so those elements' containing block was the page, not `<main>`: they **escaped `<main>`'s overflow clipping** and stretched the document itself. Profile had the same bug from Part O (59–234px of hidden extra scroll that nobody had noticed).
   - **Why it was missed.** Every earlier screenshot used a very tall window (1593px) that was bigger than the page, so the document never needed to scroll.
   - **Fix.** One line: `position: relative` on `<main>` in `Layout.tsx`, so every current and future `.sr-only` element is contained and clipped by it. A measurement script over 6 pages × 2 laptop-sized windows (1920×950, 1366×768) went from 4 pages with a second scrollbar to 0, and `<main>` itself still scrolls to the very bottom.
2. **"Everything on the Health Overview is too small."** A measurement script compared the computed text sizes of both dashboards (admin 82% at 14px or more, staff 51%, after the change; before it, admin had only 29%). The staff page had more large display text, while the admin page was mostly 12–13px captions.
   - **Change.** Raised the whole admin landing to at least the staff dashboard's scale: card titles 18px, subtitles 14px, stat numbers 34–50px with 14px detail lines, chart axis labels 13px, legend and tooltips 14px, table text 15–16px, header 13px, status pills 14px, and **Send Reminder 14px in a 40px-tall button** (it was 12px in 34px).
   - **Shared hero.** The hero badge and chips went up a size (13px and 14px) in the shared hero, so the staff dashboard gets the same improvement.
   - **Reports card.** The Reports card, which the phone layout also uses, got 14px export buttons.
   - **Result.** The admin landing has **no text at 12px or below**, and buttons are 40–46px tall (staff: 25–34px).
   - **Re-verified.** The follow-up table still fits without clipping at 1280 / 1366 / 1440 / 1920 (the Action column was widened to keep Send Reminder off the card edge), the full interaction test passes again, axe reports 0 violations at all 5 configurations, and nothing scrolls sideways.

3. **"The navbar is still little" — copy the staff navbar, including everything in it.** The user asked three times, in increasingly specific terms: the navbar, then the notification dropdown and the logout menu, then "just copy the size of what's in the staff navbar".
   - **What I found.** There is nothing to copy between roles: staff and admin have always rendered the **same `Layout.tsx` header**, with the same sizes (80px tall, 14px links, 40px seal). The header was simply small for both, and I had shrunk it from 112px to 80px earlier when the user said it was too large. The two dropdowns were smaller still: 13px text in a 320px panel and a 200px menu.
   - **Navbar.** From 1440px up, every part now grows with the window: height `clamp(80, 4.6vw, 96)`, seal `clamp(40, 2.7vw, 56)`, links `clamp(14, 0.92vw, 18)` (17.7px at 1919), bell and profile pill likewise. Below 1440 it keeps the compact sizes, where space is tight.
   - **Dropdowns.** The notification panel is now `clamp(340, 26vw, 500)` wide with 16–19px messages, and the logout menu is 240–330px wide with a 56px-tall button and 16–19px text. Both are always at least as large as the nav links beside them, so they no longer look smaller than the bar they hang from. The count badge, hamburger icon, and the tablet hamburger menu (17px links, 56px rows) were scaled too, and the Logout text moved from `#e53e3e` (3.99:1, failing) to `#b42318`.
   - **Two real bugs found by testing admin.** (1) The scaled height didn't apply (`xl:h-[80px]` overrode it in Tailwind's ordering); both steps are now `min-[…]` variants. (2) **Admin's five-link nav made the profile pill overflow its column** by 8–12px at 1280 and 1440, and by up to 60px with a long name at 1920 (my earlier header checks only covered the four-link staff nav). The pill now shrinks into the space it has (name ellipsis) instead of overflowing, admin's links use slightly tighter spacing below 1440, and every real admin name displays in full.
   - **Verified.** A fit matrix over 2 roles × 2 names × 8 widths (1280–2560) has 0 overflow, the nav centered to the pixel, and ≥12px gaps. A parity script measured every navbar part for both roles at 1440 / 1600 / 1919 / 2560: header, seal, links, name, bell, notification text, and logout are **identical for staff and admin**, and dropdown text ≥ link text everywhere. axe reports 0 violations with the notification panel, profile menu, and hamburger menu open, and no document-level scrollbar on any page.
4. **Found while testing the old audit script: a deploy-order crash.** Feeding the admin page the old API shape (no new fields) crashed it to a Next.js error screen. Since Vercel and Railway deploy separately, a new frontend could meet an old backend for a few minutes. `AdminLanding` now defaults the new fields (zeros / empty lists), so that window shows an empty page, not a crash.

### Things to know

- **Send Reminder is live in production.** It sends a real email and SMS to the person (the existing channels, so no new provider setup). Use test accounts when trying it.
- The admin nav labels now differ from those screens' own headings: "Modules Registry" opens a page headed "Staff Directory", "Document Verification" opens one headed "Review Queue". Retitling those pages is a small follow-up if wanted.
- The phone layout of the admin dashboard has no mockup, so it is unchanged. Since the mockup's header calls it "Live", note the data is fetched on load; it doesn't auto-refresh.
- The Upload form still asks staff for X-ray/GeneXpert results; the user chose to set that aside for now (see the previous discussion).

---

## Part Q — Admin "Document Verification" (the review queue), with a real file preview

The user shared three mockups for the admin review screen: a queue table, a verification window, and a "Pending Document Approvals" card list with Verify & Clear / Request Re-upload buttons.

### What the mockup needed that didn't exist

- **A file preview.** Files were stored (`documents.storage_path`) but nothing let anyone *view* one, so the window's preview pane had no source.
- **"Radiology / Lab Finding Notes".** There was no place to store a reviewer's findings.
- **A due schedule** per queue row (the compliance cycle's due date).

### Progress

- **Backend.**
  - New migration `20261022000000_review_notes.sql` adds `documents.review_notes`. `PATCH /documents/:id/review` accepts optional `notes` on approval. `GET /me/documents` returns `reviewNotes` (the staff history now shows "Reviewer note: …" under an approved document, so the notes are visible, not just stored).
  - New `GET /documents/:id/file-url` returns a 5-minute signed link plus the stored file type, using the same access rule as every other document read (`assertDocumentAccess`: the owner, ADMIN, a unit head for their own department, TB DOTS / HR staff).
  - The review queue now returns each row's `dueDate` (joined from the compliance record; Hep B Titers have none).
  - 9 new unit tests: the findings are trimmed and stored as null when blank, the due date maps in object or array form and is null for Hep B, and the file link is allowed for admin and owner but refused for other staff and other-department unit heads, with 404 for an unknown or unsignable file.
  - **Verified against the real database and storage (read-only):** a signed link for a real stored PNG fetches with `content-type: image/png` and no CSP or `X-Frame-Options` headers, so it embeds in an `<img>` or `<iframe>`, and the due-date join returns real dates.
- **Frontend: new `DocumentVerification.tsx`, replacing the old small review dialog.**
  - **Queue.** The mockup's table from `xl` (Staff Member, Department, Category chips, File Title / Reference, Due Schedule, Pending Review status, View & Verify), and cards below that.
  - **Verification window.** Preview of the uploaded file (image or PDF iframe, plus "Open in new tab") beside the controls.
  - **Controls.** Findings notes, a "Update Clearance Action" dropdown (Approved and Mark Up to Date / Request Re-upload), Save Verification & Update Staff Registry, and Cancel. It's a labeled `dialog` that closes on Escape or an outside click, and it focuses the window itself (not the notes box), so on a phone it opens at the top instead of scrolled down with the keyboard up.
  - **Approvals** still require the admin's digital signature, as before. **Requesting a re-upload** requires a reason, which goes to the staff member as the rejection reason.
  - The window also shows what the **staff member submitted** (results, exam date, facility, their note), which the mockup omits, because the reviewer has to check those against the document: they become the official record on approval.
- **Verified with a Playwright test (mocked API).** The table renders; the preview image actually loads and a PDF becomes an iframe; the approve payload is `{action, signatureId, notes}` and the row leaves the queue; re-upload needs a reason and sends it; Cancel, Escape, and an outside click send nothing; a server error keeps the window open with the message; with no signature, approving is blocked but re-upload isn't; a failed file load still lets the reviewer decide; the empty queue shows "You're all caught up". axe reports 0 violations on the queue and with the window open at 1920 / 1366 / 1100 / 390, no sideways scroll, and no second scrollbar.

### Decisions to know about

- **The third mockup (card list with Verify & Clear / Request Re-upload).** Its role wasn't stated, so I used it as the layout below 1280px, with both buttons. **Both open the verification window** with the decision pre-selected, instead of acting immediately: approving a medical document without opening its file would defeat the point of the review. The phone layout (390px) keeps the existing list, since no phone mockup exists.
- **Category chips.** A document is labeled by what it reports: CXR and/or GENEXPERT for an APE document, HEP B for a titer. The mockup's lone "APE" chip would never apply here, because an APE upload must include at least one result.
- **File Title / Reference.** The system doesn't keep the original filename, so the column shows the document's title (or a label) plus a short reference (`DOC-` and the first 6 characters of its id).
- **Hep B Titer rows** show "—" for Due Schedule, since they aren't tied to a compliance cycle.
- **Deploy and migration order matters.** `GET /me/documents` now selects `review_notes`, so **until the migration is applied, "My Clearance & Logs" fails to load**. `20261022000000_review_notes.sql` has been applied to the database (confirmed 2026-10-22, with a read of the column); any other environment must apply it before (or together with) deploying this backend.

---

## Part R — Admin "Modules Registry", a Notifications page, PII Index removed, and sizes set back to the staff scale

The user shared five mockups of the admin "Modules Registry": four tabs (Annual Physical Exam, Pre-Employment Clearances, Exposure (PEP) Logs, Quarterly Immunizations), each a table, a row of "Personnel Digital Health Passport" cards under every tab, and a printable "Annual TB Health Clearance Certificate" window. They also asked to replace the PII Index nav item with Notifications.

### What the mockup needed that didn't exist

- **A list view of the three smaller modules.** Pre-employment, PEP, and immunization records existed, but only per employee (`GET /pep-logs/:employeeId` and so on). Nothing listed them for everyone.
- **A truthful way to label people with nothing recorded.** The live database has 23 staff and exactly **one** row in each of those three tables, so almost every row would read "no record". Folding that into "Action Required / Overdue" would have shown ~22 people as overdue for something nobody ever recorded.
- **A certificate that can't lie.** The mockup's certificate declares someone "FIT FOR DUTY" and lists a "TB Symptom Checklist: ASYMPTOMATIC". The system stores no symptom data, and the signatory in the mockup is a fixed name.

### Progress

- **Backend: new ADMIN-only `registry` module, no migration.**
  - `GET /registry/ape | pre-employment | pep | immunizations` return one already-bucketed row per active employee, urgent first. The logic lives in pure builder functions (`registry-builders.ts`), tested directly.
  - `GET /registry/certificate/:employeeId` returns the data for the certificate, built only from the approved exam, its reviewer and their signature image.
  - 37 new unit tests; backend total 154.
  - **Checked against the real database (read-only):** 23 rows per module, the one real record in each shows correctly, the certificate for a real cleared person comes back with a working signed signature URL, and the certificate for an uncleared person is refused.
- **Frontend: new `ModulesRegistry.tsx`, `RegistryModals.tsx`, `Notifications.tsx`, `lib/registry.ts`, `lib/notifications.ts`.**
  - **Registry.** Header card with the tab strip, a toolbar (search, status filter, Add Health Record), the active tab's table, and the passport cards below. Tables from `xl`, cards below. Tables are paged (10 rows) with "Showing 1–10 of 26"; passport cards show 6 at a time with "Show more".
  - **Tabs** are a proper `tablist` (arrow keys, Home/End), and a tab's data is fetched the first time it's opened.
  - **Status filter** is an accessible listbox. Each tab offers only the statuses it can produce ("No Record" exists on tabs 2 and 4, not on APE).
  - **Row actions are real.** CERT opens the certificate; PRINT prints the pre-employment record; PEP Details and Update Log open a window with the person's history and a form (add an exposure, change an exposure's status, add a dose); a pre-employment row with no passing record gets Record / Update. **Add Health Record** opens the same window with a record-type picker and a staff search.
  - **Printing** uses a portal and print CSS (see the callouts below).
  - **Notifications page** (`/notifications`): everyone sees their own notifications with an All / Alerts / Reminders / Updates filter; the admin also sees **Escalations Requiring Attention** (Acknowledge, Mark Resolved), because the new Health Overview gave the admin no view of escalations at all. The bell dropdown gained "View all notifications".
  - **PII Index removed** from the nav, the route, and the screen, as asked. The backend `GET /reports/pii-index` still exists with no UI.
  - **Compliance scan** moved into the registry header (it was on the old Staff Directory). The old desktop Staff Directory and its Status Guide are gone for admin; phones keep the old list.
- **Verified** with a mocked-API Playwright run of 54 behavior checks (paging, search, filter by keyboard, tab arrow keys and lazy loading, every form's request body, server-error paths, focus trap and return, print media, scan, escalations, nav), axe-core 0 violations on every tab and window at 1920 / 1366 / 1100, no second scrollbar, and no table clipping at 1280–1920.

### Real bugs found

- **A 200 response with no body was retried as a dropped connection.** A handler that returns `null` (an admin with no signature yet, a person with no pre-employment record) sends an empty 200. The API client called `res.json()` on it, which threw; the `catch` treated any throw as a network failure, retried twice, then reported "connection is slow" — even though the server had answered correctly. Fixed in `lib/api.ts` (an empty body resolves to `null`) with a unit test. The registry's pre-employment form hit it on its first call.
- **"Up to Date / Cleared" appeared next to "Not cleared".** The dashboard's `clearanceBucket` files an uncleared person whose deadline is more than 15 days away under "up to date". That reads fine on a chart, but on a pill that says "Cleared" it contradicted the row's own action. The registry now only calls someone up to date if they are actually cleared; everyone else with a future deadline is "Upcoming". A CRITICAL clinical status always needs action. (The Health Overview charts keep their original grouping, so their "up to date" count can be higher than the registry's "cleared" count.)
- **A card list that ignored its own breakpoint.** The below-`xl` card list had `xl:hidden` on a `<ul>` that also set `display: grid` inline, and the inline style won, so the cards showed under the table at 1440px. Put the visibility class on a wrapper.

### The size revert, and what to do differently

- **What happened.** The user had been browsing at **70% zoom**, so the admin pages and the navbar looked small. They asked, over several turns, for the admin text, the navbar, the notification dropdown and the logout menu to be enlarged. When the login page also looked small they checked and found the zoom, and asked for everything to go back "just like the staff view".
- **What changed.** The shared navbar and menus went back to their original sizes (80px header, 40px seal, 13/14px links, 320px notification panel, 13px dropdown text), and the admin pages (Health Overview, Document Verification, Modules Registry, Notifications) were set to the staff-page type scale. Measured at 1440 with a text-node histogram, staff pages run 13px for most text with 22px titles and 40–44px buttons, and the admin pages now match. Colors fixed earlier for contrast (`#c0262d`, `#b42318`) were kept; only sizes were reverted.
- **Lesson.** Before acting on "this looks too small", check the browser zoom (a magnifier icon in the address bar means it isn't 100%). Don't enlarge admin independently of staff: the staff pages are the reference.

---

## Part S — The admin Notifications page becomes the "Notification & Screening Reminder Engine"

The user shared a mockup for the admin Notifications tab: a header card, three explainer cards (routine notice, friendly reminder, overdue alert), and a log of notifications with a "Refresh Log" button and a "SENT VIA SMS & EMAIL" pill on each row. This replaces the first version of the page from Part R.

### What the mockup said that isn't true of the system

- **"Dispatched 30 days before staff birth month"** and **"15-day lead follow-up".** The real schedule is: the window opens **14 days before the birthday** (`sla_definitions.first_reminder_days_before_birthday`), a first reminder goes out then, one on the birthday, then **weekly** (`WEEKLY_REMINDER_INTERVAL_DAYS = 7`) until the exam is approved; the deadline is the end of the birth month. The explainer cards state that instead.
- **"Mobile push alerts".** No push channel exists. The channels are in-app, SMS and email, and the page says so.
- **"Sent via SMS & Email" on every row.** The real outcomes in the live data are `SENT`, `LOGGED` (SMS with no gateway key configured: the message is only logged, never delivered) and `FAILED` (most emails). Printing "sent" for those would be false, so each row's pill says what happened, for example "Sent via In-app & Email · SMS logged only" or "Sent via In-app · SMS & Email failed". The tone (gray, amber, red) follows the outcome and the words carry it too.
- **The card title "Personnel Requiring Immediate Follow-up".** That title is already the Health Overview card, and the content here is a dispatch log, so it is titled "Notification Dispatch Log".

### Progress

- **Backend: `GET /notifications/log?limit=` (ADMIN-only), no migration.** One row per event (newest first, default 30, max 100) with the employee, department, and the real status of each channel from the `notifications` table, in a fixed order. `toLogEntries` is a pure function; a retried channel shows only its latest attempt. 8 new unit tests (backend total 162), and it was run against the real database (73 events; the outcomes seen were `IN_APP:SENT`, `SMS:LOGGED`, `SMS:FAILED`, `EMAIL:SENT`, `EMAIL:FAILED`).
- **Frontend: `Notifications.tsx` rewritten for the admin.** Header card, three tier cards (the three real event tiers: informational, warning, exception), the dispatch log (10 rows, "Show more", "Refresh Log" which keeps the rows on screen and shows an error if the refresh fails), then **Escalations Requiring Attention** and **My Notifications** kept below. Staff opening the page still get the plain "Your Notifications" list and never call the admin endpoints. Timestamps are shown in Philippine time. Sizes follow the staff scale.
- **Verified** with 19 mocked-API behavior checks (the three tiers, the real 14-day wording, no "push", logged and failed deliveries labeled honestly, an event with no dispatch rows says "Not dispatched", paging, refresh, the error path, staff view), axe-core 0 violations at 1920 / 1366 / 1024 / 390, and no second scrollbar.

### Notes

- The e2e spec now also checks the page title.
- Two real facts the log makes visible: nearly every SMS is "logged only" (no Semaphore key is configured), and many emails show as failed. That is existing delivery configuration, not something this page caused.
- The Nest watch process crashed once on Windows (`taskkill` of an already-exited child) while this was being built. The server on 8443 kept serving the new code, but restart the dev servers before relying on it.

---

## Part T — The admin Profile follows the mockup, with a real system-wide audit trail

The user shared the admin Profile mockup. It is the same layout as the staff Profile mockup (header card, profile card with Sync Profile, Security Controls, three info cards, "System Activity & Audit Trail"), except that its audit table lists **other people's** actions ("VMMC-USER-HD01, Unit Lead, VIEW_DEPARTMENT_SUMMARY…") rather than the signed-in person's own.

### Progress

- **The admin now uses the same new Profile layout as staff** (`Profile.tsx`). The old admin page (avatar column plus signature, privacy and change-request cards) was removed from the default view; its three admin-only features were kept, not dropped:
  - **Digital Signature**, **Change Requests** (with a pending count) and **Review Performance** (reviews, approvals, approval rate) sit in an "Administrator tools" row under the audit table. "Manage Signature" and "Review Requests" still open their original full views, with a Back to Profile button.
  - **Login History** was added to "More Account Settings" for admin. Change Password, the two-factor tile and the rest of that section are the shared staff ones.
  - The department tile resolves the admin's department name from `/departments` (the staff overview endpoint used for staff has a different shape for admin).
- **Backend: `GET /audit-trail?limit=` (ADMIN-only), no migration.** A new small `audit-trail` module reads the append-only `audit_logs` table across all actors, drops the same background page-load reads the personal Activity Logs drop, merges bursts **per person**, looks up each actor's employee ID, name and role, and returns the newest first (default 25, max 50, clamped). It had to be its own module: `AuditModule` is imported by `AuthModule`, so a controller inside it that needs the auth guards would be circular. 10 new unit tests; `dedupeBursts` now takes an optional key function so the per-person merge reuses it (tested), and backend total is 172.
  - **Checked against the real database (read-only):** the trail came back with the real admin's own recent actions, correctly labeled.
- **The audit table (admin).** Same five columns as the staff table. User shows the employee ID with the name under it, Role shows Administrator / Unit Head / Staff, and a row with no signed-in actor (a failed sign-in) shows "Not signed in" instead of an invented user. Five rows first, "Show more" adds five, up to 25. If the trail can't load, an error shows and the rest of the page still works.
- **Staff are unchanged:** they still see only their own recorded actions and never call `/audit-trail` or `/departments`.

### Real bug found

- **A horizontally scrollable table wasn't keyboard-reachable.** The audit table scrolls sideways below about 800px wide, and axe flagged it at 768px (`scrollable-region-focusable`). This had been in the staff version since Part O and was never tested at that width. Fixed for both roles by making the scroll region focusable with a label.

### Verified

- 23 mocked-API behavior checks (trail fetch and row contents, honest "Not signed in", Show more, the signature / change-request / login-history views and Back, the shared password and two-factor windows, the error path, and that staff never call the admin endpoints), axe-core 0 violations at 1920 / 1366 / 1100 / 768 / 390 including the open modal and the signature view, and no second scrollbar. Text is at the staff scale (13px).
- The dev servers were restarted so the new route is live (it returns 401 without a token).

---

## Current status

Everything through Part D is live on `main` and deployed (Vercel + Railway, linked and confirmed working via a real cross-origin login). Parts E and F (real 2FA, defaulting on) are live on `main` as of `497dff6`. Part G (the production login-hang incident: bounded/non-blocking email sends, then the IPv4-forcing attempt, then the full Brevo provider swap) is pushed as `fc9b024`/`98cb866`/`ab4a29b` and **confirmed working live in production** — a real deployed login now completes end to end with 2FA, including actual email delivery. Parts H through J (Enter-key submit, Hep B Titers, and the staff landing page + Upload redesign) are all complete and fully verified live — through both `curl` and the real browser UI — but **not yet committed/pushed**, pending the user's go-ahead per the standing push-confirmation rule. Part K (the sidebar → single top-band header plus the staff dashboard rebuilt to match the mockup) is complete, checked side by side against the mockup at 1440px and screenshotted at 1024 to 1920px, and also unpushed. The Upload screen's own mockup pass is next. One deliberately-deferred open item on record: department compliance rate/pending-count are currently not shown anywhere on the desktop staff dashboard (Part J), left that way at the user's explicit request, to revisit later. No other outstanding failures or known-broken state as of this entry.
