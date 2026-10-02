# VMMC TB DOTS — Backend Architecture

This document exists so the team can open this repo cold and actually understand *why* it's built the way it is — not just where the files are. Read it top to bottom once, then use it as a reference. Pair it with [`SYSTEM_ARCHITECTURE.md`](SYSTEM_ARCHITECTURE.md) for the whole-system view and [`FRONTEND_ARCHITECTURE.md`](FRONTEND_ARCHITECTURE.md) for how the UI consumes this API.

> This document lives in `docs/`, but all repo-relative paths mentioned below (`src/...`, `supabase/...`, `scripts/...`, etc.) are relative to `vmmc backend/`, not to this file's own location.

---

## 1 · What this backend actually is

A **NestJS** REST API backed by **Supabase** (managed Postgres + Auth + Storage), built to run the compliance-surveillance side of VMMC's TB DOTS program. The academic anchor is **ITIL 4 Monitoring & Event Management (M&E)**: a continuous engine that **detects → classifies → logs → responds** to compliance state changes, emitting one of three event tiers (Informational / Warning / Exception). Everything else in the backend — auth, uploads, dashboards, notifications — exists to feed that engine or act on what it produces.

**Stack choices and why:**
- **NestJS** — gives structure (modules/controllers/services/guards) for a system with real RBAC and many cross-cutting concerns (audit, idempotency, validation), without hand-rolling middleware plumbing.
- **Supabase, no ORM** — `@supabase/supabase-js` talks to Supabase's PostgREST layer directly. No Prisma/TypeORM. This means every query is a real, readable `.from(table).select(...)` call — more verbose than an ORM, but there's no query-generation magic to debug, and RLS/Storage/Auth all come from the same platform for free.
- **No raw Postgres connection anywhere** — the backend never opens a direct `pg` connection. Every read/write goes through Supabase's REST gateway, which means it's automatically pooled on Supabase's side (relevant for the Phase 11 stress test, see §9).

---

## 2 · Module map

```
src/
├── auth/          Login, RBAC guards, JWT verification, password reset
├── audit/          Global request-audit interceptor + service (append-only audit_logs)
├── supabase/        The one place a Supabase client is constructed
├── departments/      Trivial CRUD — the 4 seeded departments
├── compliance/       Employee registry + SLA evaluator + Compliance Tracker/Dossier
├── documents/        Upload gateway (5MB/type/idempotency) + admin Review Queue
├── signatures/       Digital signature capture (admin sign-off on approvals)
├── monitoring/  ★    THE M&E ENGINE — event classifier + cron/manual scan trigger
├── notifications/    Tri-channel dispatch (in-app / SMS / email) off the back of events
├── escalations/      Exception-tier events -> escalation rows -> unit-head acknowledge/resolve
├── dashboard/         Role-branched aggregate figures for /dashboard
├── reports/           4 institutional reports (delinquency, clearance summary, bio-matrix, PII index)
├── tracking/          The other 3 tracking areas: Pre-Employment, PEP logs, Immunizations
├── me/                Self-service: profile, PIN/password, devices, activity/login history
├── change-requests/   Request-and-approve workflow for fields that aren't self-service editable
├── health/            /health, /health/ready
├── common/            Shared: exception filter, idempotency decorator, access-control helper
├── config/            Env-var validation (class-validator)
└── test-utils/        Shared Supabase-chain mock for unit tests
```

Every feature module follows the same shape: `*.module.ts` (wiring), `*.controller.ts` (HTTP layer, thin), `*.service.ts` (real logic), `dto/*.ts` (request validation via `class-validator`). If you're looking for business logic, it's always in the service, never the controller.

---

## 3 · Data model — the schema is the source of truth

Full schema: `supabase/migrations/20260716000000_init_schema.sql` (+ five follow-up migrations). Read it before reading any service code — every service is just structured queries against these tables.

**The two-dimension status design (the single most important modeling decision in this system):**

```sql
status            compliance_state  -- SLA-timeline: PENDING | NON_COMPLIANT | OVERDUE | COMPLIANT
clinical_status   clinical_status   -- clinical outcome: PENDING | CRITICAL | COMPLIANT
```

These live on `compliance_records` and are **independently owned**: `status` is entirely engine-owned (only the classifier ever writes it, driven by dates), `clinical_status` is review/signature-owned (only changes when an admin approves/rejects a document with a result). This is why someone can be **on-time yet CRITICAL** (submitted early, but the result was positive) or **COMPLIANT yet was briefly OVERDUE** earlier in the cycle (cleared late). If you only remember one modeling decision from this whole codebase, remember this one — it's the thing a shallower design would collapse into a single "status" field and lose real information.

**Core tables at a glance:**

| Table | Owns | Written by |
|---|---|---|
| `employees` | Identity, role, department, PIN hash, privacy settings | Self-service (`me/`), admin (`departments/` seed) |
| `sla_definitions` | Configurable SLA cadence per tracking type (reminder lead time, recurrence) | Seed data only |
| `compliance_records` | One row per employee per cycle year — `status`, `clinical_status`, computed dates | `compliance/` (creation) + `monitoring/` (status mutation) |
| `documents` | Uploaded CXR/GeneXpert evidence, review lifecycle | `documents/` |
| `digital_signatures` | Admin's saved signature PNGs | `signatures/` |
| `events` | **Append-only** M&E event log | `monitoring/` only — nothing else ever writes here |
| `notifications` | One row per channel per dispatched event | `notifications/` |
| `escalations` | Opened on Exception-tier events, acknowledge/resolve lifecycle | `escalations/` |
| `devices` / `audit_logs` | Profile > Devices, and the global audit trail (`audit_logs` is also **append-only**) | `me/`, `audit/` |
| `pep_logs` / `immunizations` / `pre_employment` | The other 3 tracking areas | `tracking/` |
| `change_requests` | Request-and-approve queue for non-self-service employee fields | `change-requests/` |

Append-only is enforced two ways: by convention (no service ever calls `.update()`/`.delete()` on `events` or `audit_logs`), **and** at the database level — `supabase/migrations/20260802000000_audit_privacy.sql` adds a Postgres trigger that raises an exception on any `UPDATE`/`DELETE` against either table. The convention could be broken by a bug; the trigger can't be.

---

## 4 · Auth & RBAC

