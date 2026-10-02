# VMMC TB DOTS Health Management System — System Documentation

This is the top-level "understand the whole system" document. Read this first for the big picture, then go deep on one half via:
- [`BACKEND_ARCHITECTURE.md`](BACKEND_ARCHITECTURE.md) — the NestJS/Supabase API
- [`FRONTEND_ARCHITECTURE.md`](FRONTEND_ARCHITECTURE.md) — the Next.js UI

The original build plan this whole system was executed against is [`VMMC_TBDOTS_BuildSpec.md`](../VMMC_TBDOTS_BuildSpec.md) — worth reading once for the *requirements reasoning* (what conflicts existed between the original documentation and the inherited mock frontend, and how each was resolved) that these architecture docs don't repeat.

> This document (and its two companions) lives in `docs/`, but all repo-relative paths mentioned below (`src/...`, `supabase/...`, etc.) are relative to `vmmc backend/` or `vmmc frontend/` as indicated — not to this file's own location.

---

## 1 · What this system is, in one paragraph

Veterans Memorial Medical Center needs to track TB (and related occupational-health) compliance for its personnel: annual chest X-ray / GeneXpert clearance tied to each employee's birthday, plus pre-employment screening, post-exposure-prophylaxis follow-up, and quarterly immunizations. The academic core is **ITIL 4 Monitoring & Event Management (M&E)** — a real, running surveillance engine that watches every employee's compliance timeline and clinical results, classifies what it sees into Informational/Warning/Exception events, and drives real consequences (status changes, tri-channel notifications, escalations to unit heads) from those events. Everything else in the system — auth, uploads, dashboards, reports — exists in service of that engine.

---

## 2 · The two repos, and how they connect

```
Capstone VMMC/
├── vmmc backend/     NestJS API — the only thing that talks to Supabase
├── vmmc frontend/    Next.js UI — talks only to the backend's REST API
└── VMMC_TBDOTS_BuildSpec.md
```

They are **fully independent deployable units** connected by exactly one contract: the backend's REST API (documented live at `/api/docs`, and exported statically to `vmmc backend/openapi.json`). The frontend never talks to Supabase directly — no Supabase client, no Supabase keys anywhere in the frontend repo. This matters for the security story (§6): a compromised frontend build can't leak a service-role key, because it never has one.

```
 Browser                    vmmc frontend                  vmmc backend                  Supabase
┌─────────┐   HTTPS       ┌──────────────┐   fetch()     ┌──────────────┐  supabase-js  ┌──────────┐
│  User    │ ───────────▶ │  Next.js     │ ────────────▶ │  NestJS API  │ ────────────▶ │ Postgres │
│          │ ◀─────────── │  (App Router)│ ◀──────────── │  (RBAC, M&E) │ ◀──────────── │ Auth     │
└─────────┘               └──────────────┘               └──────────────┘               │ Storage  │
                                                                                          └──────────┘
```

**Local dev, both repos running together:**
```bash
# one command from the repo root (see package.json) — runs both via `concurrently`
npm run dev

# or manually, in two terminals:
# terminal 1
cd "vmmc backend" && npm run start:dev        # http://localhost:8443/api

# terminal 2
cd "vmmc frontend" && npm run dev             # http://localhost:3000
```

**Testing, at a glance:**
- Each repo owns its own **unit tests**, run independently: `vmmc backend` (`npm test`, Jest, 51 tests) and `vmmc frontend` (`npm test`, Vitest, pure `src/lib/*` logic only — no jsdom/component rendering).
- **End-to-end tests are consolidated in one place**: `e2e/` at this repo's root, run via `npm run test:e2e`. `e2e/api/` hits the backend directly over real HTTP (Playwright's `request` fixture, no browser); `e2e/ui/` drives the real frontend in a real browser. One Playwright suite, one command, covering both repos — not split per-repo like the unit tests are. See `BACKEND_ARCHITECTURE.md` §9 for why the backend's old NestJS-generated e2e test was retired rather than physically moved here (a real Node module-resolution wall, not just preference).
The backend's `CORS_ORIGIN` env var must match the frontend's actual origin, and the frontend's `NEXT_PUBLIC_API_URL` must point at the backend — both `.env.example` files document the local-dev defaults, which already match each other out of the box.

---

## 3 · One request, traced end to end

The clearest way to actually understand how the two halves fit together is to trace one real user action all the way through both layers. Take the highest-stakes one: **an admin approves a document that turns out to be a positive result.**

1. **Frontend (`Upload.tsx`, admin's Review Queue):** admin clicks Approve on a pending document, with their saved digital signature attached. `api.patch('/documents/:id/review', { action: 'approve', signatureId })` — the shared API client (frontend docs §5) attaches the bearer token automatically.
2. **Backend, `SupabaseAuthGuard`:** verifies the token by calling `supabase.auth.getUser(token)` (this project uses asymmetric ES256 signing keys, so there's no local secret to verify against — see backend docs §4), attaches the caller's `EmployeeContext` to the request.
3. **Backend, `RolesGuard`:** confirms the caller is ADMIN.
4. **Backend, `DocumentsService.review()`:** validates the signature belongs to this admin, marks the document `APPROVED`, links it to the employee's current-cycle `compliance_records` row, and — **synchronously, in the same request** — calls `EventClassifierService.classify()` on that compliance record.
5. **The M&E engine (backend docs §5):** sees the newly-approved document is positive, emits an `EXCEPTION`/`CLINICAL_ALERT` event, sets `clinical_status = CRITICAL` on the compliance record. Because the *timeline* dimension is checked independently in the same pass, if this employee also happened to be past their deadline, an `EXCEPTION`/`SLA_BREACH` fires too — same event, two independent reasons.
6. **Notification dispatch (backend docs §6):** the classifier's `emit()` hands the freshly-inserted event straight to `NotificationDispatcherService`, which fans it out to `IN_APP` (always), `SMS`, and `EMAIL` — logged-only unless real provider credentials are configured, so this is fully exercisable in a demo at zero cost.
7. **Escalation:** because the event is Exception-tier, `EscalationsService.createForEvent()` opens an escalation addressed to the employee's department's unit head.
8. **Back on the frontend:** the admin's Review Queue list drops the now-resolved item (it re-fetches `GET /review-queue`, which only returns `PENDING` documents). Separately and independently, the affected unit head — next time they load `Dashboard.tsx` — sees the new escalation in their escalation list and can acknowledge it; the affected employee sees a new notification in the bell dropdown (`GET /me/notifications`) and, if SMS/email credentials are live, a real message.

Every one of those steps is a real, currently-working code path — not a description of an intended design. If you want to see it happen locally: log in as `VMMC-23-0001` (the seeded admin), approve a pending document with a positive result recorded, then log in as the affected employee's unit head and watch the escalation appear.

---

## 4 · How to build a full-stack feature yourself, start to finish

§3 traced a request *through* the system as it already exists. This section is the reverse: how a feature actually gets **built** across both repos, using a real one that shipped this way — the admin Profile's "Performance Overview" card, which went from three hardcoded numbers (`Reviews: 142`, `Approvals: 128`, `Uptime: 99%`) to real data end to end.

**1. Decide what real data actually answers the question.** "Uptime" was the first thing to go — it's a *system* metric, and it was sitting on a card titled "Performance Overview" for one specific *admin*. It never had a real source to begin with. The fix wasn't to fake an uptime number; it was to recognize the stat itself was the wrong thing to show there, and replace it with something that actually is a per-admin performance number: their approval rate.

**2. Build the backend piece first, in isolation, and prove it with curl before writing any UI.** (Full mechanics: backend doc §11.3.)
```ts
// vmmc backend/src/me/profile.service.ts
async getPerformanceStats(currentUser: EmployeeContext) {
  const { count: reviews } = await client.from('documents').select('id', { count: 'exact', head: true })
    .eq('reviewed_by', currentUser.id);
  const { count: approvals } = await client.from('documents').select('id', { count: 'exact', head: true })
    .eq('reviewed_by', currentUser.id).eq('review_status', 'APPROVED');
  return { reviews, approvals, approvalRate: Math.round((approvals / reviews) * 100) };
}
```
```ts
// me.controller.ts
@Get('performance-stats')
@Roles('ADMIN')
getPerformanceStats(@CurrentUser() employee: EmployeeContext) {
  return this.profileService.getPerformanceStats(employee);
}
```
Then, **before touching the frontend at all**: `npx tsc --noEmit`, restart the dev server, `curl` it with a real admin token and confirm real numbers come back, `curl` it with a staff token and confirm a 403. This order matters — verifying the backend in isolation means that when the frontend integration doesn't work, you already know the bug is on the frontend side, not "somewhere in this whole stack."

**3. Wire the frontend to the now-proven-working endpoint.** (Full mechanics: frontend doc §9.2–9.3.)
```tsx
// vmmc frontend/src/screens/Profile.tsx
const [performanceStats, setPerformanceStats] = useState<PerformanceStats>({ reviews: 0, approvals: 0, approvalRate: 0 })
useEffect(() => {
  if (role !== 'admin') return
  api.get<PerformanceStats>('/me/performance-stats').then(setPerformanceStats).catch(() => {})
}, [role])

const adminStats = [
  { label: 'Reviews', value: String(performanceStats.reviews), color: '#1f3151' },
  { label: 'Approvals', value: String(performanceStats.approvals), color: '#008d46' },
  { label: 'Approval Rate', value: `${performanceStats.approvalRate}%`, color: '#008d46' },
]
```
Note what *didn't* change: the JSX that renders `adminStats.map(s => ...)` — three call sites, unmodified. Structuring the fetched data into the exact same shape the old hardcoded array had is what makes this a small, safe diff instead of a rewrite of every render site.

**4. Verify the integration in an actual browser, not just `tsc`.** Type-checking proves the code compiles; it proves nothing about whether the right data reaches the right pixels. The real verification here was logging in as the seeded admin and confirming the card showed the *same* numbers curl had already shown in step 2 — closing the loop from "the backend returns correct data" to "the human looking at the screen sees correct data."

This four-step shape — **backend logic, proven in isolation → frontend wiring, reusing the existing render shape → browser verification that closes the loop** — is how every single feature in this system's build history was added, not just this one. If you're about to build something new, this is the order to do it in.

---

## 5 · RBAC, end to end

Three roles exist system-wide: `STAFF`, `UNIT_HEAD`, `ADMIN`. The frontend and backend each enforce this, but **only the backend's enforcement is trustworthy** — the frontend's role-based UI branching (`role === 'admin' ? ... : ...`) is a UX convenience, not a security boundary, since a client can always be tampered with. Every sensitive read/write is re-checked server-side regardless of what the UI sent, at two layers (backend docs §4):

- Coarse: `@Roles('ADMIN')` on routes that are flatly role-restricted.
- Fine-grained: in-handler checks (`assertRecordAccess`) that compare the *target* record's owner/department against the *caller's* identity — this is what stops a UNIT_HEAD from widening their own department-scoped view by editing a query string, and it's specifically what the audit interceptor is watching for (backend docs §10) when it logs a blocked cross-employee read.

---

## 6 · Security & compliance posture

- **Transport & at-rest encryption:** TLS in transit (Supabase's managed endpoints + this app's own HTTPS-capable deployment), AES-256 at rest — both are Supabase-managed-Postgres platform guarantees, not something this codebase implements itself.
- **RBAC everywhere**, enforced server-side only (§5).
- **Immutable audit trail:** every request gets an actor/action/entity/IP/user-agent/timestamp row in `audit_logs`, and both `audit_logs` and the M&E `events` table are **append-only at the database level** — a Postgres trigger rejects `UPDATE`/`DELETE` outright, not just "the app doesn't do that."
- **PHI-conscious logging:** the audit interceptor and the global exception filter both deliberately log only metadata (who, what action, what path) — never request/response bodies, which is where exam results and contact info would otherwise leak into logs.
- **Upload gateway:** magic-byte file-type sniffing (never trusts client-supplied mimetype/extension) + a hard 5MB cap, before anything touches storage.
- **PIN/password:** bcrypt-hashed PINs, real Supabase Auth-backed passwords (never stored by this app directly).
- **Data privacy:** per-employee configurable privacy toggles (`employees.privacy_settings`), matching RA 10173 (Philippine Data Privacy Act) / NPC 2022-01 concerns named in the original requirements.

---

## 7 · How this was actually built — the phase history

This system was built in **12 phases**, each one a complete vertical slice (backend capability + frontend wiring + live browser verification) rather than "build the whole backend, then the whole frontend." That order is worth understanding because later phases assume earlier ones are solid:

| Phase | What shipped |
|---|---|
| 0 – Foundations | Both repos scaffolded; typed API client with retry/timeout wired end to end (`GET /health` renders "ok" in the browser) |
| 1 – Schema | Full Postgres schema + seed data (4 departments, ~20 employees) |
| 2 – Auth + RBAC | Real login, JWT storage, role-gated routes |
| 3 – Registry + SLM | Compliance Tracker live with real SLA-cycle dates; STAFF-vs-UNIT_HEAD visibility gating |
| 3.5 – API contract | Swagger published, idempotency-key convention established |
| 4 – Upload gateway | Real file uploads, 5MB/type enforcement, idempotent retries |
| 5 – ★ M&E engine | The classifier itself: three event tiers, both Exception triggers, de-duplication, cron + manual scan |
| 6 – Review + Signature | Admin approve/reject flow, digital signature capture |
| 7 – Notifications + Escalation | Tri-channel dispatch, escalation lifecycle, notification bell |
| 8 – Dashboards + Reports | Real aggregate figures replacing every dashboard mock number; 3 institutional reports |
| 9 – Other 3 tracking areas | Pre-Employment, PEP logs, Quarterly Immunization — CRUD + scan integration |
| 10 – Audit + Security | Global audit interceptor, append-only DB enforcement, Devices/Activity Logs/Login History/PIN/Password all wired to real endpoints |
| 11 – SQA | 47 unit tests, a real concurrency bug found and fixed under load testing, Slow-3G evidence |
| 12 – Production-ready | Consistent error shape, structured logging, OpenAPI handoff artifact, production build verified |

Two follow-up passes after Phase 12 closed out the last known mock gaps: the Compliance Tracker's department filter (now fetched live from `/departments` instead of hardcoded) and the admin Profile's Performance Overview card (now real review/approval counts from the `documents` table, with the old "Uptime" stat — which never made sense as a *personal* performance metric — replaced by a real, derivable Approval Rate).

**A genuinely interesting finding from Phase 11 worth knowing about even if you don't read the backend doc in full:** the 50-concurrent-user stress test initially produced ~40% spurious login failures on *correct* credentials. The bug wasn't in any business logic — it was a shared, cached Supabase Auth client being reused across concurrent sign-in calls, corrupting internal state under load. The fix (construct a fresh client per sign-in) is a two-line change with an outsized lesson: **sequential manual testing will never catch a concurrency bug**, no matter how thoroughly you click through the app yourself.

A third pass, after both follow-ups above, tightened up dev experience and real-world performance rather than adding features: the backend and frontend swapped dev ports (backend → 8443, frontend → 3000, matching the more conventional expectation that "the app" lives on 3000) and gained a root-level `npm run dev` that boots both together; a second identity-display bug was found and fixed — `Layout.tsx`'s header pill and `Profile.tsx`'s profile card still had `"Juan Dela Cruz, RN"` / `"Dr. Arturo V."` hardcoded from the original Figma mockup, never wired up when the rest of `Profile.tsx` moved to real data, so every logged-in user saw someone else's name — fixed by sourcing both from the same real fetched employee record, with real `birthDate`/computed age also wired through to the mobile profile card; a real performance problem was found and fixed in the Dashboard/Compliance Tracker endpoints (see the backend doc §9 for the two root causes and the before/after numbers); and the "Loading…" text on those same two screens was replaced with shape-matched skeleton placeholders (`vmmc frontend/src/components/Skeleton.tsx`).

A fourth pass focused on documentation, git hygiene, and testing infrastructure rather than app features: the three architecture docs moved into a shared `docs/` folder (previously split across both repos) alongside a new `HANDOFF.md` snapshot; `.gitignore` files were added/hardened in all three locations; real OTP email delivery was wired into the forgot-password flow (`AuthService.forgotPassword()` — previously the code only ever logged the code server-side, despite the SMTP infrastructure already existing for M&E notifications, per a stale "wired in Phase 7" comment that never actually got followed through when Phase 7 shipped); and end-to-end testing was consolidated into one `e2e/` suite at the repo root (Playwright — `e2e/api/` hits the backend directly, `e2e/ui/` drives the real frontend), replacing the backend's old NestJS-generated Jest e2e smoke test. That old test genuinely could not just be *moved* into `e2e/` — a real Node module-resolution wall (`@nestjs/testing` and the whole NestJS runtime only resolve from `vmmc backend/node_modules`), not merely a style preference; see backend doc §9. A Vitest layer was also added for the frontend's pure logic (`src/lib/format.ts`, `src/lib/auth.ts`) — those functions were deliberately extracted out of the screen components that used to define them inline, specifically so they'd be unit-testable without dragging React/Next.js into the test.

A fifth pass fixed a real audit-logging bug and closed out a UI exploration cleanly. The Compliance Tracker's staff-facing "My Compliance Record" card went through several iterations — a second "Next Compliance Due" card, then a merge into one wider card with due-date and Recent Activity columns — before being reverted back to its original single-card layout on request; the only lasting artifacts from that exploration are the `formatFullDate`/`formatLogTime` extractions into `src/lib/format.ts` (now shared by `Dashboard.tsx` and `Profile.tsx`) and the audit-logging fix described next, both kept because they're independently useful regardless of that card's final layout. The bug: `AuditInterceptor` labeled every `/api/me/*` request identically ("Accessed Profile"), because it derived `entity_type` from only the URL's first path segment — fixed by extracting a unit-tested `deriveEntityType()` that splits the `me` module by its actual sub-resource (`me-profile`, `me-devices`, `me-activity-logs`, ...); see backend doc §9 for the full story.

A sixth pass made the repo actually team- and GitHub-ready, done deliberately in three separate phases rather than all at once. Phase 1: purged "you (and your groupmates)" language from every doc in favor of treating the team as one unit; added a real "what's left" section to `HANDOFF.md` (§6); and — the most structurally significant part — created a root `AGENTS.md`/`CLAUDE.md` establishing a standing rule that docs get updated as *part of* finishing a change, not as a follow-up task, which is why this very paragraph exists. Phase 2: the root `.gitignore` was extended to exclude `VMMC_TBDOTS_BuildSpec.md` and the whole `.claude/` folder from version control by request — the trade-off worth remembering is that `.claude/commands/` (the `/dev-restart` and `/verify` custom commands) and the permission allowlist won't automatically reach anyone who clones the repo, since they're no longer pushed. Phase 3: a third real test account was added — `VMMC-25-0023`, a `UNIT_HEAD` (Dietary) — which let the department-scoped Staff Registry view get exercised through a real login for the first time, and incidentally confirmed the fifth pass's card revert hadn't broken that view's shared `StaffCard` component.

A seventh pass integrated a groupmate's fork/branch (`login_update` — signup + first-login forced password reset) rather than adding a new feature from scratch, and is the reason a full `/verify` sweep earns its keep even on someone else's already-committed code: the branch's single commit passed a read-through review but failed at `npx tsc --noEmit` and, once that was fixed, still failed every login-dependent e2e test. Both root causes and their fixes are written up in full in the backend doc §9 (the fourth and fifth "real bug" callouts) — in short, a TypeScript interface not declaring a field the query already returned, and an `AuthService` query selecting `employees.must_change_password` from a column that had never actually been migrated into the database, which failed silently and surfaced only as a generic "Invalid Employee ID or password." on every login attempt. As of this pass the merge lived on a local `merge-login-update` branch, verified green (`tsc` × 2, unit tests × 2, 16/16 e2e) — but "16/16 e2e passing" turned out to overstate things, see below.

An eighth pass picked up where the seventh left off — bringing `Signup.tsx` and `FirstLoginReset.tsx` in line with this app's two-tree mobile/desktop convention (§6), since they were the only screens in the whole auth flow still using a single fluid layout instead of matching `Login.tsx`/`ForgotPassword.tsx`'s genuinely distinct mobile-native treatment — and found the pass's real prize along the way: **the entire first-login flow was completely unreachable, on every device, and the seventh pass's "16/16 e2e" had never actually caught it** because no e2e test drove a real signup or first-login-reset flow end to end, only pre-existing accounts with the flag already cleared. `useAuthGuard('auth')` on `/first-login` redirects to `/first-login` whenever `requiresPasswordChange()` is true — correct for *other* pages (send them to finish their password reset), catastrophic for the reset page itself, which redirected to itself forever and never called `setReady(true)`, so the component permanently rendered `null`. A real logged-in user landing there after signup would see a blank white screen with no error, no console warning, nothing to act on. Confirmed by flipping the real `VMMC-25-0021` test account's `must_change_password` to `true` via the service-role key, driving an actual login through the browser, and watching the page render zero characters of visible text — then confirmed fixed the same way, restoring the account's original password and flag afterward. Fixed with a dedicated `'first-login'` guard mode that only redirects away once `requiresPasswordChange()` is *false* (nothing left to do here), rather than reusing `'auth'`'s rule verbatim. This is the same lesson as the sixth pass's Layout/Profile hardcoded-name bug and the fifth pass's audit-logging bug: a screen can look finished, pass a type check, and even pass a test suite, and still be completely broken for a real user, if the one path that actually exercises it was never driven end to end.

A ninth pass widened the eighth pass's Dashboard-only tap-target fix to the whole app, per a direct follow-up ("buttons are too small even some text... to everything in the system"): every screen's `fontSize` under 12px (~195 instances) floored to 12, and every undersized `<button>`/`motion.button` across all nine screens brought up to the WCAG 44×44px target, with one deliberate exception left in place (an inline link within a sentence, which is WCAG's own carved-out exception). Two real mistakes were caught mid-pass rather than after: growing the notification bell's tap target would have detached its unread-count badge (fixed with an inner positioning wrapper), and adding `display: 'flex'` to the hamburger menu button would have permanently defeated the `lg:hidden` Tailwind class it depends on for responsive visibility — this doc's own §3 gotcha about inline styles beating classes, rediscovered the hard way and then avoided. Verified against the real rendered DOM at both viewports, not estimated. A small, unrelated layout bug was also found and fixed while in the area: the admin Dashboard's `Total Personnel`/`Critical Cases` card row was missing the `marginBottom: 24` every sibling section already had, so it sat flush against the Reports card below it.

A tenth pass tightened document access per the same Aug 31 feedback batch: `assertDocumentAccess()` previously let any STAFF member see every document from their own department, which the feedback flagged as broader than intended ("only department head, TB DOTS staff, and HR"). The fix needed a real decision first — "TB DOTS staff" didn't correspond to anything in the data model (departments were just OPD/RAD/DIET/ADM) — resolved by adding a real `TB DOTS Program` department (`TBDOTS` code) rather than inventing a new role dimension, keeping it consistent with how `HR` was already special-cased. The tightened rule: ADMIN, your own documents, your department head, or your own department being `HR`/`TBDOTS` — a plain STAFF colleague in the same department no longer qualifies on that basis alone. Verified with a live differential check against the real API (ADMIN still sees the full queue; a STAFF account in an unrelated department gets a clean empty result, not an error) plus a rewritten `assert-access.spec.ts` that directly encodes the new policy, including the case the old tests explicitly permitted and the new ones now explicitly forbid.

An eleventh pass closed out the last item from the Aug 31 feedback batch worth building solo: the "change request tracker," which had no scope beyond a cut-off adviser note ("specify..."). Resolved as an employee-record change-request workflow — `job_title`, `birth_date`, `employment_status`, and `department` now require admin approval instead of a direct edit, since `PATCH /me/profile` only ever covered `fullName`/`email`/`phone` and there was genuinely no way to correct a wrong `birth_date` (which drives the whole SLA cycle-date calculation) short of a raw DB edit. New `change-requests` module, reusing the existing `review_status` enum rather than inventing a parallel one — see backend doc §4. Verified live rather than with new unit tests: submitted a real request as the real STAFF test account, confirmed it surfaced in both the requester's own list and the admin queue, approved it and confirmed `employees.job_title` actually changed; separately submitted and rejected a second request and confirmed it didn't; confirmed re-reviewing an already-decided request fails with a clear 400 instead of silently no-op'ing. The frontend integration surfaced a real, non-obvious gotcha in this codebase's mobile/desktop pattern: `Profile.tsx`'s menu-row config arrays (`mobileMenuRows`/`adminMenuRows`) are only ever rendered inside the `sm:hidden` mobile tree — the desktop tree hand-builds its own separate set of cards, so a new entry pushed onto those arrays is reachable on mobile the instant it's written but silently unreachable on desktop until a matching card is added there too. Caught by testing both viewports rather than just one — see frontend doc §6 for the full writeup, now flagged so the next person adding a menu item doesn't lose the same hour rediscovering it.

A twelfth pass tackled the last item from the same Aug 31 batch that had a genuinely unresolvable literal reading: "reduce the upperboard (protecting those who care) as background or streamline as compact welcome bar." A thorough search — live screens, every source file, and the original Figma design-spec imports — turned up zero matches for "protecting those who care" anywhere in the codebase, confirming it was never existing text to locate. Read instead as a suggested tagline for a redesigned header rather than a location, with "streamline as compact welcome bar" taken as the actionable half of the two alternatives offered. Applied to `Layout.tsx`'s persistent top bar — the one header present on every single screen, the closest match for "upperboard" in a system with no other persistent chrome. Height trimmed 68px→60px; the right-side institutional block ("Veterans Memorial Medical Center" / "Admin Management Portal") — which duplicated context already visible in the left branding and the profile pill's own role label — replaced with a compact "Welcome back, {first name}" greeting; the left branding's second line (the compliance-registry tagline) dropped, collapsing it to one line. Verified visually at three widths (1280px, 800px tablet, and confirming the `hidden lg:block` welcome text degrades gracefully rather than crowding the bar at narrower widths) plus a full `/verify` re-run (19/19 frontend unit, 16/16 e2e) after. Flagged clearly in the handoff doc that this is an interpretation of ambiguous feedback, not a confirmed match to adviser intent — the change is isolated to one component and cheap to revisit if wrong.

A thirteenth pass closed out the PII information index, the last Aug 31 feedback item deferred at kickoff pending a scope decision: a downloadable CSV report matching the app's three existing reports, or a real on-screen table like the feedback's own word "table" suggests. The user chose the on-screen table. New `PiiIndex.tsx` screen at `/pii-index`, its own new 5th entry in both admin nav arrays (desktop sidebar and mobile bottom tab, which turned out to have room for a fifth icon without crowding), and a new `GET /reports/pii-index` endpoint living in the existing `reports/` module rather than a whole new one, since it's fundamentally the same shape as the other three reports — just ADMIN-only instead of UNIT_HEAD-inclusive, given it's a hospital-wide personal-data registry rather than department-scoped compliance figures (see backend doc §4). `employmentType` reuses `parseEmploymentTypeFromEmployeeId()` rather than adding a stored column, keeping one source of truth for what an employee ID format means. Verified live end to end: real ADMIN login sees all 23 active employees with correct COS/Permanent badges; search-filtering by department narrows correctly; CSV export produces a real downloadable file with matching headers and row count (confirmed via Playwright's actual download event, not just a click with no verification of output); a real STAFF login hitting the route directly sees a clean "Admin access only" message client-side rather than a raw 403, and the backend independently rejects the same request with a 403 if attempted directly. Full sweep after: 19/19 frontend unit tests, 16/16 e2e.

---

## 8 · Map: "if you want to understand X, go read Y"

| You want to understand... | Go read... |
|---|---|
| How the M&E engine classifies events | Backend doc §5, then `vmmc backend/src/monitoring/event-classifier.service.ts` + its `.spec.ts` |
| Why someone can be "on-time yet CRITICAL" | Backend doc §3 (the two-dimension status model) |
| Why RBAC can't be bypassed from the browser | This doc §5, then backend doc §4 |
| Why styles are inline but layout is Tailwind | Frontend doc §3 |
| Why every screen has two near-duplicate JSX blocks | Frontend doc §6 |
| How tri-channel notifications work without costing money in a demo | Backend doc §6 |
| What actually broke under concurrent load, and how it was found | This doc §7, then backend doc §9 |
| How to actually build a new feature across both repos | This doc §4 |
| The original requirements-vs-mock conflicts and how each was resolved | `VMMC_TBDOTS_BuildSpec.md` §3 |