**Identity:** Supabase Auth owns `auth.users` (email + password); `employees.auth_user_id` links a business-domain employee row to it. Login accepts an **Employee ID** (`VMMC-YY-NNNN`), resolves it to an email server-side, then does a normal password-grant sign-in against Supabase Auth.

**A non-obvious wrinkle worth understanding:** this Supabase project signs JWTs with **asymmetric ES256 keys**, not the legacy shared HS256 secret. That means the backend **cannot** verify a token locally with a static secret — `SupabaseAuthGuard` instead calls `supabase.auth.getUser(token)` on every request, which validates the token against Supabase's own Auth server. Slightly more network overhead than local verification, but it works regardless of the project's signing scheme and needed zero backend changes when this was discovered mid-build (see `env.validation.ts` — there's no `SUPABASE_JWT_SECRET` at all, deliberately, because it would be dead/misleading config).

**RBAC model — three roles:**

```ts
type Role = 'STAFF' | 'UNIT_HEAD' | 'ADMIN'
```

- **STAFF** — can only ever see their own records.
- **UNIT_HEAD** — department-scoped. Every query that accepts a department filter *ignores the client-supplied value for a UNIT_HEAD* and forces it to their own `departmentId` server-side — a UNIT_HEAD cannot widen their own view by tampering with a query string.
- **ADMIN** — unrestricted (this role absorbs both the "TB Head" clinical duties and system-administrator duties per the build spec's scope decision).

Enforced in two layers that compose:
1. **Coarse, route-level:** `@Roles('ADMIN')` + `RolesGuard` — some routes are ADMIN-only outright (e.g. reviewing documents).
2. **Fine-grained, in-handler:** `assertRecordAccess()` / `assertDossierAccess()` — for routes any authenticated role *can* hit (like a compliance dossier), the service itself checks whether *this specific* target record belongs to the caller, their department, or is fair game because they're ADMIN.

`src/common/assert-access.ts` is the shared version of that second check, reused across `compliance/`, `tracking/`, etc.

**Document access is deliberately narrower than general record access.** `assertDocumentAccess()` (also in `assert-access.ts`, used by `DocumentsService.getReviewQueue()`) used to allow any STAFF member to see every document from their own department — the Aug 31 feedback flagged that as too broad ("only department head, TB DOTS staff, and HR should access uploaded documents"). It now grants access only to: ADMIN, the employee's own documents, the department head (`UNIT_HEAD` of that department), and anyone whose *own* department code is `HR` or `TBDOTS` — a plain STAFF member outside those two department codes gets nothing beyond their own record, even for a colleague in the same department. `TBDOTS` is a real department (`TB DOTS Program`, migration `20260929000000_add_tbdots_department.sql`) added specifically so "TB DOTS staff" has something concrete to mean — no existing employees are auto-assigned to it, that's a real staffing decision, not something to infer from code.

**Not every employee field is self-service editable — some go through a request-and-approve workflow instead.** `ProfileService.updateProfile()` (`PATCH /me/profile`) applies `fullName`/`email`/`phone` immediately, no review. `job_title`, `birth_date`, `employment_status`, and `department_code` are consequential enough that they don't: `birth_date` drives the entire SLA cycle-date calculation (§3), and `department_code` changes who reviews someone's documents (per the rule above), so a silent self-edit could quietly break compliance deadlines or grant/revoke document access. `src/change-requests/` (`ChangeRequestsService`) is a small, self-contained module for this: `POST /change-requests` snapshots the field's current value server-side (never trusts a client-supplied "before"), inserts a `PENDING` row; `GET /change-requests/mine` is the requester's own history; `GET /change-requests` (ADMIN-only) is the triage queue; `PATCH /change-requests/:id/approve` is the *only* code path that actually writes the new value to `employees` — `reject` never touches the employee row at all, it just marks the request `REJECTED` with an optional `reviewNotes`. Reuses the existing `review_status` enum (`PENDING`/`APPROVED`/`REJECTED`) rather than inventing a parallel one, matching the document-review pattern already established elsewhere. Verified end to end live rather than with new unit tests: submitted a real request as a real STAFF account, confirmed it appeared in both the requester's own list and the admin queue, approved it and confirmed `employees.job_title` actually changed, then separately submitted and rejected a second request and confirmed the field did *not* change — plus confirmed re-reviewing an already-decided request is rejected with a clear 400, not a silent no-op.

**The PII information index (`GET /reports/pii-index`) is the one report that's ADMIN-only, not UNIT_HEAD-inclusive like the other three.** `ReportsController` is class-decorated `@Roles('UNIT_HEAD', 'ADMIN')`, but `getPiiIndex()` carries its own method-level `@Roles('ADMIN')`, which `RolesGuard`'s `reflector.getAllAndOverride()` resolves to the more specific method-level decorator — the same override mechanism already used to narrow `assertDocumentAccess()` below. Deliberately narrower than the compliance-focused reports (delinquency, clearance summary, biological matrix) because this one is a hospital-wide personal-data registry, not department-scoped compliance figures — PII exposure should default to the smallest audience, not inherit the same UNIT_HEAD/ADMIN split just because it lives in the same module. `employmentType` (COS vs. Permanent) is derived on read from the employee_id format via `parseEmploymentTypeFromEmployeeId()` — the same parser `assert-access.ts`/signup already use — rather than a separate stored column, so there's exactly one source of truth for what an employee ID format means.

**Login attempts are audited both ways.** A successful login writes `action: 'LOGIN'` (existing). Every failure path in `AuthService.login()` — employee ID doesn't resolve, wrong password, or correct credentials on the wrong portal — now also writes `action: 'LOGIN_FAILED'` via the same `AuditService.log()`, with the reason (`employee_not_found` / `invalid_credentials` / `wrong_portal`) and the attempted employee ID stashed in the row's `after` JSON. This previously didn't exist at all — `AuditInterceptor` globally skips `/api/auth/*` (it only handles authenticated requests), so failed logins left zero trail before this. `entity_id`/`actor_id` are `null` for the "employee not found" case since there's no real employee to attribute it to — that row still lands in the raw `audit_logs` table for security review, it just can't surface in any one employee's own Activity Logs (`ActivityService.listActivityLogs` filters by `actor_id`). `ActivityService`'s login-history query (`listLoginHistory`) still filters strictly to `action = 'LOGIN'`, so failed attempts never leak into that "your recent successful logins" view — they only show up in the broader Activity Logs feed for whichever employee the attempt resolved to.

---

## 5 · ★ The M&E engine — how it actually works

This is the graded core, so it earns its own section. Everything lives in `src/monitoring/`.

### 5.1 The SLA Evaluator (`src/compliance/sla-evaluator.ts`)

A pure function, `computeCycleDates(birthDate, cycleYear, firstReminderDaysBeforeBirthday)`. For the annual APE (chest X-ray) cycle: the deadline (`due_date`) is always the **last day of the employee's birth month**, computed as `Date.UTC(year, month+1, 0)` (day 0 of next month = last day of this month — a neat trick worth understanding rather than memorizing). The reminder window opens N days before the birthday. This function has zero dependencies and is exhaustively unit-tested (`sla-evaluator.spec.ts` walks every month of the year, a leap-year Feb 29 birthday, and window-open dates that fall in the *previous* month).

### 5.2 The Event Classifier (`src/monitoring/event-classifier.service.ts`)

**The single place in the entire codebase that writes to `events` or mutates `compliance_records.status`/`clinical_status`.** Every other piece of the system (documents, tracking areas) only ever *triggers* a call into this service — it never mutates those columns directly. That centralization is deliberate: it's what makes de-duplication and the two-dimension status model actually hold up under concurrent scans.

`classify(record, today)` runs two **independent dimensions** per compliance record on every scan pass:

**Timeline dimension** (drives `status`):
```
window_open_date reached, no submission  -> WARNING   / FIRST_REMINDER       -> status = NON_COMPLIANT
birthday reached, still no submission    -> WARNING   / BIRTHDAY_DUE         -> status = NON_COMPLIANT
  (then every 7+ days after)             -> WARNING   / WEEKLY_REMINDER      -> (no further status change)
due_date passed, still no clearance      -> EXCEPTION / SLA_BREACH           -> status = OVERDUE
90+ days past birthday, still no clearance -> EXCEPTION / THREE_MONTH_HR_NOTICE -> (no further status change)
```
`THREE_MONTH_HR_NOTICE` is `EXCEPTION`-tier (not `WARNING`) specifically so it opens an escalation like `SLA_BREACH`/`CLINICAL_ALERT` do — 90+ days non-compliant is the most severe state in the timeline dimension, and it deserves to show up in the admin escalations queue, not just an email the employee can miss. Its message is deliberately second-person ("You've been non-compliant...") since it's delivered to the employee's own inbox, not an HR distribution list — the system has no HR-contact field to send a third-person version to.

**Clinical dimension** (drives `clinical_status`, checked independently of the above):
```
latest approved document is positive     -> EXCEPTION / CLINICAL_ALERT    -> clinical_status = CRITICAL
latest approved document is negative     -> INFORMATIONAL / CLEARANCE_RECORDED -> status = COMPLIANT, clinical_status = COMPLIANT (unless already CRITICAL)
```

**De-duplication:** before emitting anything, the classifier fetches every existing `event_subtype` already recorded for this compliance record and skips any subtype already seen. This is what makes `classify()` safe to call twice, ten times, or a thousand times on the same record+day — the cron job re-running, or an admin hitting the manual scan button repeatedly, never produces duplicate events or duplicate notifications. This exact behavior is unit-tested in `event-classifier.service.spec.ts` (`de-dupes: re-running classify() after every subtype already exists emits nothing`).

**`lead_time_days`:** when a clearance is recorded, the classifier computes `due_date - today` in days and stores it on the record — positive means cleared early, negative means cleared late. This is the raw number Chapter 4's "average lead time" statistic would come from.

**The `emit()` pattern:** every classifier decision funnels through one private `emit()` method that (a) inserts the `events` row, (b) immediately hands the inserted row to `NotificationDispatcherService.handleEvent()`. So the moment an event is classified, tri-channel dispatch and (for Exceptions) escalation-opening happen synchronously in the same call — there's no separate polling job watching the `events` table for new rows to act on.

### 5.3 What triggers a scan

Two entry points, same underlying logic (`MonitoringService.runScan()`):
- **Cron** — `@Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, { timeZone: 'Asia/Manila' })` in `monitoring.service.ts`. Timezone is explicit and deliberate — "midnight" has to mean Philippine midnight for a PH-based deadline system.
- **Manual** — `POST /monitoring/run-scan` (ADMIN-only), used for demos and by the admin's "Run Compliance Scan" button on the Staff Directory screen.

`runScan()` does three things every time: (1) `ensureCurrentCycleRecords()` — idempotently provisions this year's `compliance_records` row for every active employee who doesn't have one yet, (2) classifies every current-cycle APE record, (3) checks `pep_logs`/`immunizations` for overdue follow-ups/doses and classifies those too (see §7).

### 5.4 The three Exception triggers, side by side

| | `SLA_BREACH` | `CLINICAL_ALERT` | `THREE_MONTH_HR_NOTICE` |
|---|---|---|---|
| Trigger | Birth-month deadline passed, no approved clearance | Approved result is positive (INFILTRATE / DETECTED) | 90+ days past birthday, still no approved clearance |
| Sets | `status = OVERDUE` | `clinical_status = CRITICAL` | (no status change — `SLA_BREACH` already set `OVERDUE`) |
| Can co-occur with others? | Yes — every dimension/threshold is checked every scan, independently | Yes | Yes (always follows `SLA_BREACH` for the same record, never instead of it) |

All three open an escalation (§6) and dispatch tri-channel. `SLA_BREACH`/`CLINICAL_ALERT` are unit-tested individually, and there's a specific test proving they can fire **in the same `classify()` call** for the same record (positive result *and* overdue at once) — exactly the "on-time yet CRITICAL" scenario the two-dimension model exists to represent correctly.

---

## 6 · Notifications & escalations

**Tri-channel dispatch** (`src/notifications/`): every classified event fans out to up to three channels — `IN_APP` always, plus `SMS` and `EMAIL` for anything above INFORMATIONAL severity. Each channel is its own small class (`SmsChannel`, `EmailChannel`) implementing the same shape: try to send for real if credentials are configured, otherwise **log what would have been sent and return a `LOGGED` status** — no code branches, no feature flags, the exact same call path either way. This "log by default, real when credentials exist" pattern is deliberate: SMS costs real money per message (Semaphore, a PH-focused gateway), so the system stays demoable at zero cost until real credentials are dropped into `.env`, at which point it starts actually sending without any code change. Email is wired to real Gmail SMTP by default in this deployment's `.env` and does send for real.

**Email templates** (`src/notifications/email-templates/`): every email this system sends is a real, designed HTML email now, not plain text — `EmailChannel.send()` takes an optional `html` param (4th arg) alongside the `message` plain-text fallback every multipart email needs anyway (screen readers, clients that don't render HTML). Built as plain TypeScript functions returning `{ subject, html, text }`, not a templating engine (Handlebars/MJML/etc.) — no dependency earns its keep for 2 call sites. Table-based layout, inline styles, `Segoe UI`/Arial fallback stack, one real `@media` query for phone-width clients — a deliberately different convention from the rest of the frontend's Tailwind/flexbox pattern, since Outlook and other email clients don't support modern CSS at all. One template covers every width (`layout.ts`'s fluid `max-width:600px` table reflows naturally); there's no separate "mobile template" the way the app has separate mobile/desktop JSX trees, since nothing server-side can know which client will render a given email ahead of time.
- `layout.ts` — the shared header/footer chrome (every email) + the full WCAG-audited color token set (every color here has a computed, not eyeballed, contrast ratio — see `docs/HANDOFF.md` for the specific numbers found and fixed).
- `components.ts` — `badge()`, `detailTable()`, `ctaButton()`, `otpCodeBox()` — the reusable pieces every template composes from, including a `sectionPad()` helper that wires in the narrow-screen padding class.
- `otp.template.ts` — `buildOtpEmail()`, used by `AuthService.forgotPassword()`.
- `event.template.ts` — `buildEventEmail()`, used by `NotificationDispatcherService.dispatchOne()`'s `EMAIL` branch. A `Record<string, SubtypeContent>` lookup gives each of the 9 real email-eligible `event_subtype`s its own subject line, badge, headline, and detail rows — this is also what fixed a real pre-existing gap: every M&E email used to share one identical hardcoded subject (`"VMMC TB DOTS Notification"`) regardless of what actually happened. Subtypes without a designed entry fall back to a generic-but-correct template rather than throwing, so a future subtype shipping without matching email design never breaks delivery.

`buildEventEmail()` needs a due date for some templates' detail rows, which isn't on the `events` row itself — `NotificationDispatcherService.handleEvent()` does one extra lightweight `compliance_records` lookup (`due_date` only) when `compliance_record_id` is present, once per event rather than once per channel.

**Escalations** (`src/escalations/`): any `EXCEPTION`-tier event triggers `EscalationsService.createForEvent()`, which resolves the affected employee's department, opens an escalation addressed to that department's `unit_head_id`, and (for `SLA_BREACH` specifically) computes `breach_duration_days`. Unit heads see only escalations addressed to them (`GET /escalations`, scoped server-side); ADMIN sees everything. `acknowledge`/`resolve` are two separate lifecycle transitions with their own valid-from-state checks (`OPEN -> ACKNOWLEDGED -> RESOLVED`), and `timeToAckMinutes` is computed on read, never stored, from `acknowledged_at - created_at`.

---

## 7 · The other three tracking areas (Pre-Employment, PEP, Immunization)

These reuse the M&E engine's *pattern* (WARNING-tier events, de-dup, tri-channel dispatch) without forcing themselves into the `compliance_records`/`sla_definitions` machinery, which is purpose-built for the birthday-cycle APE case and doesn't fit these three cleanly:

- **Pre-Employment** — plain CRUD (baseline screening result + fit-for-duty flag). One-time per hire, no recurring SLA, so it never touches the classifier at all.
- **PEP logs** — exposure incidents with a `follow_up_date`. The scan checks for logs whose follow-up date has passed and whose `prophylaxis_status` hasn't reached a terminal state (`COMPLETED`/`DECLINED`), and classifies a `PEP_FOLLOWUP_MISSED` warning.
- **Immunizations** — dose records with a `next_due_date`. The scan picks the *latest* dose per employee+vaccine (so an on-time newer dose correctly supersedes an old, technically-overdue one) and classifies an `IMMUNIZATION_OVERDUE` warning if it's actually overdue.

Both of the latter reuse `EventClassifierService`'s `emit()`-equivalent machinery (`classifyPepFollowUp` / `classifyImmunizationOverdue`), but since they're not tied to a `compliance_record_id`, de-duplication works differently: instead of "any subtype already logged for this record," it's "does an event already exist whose `payload->>sourceId` matches this PEP-log/dose's own id." Same de-dup *goal*, different mechanism because the underlying row shape is different.

---

## 8 · Upload gateway & idempotency

`POST /documents` enforces, in order: file present → **≤5MB** → **magic-byte sniffing** (`src/documents/file-type.ts` reads the first few bytes and checks for `%PDF`, the PNG signature, or the JPEG SOI marker — it never trusts the client-supplied mimetype or file extension, since either can be spoofed) → at least one of `cxrResult`/`genexpertResult` provided.

**Idempotency:** every write endpoint accepts an `Idempotency-Key` header (`@Idempotent()` decorator documents this in Swagger). For uploads specifically: before inserting, the service checks whether a row with that key already exists and returns it unchanged if so — a client retry after a timeout never creates a duplicate. There's also a **race-condition path**: if two requests with the same key both pass that initial check (because neither had committed yet), the insert itself hits a Postgres unique-constraint violation (`23505`) on `idempotency_key`, and the service catches that specific error code and re-fetches the winning row instead of surfacing a 500. Both paths — the common case and the race — are unit-tested in `documents.service.spec.ts`.

Documents live in a **private** Supabase Storage bucket, never served directly — the API only ever hands back short-lived signed URLs. Same pattern for admin signature PNGs, in a separate `signatures` bucket with a 1MB cap.

**Rejection notifies the employee** (`DocumentsService.review()`, reject branch): a real gap until this was fixed — rejecting a document used to just update `review_status`/`rejection_reason` on the row and return, with no event, no in-app notification, nothing. The employee only found out by manually re-checking their own upload history. Fixed by adding `EventClassifierService.classifyDocumentRejected(documentId, employeeId, reason)`, called right after the DB update — it follows the exact same `emitOther()`/de-dup-by-`sourceId` pattern as `classifyPepFollowUp`/`classifyImmunizationOverdue` (§7), emitting a `WARNING`-tier `DOCUMENT_REJECTED` event whose message embeds the real rejection reason (not a generic label), so the employee gets the actual "why" in their notification, not just "your document was rejected." This is a **reviewer action, not a scan-detected condition** — it's called directly from `documents.service.ts`, not from `MonitoringService.runScan()`'s daily sweep, since there's nothing to re-detect on a schedule; the rejection either just happened or it didn't.

---

## 9 · Testing — what's covered and how

**Unit tests** (`npm run test`, 63 tests across 6 suites): the SLA evaluator (every month, a leap-year edge case), the upload validator (all three accepted formats, an executable disguised with the wrong bytes, empty/short buffers), the event classifier (every tier, both Exception triggers firing together, de-dup, `lead_time_days`, weekly-reminder cadence), document upload idempotency (including the race-condition path), the audit interceptor's `deriveEntityType()` (see the callout below), and `assert-access.spec.ts` covering the shared cross-employee/document access rules in `src/common/assert-access.ts`.

Since there's no ORM and no test database, unit tests mock Supabase's query builder rather than hitting a real database. `src/test-utils/supabase-chain-mock.ts` is a small hand-built stand-in: every chain method (`.select()`, `.eq()`, `.update()`, …) returns the same chainable object, and that object is itself "thenable" so an `await` at any point in the chain resolves to a pre-configured `{ data, error }`. Tests queue up one result per expected `.from()` call, in the exact order the service under test is expected to call it — which means writing one of these tests doubles as reading the service's logic path top-to-bottom. See any `*.service.spec.ts` file for the pattern.

**There's no backend-local e2e test anymore.** The NestJS-generated smoke e2e (`test/app.e2e-spec.ts`, boots the whole app in-process, hits `/health`) was retired — it's superseded by the consolidated `e2e/` suite at the repo root (`e2e/api/` hits this API directly over real HTTP; `e2e/ui/` drives it through the real frontend). It couldn't simply be *moved* there: it depends on `@nestjs/testing` booting `AppModule` in-process, which only resolves from this repo's own `node_modules` — relocating the file outside this repo breaks Node's module resolution unless the whole NestJS dependency tree gets duplicated at the new location, which fights this project's own "fully independent deployable units" design (§SYSTEM_ARCHITECTURE.md §2). Run `npm run test:e2e` from the **repo root**, not here.

**The stress test found a real bug.** `scripts/stress-test.ts` simulates concurrent load against the live API. The first version of this test — 50 concurrent fresh logins — produced ~40% spurious 401s on *correct* credentials. The root cause wasn't the API's business logic at all: `SupabaseService` was handing out one **shared, cached** anon Supabase client for every `signInWithPassword()` call, and that client's internal GoTrue auth lock (built for a single browser tab, not dozens of concurrent server-side sign-ins sharing one instance) corrupted state under concurrency. The fix was to make `getAnonClient()` construct a **fresh** client per call (cheap — `createClient()` does no I/O) instead of reusing a singleton. After the fix: 50 concurrent authenticated sessions, 0 failed requests, max response 3.2s. This is exactly the kind of bug that never shows up in sequential manual testing and only appears under real concurrent load — worth understanding even if you never touch this file again.

**A second real bug, found by just... clicking around and noticing it felt slow.** Home and Compliance Tracker were measurably sluggish (1.6–2.3s and 0.3–0.5s respectively) — not a dev-server artifact, a real backend problem. Two causes: (1) `DashboardService.getStaffOverview()`/`getAdminOverview()` fetched `compliance_records` once for their own stats, then called `computeMonthlyTrend()`, which fetched the **exact same records again** from scratch — the fix was splitting it into a pure `buildMonthlyTrend(records)` that reuses what the caller already has, only refetching in the standalone `GET /dashboard/trend` endpoint that has nothing to reuse; (2) `ComplianceRecordService.ensureCurrentCycleRecords()` — a SLA lookup + full active-employee fetch + upsert — ran on **every single** tracker/dossier request instead of only when actually needed, so it's now cached per cycle-year in memory (safe here specifically because this app has no runtime employee-creation endpoint — new employees only ever arrive via seed scripts followed by a restart). Two more independent-query pairs got `Promise.all`'d instead of sequential `await`s while in there. Result: dashboard down to 0.7–1.2s. The lesson: a REST-over-HTTP client like `supabase-js` makes every `.from().select()` a real network round trip to a remote Postgres — code that "looks fine" can still be paying for 6 sequential round trips when 4 (or fewer) would do.

**A third real bug, found while reviewing a live Activity Logs screenshot and noticing the same entry repeated over and over.** `AuditInterceptor` derives `entity_type` from the URL's first path segment (`segments[1]`) — correct for almost every module, but `/api/me/*` has 11 genuinely different sub-resources (`profile`, `devices`, `activity-logs`, `login-history`, `privacy-settings`, ...) that all collapsed to the same `entity_type: 'me'`, so every one of them rendered as the identical string "Accessed Profile" in the UI. Not a duplicate-write bug — the audit trail was recording every request correctly, append-only, exactly as designed — the labels just weren't specific enough to tell genuinely different actions apart. Fixed by extracting `deriveEntityType()` (now unit-tested — see `audit.interceptor.spec.ts`) to special-case the `me` module and include its sub-resource segment (`me-profile`, `me-devices`, etc.), with matching entries added to `activity.service.ts`'s label map. Historical rows keep their original (coarser) labels — `audit_logs` is append-only, so a DB trigger blocks ever rewriting them; the fix only changes what gets written going forward.

**Slow-3G evidence:** a throttled-network Playwright pass (400kbps, 400ms latency) confirmed login, viewing the compliance tracker, and completing an upload all succeed — slowly, with a visible busy/loading state at every step (never a frozen screen), and a single upload under throttling produces exactly one document row, not a duplicate.

**A fourth and fifth real bug, found integrating a groupmate's `login_update` branch (signup + first-login password reset) before merging it in.** Neither showed up from just reading the diff — both only surfaced by actually running the full verification sweep. First: `DocumentsService.getReviewQueue()` had two TypeScript errors (`documents.service.ts`) — `employee?.department_id` was read but never declared on the local `ReviewQueueEmployee` interface even though the Supabase query already selected that column, and `department?.code` was accessed through a ternary (`employee && Array.isArray(employee.departments) ? employee.departments[0] : employee?.departments`) whose optional-chained false-branch doesn't narrow the same way the non-optional `employee.departments` check in its condition does — fixed by adding the missing field to the interface and switching to the same `if (employee) department = ...` narrowing pattern already used correctly a few lines below in the same file (`.map()` over the queue rows). Neither fix changes any runtime behavior; both just make the types match what the query already returned. Second, and the one that actually blocked every login end to end: `AuthService`'s `findEmployeeByEmployeeId()` selects `must_change_password` on `employees`, a column the new signup/first-login flow depends on, but no migration ever added it — Supabase silently returns no rows for a `select` on a nonexistent column, so every login failed with a generic "Invalid Employee ID or password.", indistinguishable from an actual bad password until `curl`ing the login endpoint directly and reading the raw Postgrest error (`42703: column employees.must_change_password does not exist`). Fixed by `supabase/migrations/20260928000000_must_change_password.sql` (`add column if not exists must_change_password boolean not null default false`).

**A sixth real bug — the "third" fix above made labels distinct, but distinct wasn't the same as accurate.** User asked to make the Activity Logs feed "more accurate to what the user really is doing, including the time," which turned up two separate problems once actually traced through:
1. **Several `/me/*` reads aren't user activity at all — they're the UI populating itself.** `Layout.tsx`'s notification bell fetches `/me/notifications` on literally every page across the whole app; `Profile.tsx` fires four more (`/me/activity-logs`, `/me/login-history`, `/me/devices`, `/me/privacy-settings`) together in one burst the instant it mounts, to fill its own side panels. None of these are something the user deliberately did — but they were all landing in the feed as if they were, producing a wall of near-identical "Accessed X" entries that all shared one timestamp (the moment the page loaded), which is exactly what read as "inaccurate" and made the *time* column meaningless too. `Compliance.tsx`'s `/departments` fetch (populating a filter dropdown on every visit) is the same shape of problem on a different page.
2. **Two real, high-frequency routes were never mapped in `ENTITY_LABELS` at all** — caught by diffing every real `@Controller()` prefix in the backend against the label map rather than trusting it was complete. `dashboard` (`/dashboard/overview`, fetched by literally every user's Home Dashboard — likely the single biggest source of this) and `change-requests` (added after the "third" fix above, never backfilled into the map) were both silently falling through to the generic `'Record'` fallback, producing uninformative "Accessed Record" entries. `monitoring` (the admin "Run Compliance Scan" button) was missing too, just lower-frequency.

Fixed in `activity.service.ts`: added `dashboard`, `change-requests`, and `monitoring` to `ENTITY_LABELS` with real labels; added a `NOISE_ENTITY_TYPES` set (`me-notifications`, `me-activity-logs`, `me-login-history`, `me-devices`, `me-privacy-settings`, `departments`) that `listActivityLogs()` filters out of the user-facing feed — nothing is deleted from `audit_logs` itself, which stays a complete, untouched, append-only record for anyone who needs the full access trail; this only changes what the *feed* surfaces. Query widened from `.limit(30)` to `.limit(90)` before filtering, then re-sliced to 30 after, since filtering first could otherwise leave far fewer than 30 genuinely meaningful rows. Verified live by driving a real browser session (login → Dashboard → Compliance → Profile) against the real running backend and reading back the actual feed: it now shows a clean, readable sequence — `Secure Login Successful` → `Accessed Home Dashboard` → `Accessed My Compliance Record` → `Accessed Profile` / `Accessed Change Request` — each with its own real, distinct timestamp, not a cluster of noise sharing one.

**A seventh real bug, found by re-checking the same live feed and still seeing it as "inconsistent" after the sixth fix landed.** The noise-filtering and relabeling above were both real fixes, but they didn't address a deeper issue: the same real page visit could still show up as 2, 3, or even 4 near-identical rows, unpredictably — e.g. one `/me/profile` burst produced 3 "Accessed Profile" entries while the `/change-requests/mine` call that fired in the exact same `useEffect` only produced 1. The root cause isn't a frontend bug to chase down and patch — it's a mismatch in how the audit system treats GET requests. HTTP defines `GET` as safe and idempotent specifically so that re-sending it has no meaningful consequence; React 18 Strict Mode deliberately double-invokes a component's mount effects in development for exactly this reason (to catch effects that *aren't* safe to run twice), a backgrounded tab refocusing can re-trigger the same fetch, a slow connection can cause a silent retry. All of that is normal, harmless, spec-compliant HTTP behavior — and all of it was getting audit-logged as if it were a new, distinct thing the user did, which is what actually made the feed read as inconsistent: identical visits producing a different number of rows depending on timing.

Fixed with `dedupeBursts()` in `activity.service.ts` (now unit-tested — 7 cases in `activity.service.spec.ts`, covering the exact burst shape seen live, two genuinely separate visits staying separate, different entity types in the same burst both surviving, a failed-then-successful login never merging regardless of how close together, and a slow-drifting burst where no single gap exceeds the window but the total span does). It walks the already-time-sorted rows and collapses consecutive same-`(action, entity_type)` rows into one — keeping the most recent — whenever the gap between them is under `BURST_WINDOW_MS` (3 seconds; every real burst observed live lands well under 1 second, so this has margin without risking merging two genuinely separate visits). Deliberately a *display*-layer fix, same philosophy as the noise filter above: `audit_logs` keeps every row exactly as written, append-only, untouched — only `listActivityLogs()`'s read path collapses bursts, so a real compliance audit of the raw table still sees everything that actually happened. Re-verified live against the same messy real account history that exposed the bug: the same 4-row Profile-visit bursts now surface as exactly one "Accessed Profile" and one "Accessed Change Request" per visit, while the genuinely distinct failed-then-successful login sequence from earlier testing stayed intact as separate rows, not merged away.

**An eighth real bug, reported directly by the user: "it says I accessed the change request even though I haven't touched it."** The sixth fix above had given `change-requests` a real label, but never questioned whether an `ACCESS` on it should appear in the feed at all — and it's exactly the same background-panel-population shape as the four entity types already excluded as noise: `refreshMyChangeRequests()` fires unconditionally in the same `useEffect` as the other four, the instant `Profile.tsx` mounts, to populate the "Request a Change" history panel. A user who opened Profile and never looked at that panel still saw "Accessed Change Request" in their own feed, because the background fetch happened regardless of whether they touched the feature — indistinguishable, from the audit log's point of view, from the user actually submitting a request.

Tracing this turned up a second, more serious problem in the sixth fix's own filter: `NOISE_ENTITY_TYPES` excluded an entity type **unconditionally**, regardless of `action` — which meant two genuine, deliberate user actions were being silently hidden from their own activity history the whole time: removing a registered device (`DELETE /me/devices/:id`, `Profile.tsx` line ~341) and toggling a data-privacy setting (`PATCH /me/privacy-settings`, line ~350), both real clicks, both on entity types that were in the noise set for their incidental `ACCESS` rows. Renamed to `NOISE_ACCESS_ENTITY_TYPES` and gated the whole filter on `action === 'ACCESS'` (see `isNoise()`) — nothing in this app ever mutates on its own, every `CREATE`/`UPDATE`/`DELETE` is the direct result of a user clicking something, so those stay visible regardless of entity type; added `change-requests` to the now-correctly-scoped set. 4 new unit tests added (`isNoise` in `activity.service.spec.ts`) specifically covering the distinction this bug turned on: suppress `ACCESS` on the noise types, never suppress a mutation on those same types, never suppress a real page visit like `me-profile`/`dashboard`, never suppress `LOGIN`/`LOGIN_FAILED`/`ACCESS_DENIED`. Re-verified live by replaying the exact reported scenario (hit `/me/profile`, `/change-requests/mine`, and `/dashboard/overview` back to back, as one real Profile-then-Dashboard session would) and confirming "Accessed Change Request" no longer appears while "Accessed Profile" and "Accessed Home Dashboard" still do.

---

## 10 · Cross-cutting concerns

- **Global audit interceptor** (`src/audit/audit.interceptor.ts`) — registered once via `APP_INTERCEPTOR`, applies to every request. Derives an action (`ACCESS`/`CREATE`/`UPDATE`/`DELETE`) from the HTTP method and logs actor/IP/user-agent/path to `audit_logs` — deliberately **never** the request or response body, since those can carry PHI (exam results, contact info). It also wraps `next.handle()` in a `catchError` so that a `ForbiddenException` thrown *inside* a route handler (like the fine-grained `assertRecordAccess` checks from §4) gets logged as `ACCESS_DENIED` before re-throwing — so a blocked cross-employee read is both rejected *and* shows up in the audit trail, not just silently 403'd.
- **Global exception filter** (`src/common/all-exceptions.filter.ts`) — every error response has the same shape (`statusCode`, `message`, `error`, `path`, `timestamp`). Unexpected (non-`HttpException`) failures return a generic "Internal server error." to the client and log the real stack trace server-side only — so a raw Postgres error message never leaks implementation details to a caller.
- **`@nestjs/throttler`** — global rate limit (120 req/min/IP) via `APP_GUARD`, on top of `helmet()`.
- **Swagger** at `/api/docs`, and the live contract is also written to `openapi.json` at boot for offline handoff.

---

## 11 · How it actually works — three worked code walkthroughs

Everything above explains *what* exists and *why*. This section is the *how*: tracing real code, line by line, so you could rebuild a piece of this yourself. Have the source files open alongside this section.

### 11.1 Walkthrough: one request, guard to database and back

Take the smallest real endpoint in the app, `GET /me/performance-stats`, and follow a request through **every** layer it passes through. This is the exact same pipeline every other endpoint uses — once you've traced this one, you've traced all of them.

**Step 1 — the route is declared** (`src/me/me.controller.ts`):
```ts
@Get('performance-stats')
@Roles('ADMIN')
getPerformanceStats(@CurrentUser() employee: EmployeeContext) {
  return this.profileService.getPerformanceStats(employee);
}
```
Four things are happening on these four lines alone: `@Get()` registers the route, `@Roles('ADMIN')` attaches metadata (not a check — just a tag) saying "only ADMIN may call this," `@CurrentUser()` is a **parameter decorator** that pulls a value out of the request object, and the method body is one line because all real logic lives in the service, never the controller.

**Step 2 — a request arrives, guards run first.** `@Controller('me')` on the class carries `@UseGuards(SupabaseAuthGuard, RolesGuard)`, and Nest runs guards **in the order listed, before the controller method executes at all**:

```ts
// SupabaseAuthGuard.canActivate() — runs first
const token = this.extractToken(request);                       // pull "Bearer <token>" out of the header
const { data: { user } } = await this.supabaseService.getClient().auth.getUser(token); // ask Supabase Auth: is this real?
const { data } = await this.supabaseService.getClient()
  .from('employees').select('...').eq('auth_user_id', user.id).single(); // map auth identity -> business identity
request.employee = { id: data.id, role: data.role, ... };        // stash it on the request object itself
return true;                                                      // guard passes -> next guard runs
```
Note the key trick: **the guard doesn't return the employee — it mutates `request.employee`**. That's the only way data crosses from a guard into the rest of the pipeline; guards return a boolean (allow/deny), nothing else.

```ts
// RolesGuard.canActivate() — runs second, only because SupabaseAuthGuard returned true
const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [context.getHandler(), context.getClass()]);
// ^ this is how it reads the '@Roles(...)' metadata tag from Step 1 back out
if (!requiredRoles.includes(request.employee.role)) throw new ForbiddenException(...);
return true;
```
If `request.employee.role` isn't `'ADMIN'`, the request dies right here with a 403 — the controller method body never runs at all.

**Step 3 — the parameter decorator resolves.** `@CurrentUser()` (`src/auth/decorators/current-user.decorator.ts`) is just:
```ts
export const CurrentUser = createParamDecorator((_data, ctx) => {
  return ctx.switchToHttp().getRequest<RequestWithEmployee>().employee; // the same object SupabaseAuthGuard set in Step 2
});
```
This is *why* Step 2's `request.employee = {...}` matters — it's the only bridge between "the guard verified who's calling" and "the controller method gets a typed `employee` argument for free," with zero manual wiring per-route.

**Step 4 — the controller calls the service, the service queries Supabase** (`src/me/profile.service.ts`):
```ts
async getPerformanceStats(currentUser: EmployeeContext) {
  const { count: reviews } = await client.from('documents').select('id', { count: 'exact', head: true })
    .eq('reviewed_by', currentUser.id);
  const { count: approvals } = await client.from('documents').select('id', { count: 'exact', head: true })
    .eq('reviewed_by', currentUser.id).eq('review_status', 'APPROVED');
  return { reviews: reviews ?? 0, approvals: approvals ?? 0, approvalRate: ... };
}
```
Two real Postgres count queries, filtered by the *caller's own id* (not anything the client sent) — this is the fine-grained RBAC pattern from §4 in its simplest form: the query itself only ever looks at data the caller is allowed to see, because it's scoped to `currentUser.id` at the query level, not filtered after the fact.

**Step 5 — the response leaves.** Whatever the controller method returns, Nest serializes straight to JSON. No manual `res.json(...)` anywhere — that's why every controller method just `return`s a value.

### 11.2 Walkthrough: the classifier deciding one real case

Take a concrete scenario and trace `EventClassifierService.classify()` (`src/monitoring/event-classifier.service.ts`) exactly as the code executes it — this is the same trace a debugger would show you.

**Scenario:** Employee's `due_date` was 3 days ago. No approved document exists yet. Their only prior event is `WINDOW_OPENED`.

```ts
async classify(record, today) {
  if (record.status === 'COMPLIANT') return [];   // (1) not compliant, continue

  const { data: existingEvents } = await client.from('events')
    .select('event_subtype, detected_at').eq('compliance_record_id', record.id)...;
  // (2) existingEvents = [{ event_subtype: 'WINDOW_OPENED', ... }]
  const subtypesSeen = new Set(['WINDOW_OPENED']);

  if (!existingEvents || existingEvents.length === 0) { ... }
  // (3) existingEvents.length is 1, not 0 -> this whole block is SKIPPED. No duplicate WINDOW_OPENED.

  const { data: approvedDoc } = await client.from('documents')...maybeSingle();
  // (4) approvedDoc = null (nothing approved yet) -> the entire `if (approvedDoc)` block is skipped

  const due = new Date(record.due_date);       // (5) 3 days ago
  const birthday = new Date(record.birthday_date);
  const windowOpen = new Date(record.window_open_date);

  if (today > due) {                            // (6) TRUE — today is after the deadline
    if (!subtypesSeen.has('SLA_BREACH')) {       // (7) TRUE — SLA_BREACH has never fired for this record
      await client.from('compliance_records').update({ status: 'OVERDUE' }).eq('id', record.id); // (8)
      await this.emit(record, 'EXCEPTION', 'SLA_BREACH', 2, 'Birth-month deadline passed...');    // (9)
      emitted.push('SLA_BREACH');
    }
  }
  // (10) `else if` branches for birthday/window-open are never reached — `if` already matched.

  return emitted;   // (11) ['SLA_BREACH']
}
```
Then `emit()` does two more things you should trace separately: it `INSERT`s the row into `events` **and selects it straight back** (`.select(...).single()`), then immediately calls `notificationDispatcherService.handleEvent(insertedRow)` — so by the time `classify()` returns, the notification has *already been dispatched*, synchronously, in the same call stack. There's no queue, no polling job watching for new rows.

**Now run the same trace again the next day**, with `SLA_BREACH` now in `existingEvents`: step (7)'s `!subtypesSeen.has('SLA_BREACH')` is `false`, the whole inner block is skipped, `emitted` stays `[]`, nothing is written, nothing is sent. That's de-duplication — not a special check bolted on, just the same `subtypesSeen` set gating every single emission point in the method.

### 11.3 How to add a new endpoint, start to finish

This is the exact sequence `GET /me/performance-stats` was built in — use it as a template for adding anything new that follows this app's conventions.

1. **Decide where it belongs.** One request, one owning module. A new stat about documents' review history belongs next to `documents`-adjacent self-service concerns → `src/me/`, not a new top-level module.
2. **Write the service method first**, with no framework decorators at all — it's just a class method that takes typed arguments and returns typed data:
   ```ts
   // src/me/profile.service.ts
   async getPerformanceStats(currentUser: EmployeeContext) { /* real Supabase queries */ }
   ```
3. **Add the route on the controller**, as thin as possible — parse/validate input (via `@Body()`/`@Param()`/a DTO), call the service, return its result:
   ```ts
   @Get('performance-stats')
   @Roles('ADMIN')                          // omit @Roles(...) entirely if every authenticated role may call it
   getPerformanceStats(@CurrentUser() employee: EmployeeContext) {
     return this.profileService.getPerformanceStats(employee);
   }
   ```
4. **If the endpoint accepts a body,** write a DTO class in `dto/` with `class-validator` decorators (`@IsString()`, `@IsOptional()`, etc.) instead of typing the body as `any` — the global `ValidationPipe` (see `main.ts`) rejects anything that doesn't match automatically, before your handler code ever runs.
5. **Wire the provider into its module** if it isn't already there — `providers: [..., ProfileService]` in `me.module.ts`. Forgetting this step is the single most common "why is my service `undefined`" mistake in Nest.
6. **Add `@Idempotent()`** (from `src/common/decorators/idempotent.decorator.ts`) to any `POST`/`PATCH` that creates or mutates a record, so Swagger documents the idempotency-key convention on it.
7. **Type-check and hit it with curl** before touching the frontend: `npx tsc --noEmit`, then a real request with a real bearer token. Confirm the RBAC-denied case too (wrong role → expect the exact status code you intended, not a 500).

---

## 12 · Running it locally

```bash
cd "vmmc backend"
npm install
cp .env.example .env   # fill in real Supabase project values
npm run start:dev      # NestJS watch mode, http://localhost:8443/api
```

`npm run test`, `npx tsc --noEmit`, `npx ts-node scripts/stress-test.ts 50` are all safe to run anytime. `npm run test:e2e` from the repo root runs the consolidated e2e suite covering this API and the frontend together (see §9). Seed data and storage buckets are provisioned via `npm run seed:auth` and `npm run setup:storage` against a fresh Supabase project (see `supabase/migrations/` for schema, `supabase/seed.sql` for the ~20 demo employees).

---

## 13 · If you want to go deeper on one thing

- **The engine itself:** `src/monitoring/event-classifier.service.ts` + its `.spec.ts` side by side. Read the spec first — each test name describes one real-world scenario, and the queued mock responses show you exactly which queries the classifier makes and in what order.
- **Why RBAC can't be bypassed via query params:** `src/compliance/compliance-record.service.ts`, the `getTracker()` method — see how a `UNIT_HEAD`'s `department` filter is silently overridden.
- **The concurrency bug:** `src/supabase/supabase.service.ts` — small file, big lesson about shared client instances under load.
