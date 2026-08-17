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
├── reports/           3 institutional reports (delinquency, clearance summary, bio-matrix)
├── tracking/          The other 3 tracking areas: Pre-Employment, PEP logs, Immunizations
├── me/                Self-service: profile, PIN/password, devices, activity/login history
├── health/            /health, /health/ready
├── common/            Shared: exception filter, idempotency decorator, access-control helper
├── config/            Env-var validation (class-validator)
└── test-utils/        Shared Supabase-chain mock for unit tests
```

Every feature module follows the same shape: `*.module.ts` (wiring), `*.controller.ts` (HTTP layer, thin), `*.service.ts` (real logic), `dto/*.ts` (request validation via `class-validator`). If you're looking for business logic, it's always in the service, never the controller.

---

## 3 · Data model — the schema is the source of truth

Full schema: `supabase/migrations/20260716000000_init_schema.sql` (+ two follow-up migrations). Read it before reading any service code — every service is just structured queries against these tables.

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
window_open_date reached, no submission  -> WARNING   / FIRST_REMINDER    -> status = NON_COMPLIANT
birthday reached, still no submission    -> WARNING   / BIRTHDAY_DUE      -> status = NON_COMPLIANT
  (then every 7+ days after)             -> WARNING   / WEEKLY_REMINDER   -> (no further status change)
due_date passed, still no clearance      -> EXCEPTION / SLA_BREACH        -> status = OVERDUE
```

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

### 5.4 The two Exception triggers, side by side

| | `SLA_BREACH` | `CLINICAL_ALERT` |
|---|---|---|
| Trigger | Birth-month deadline passed, no approved clearance | Approved result is positive (INFILTRATE / DETECTED) |
| Sets | `status = OVERDUE` | `clinical_status = CRITICAL` |
| Can co-occur with the other? | Yes — both dimensions are checked every scan, independently | Yes |

Both open an escalation (§6) and dispatch tri-channel. Both are unit-tested individually, and there's a specific test proving they can fire **in the same `classify()` call** for the same record (positive result *and* overdue at once) — exactly the "on-time yet CRITICAL" scenario the two-dimension model exists to represent correctly.

---

## 6 · Notifications & escalations

**Tri-channel dispatch** (`src/notifications/`): every classified event fans out to up to three channels — `IN_APP` always, plus `SMS` and `EMAIL` for anything above INFORMATIONAL severity. Each channel is its own small class (`SmsChannel`, `EmailChannel`) implementing the same shape: try to send for real if credentials are configured, otherwise **log what would have been sent and return a `LOGGED` status** — no code branches, no feature flags, the exact same call path either way. This "log by default, real when credentials exist" pattern is deliberate: SMS costs real money per message (Semaphore, a PH-focused gateway), so the system stays demoable at zero cost until real credentials are dropped into `.env`, at which point it starts actually sending without any code change. Email is wired to real Gmail SMTP by default in this deployment's `.env` and does send for real.

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

---

## 9 · Testing — what's covered and how

**Unit tests** (`npm run test`, 51 tests across 5 suites): the SLA evaluator (every month, a leap-year edge case), the upload validator (all three accepted formats, an executable disguised with the wrong bytes, empty/short buffers), the event classifier (every tier, both Exception triggers firing together, de-dup, `lead_time_days`, weekly-reminder cadence), document upload idempotency (including the race-condition path), and the audit interceptor's `deriveEntityType()` (see the callout below).

Since there's no ORM and no test database, unit tests mock Supabase's query builder rather than hitting a real database. `src/test-utils/supabase-chain-mock.ts` is a small hand-built stand-in: every chain method (`.select()`, `.eq()`, `.update()`, …) returns the same chainable object, and that object is itself "thenable" so an `await` at any point in the chain resolves to a pre-configured `{ data, error }`. Tests queue up one result per expected `.from()` call, in the exact order the service under test is expected to call it — which means writing one of these tests doubles as reading the service's logic path top-to-bottom. See any `*.service.spec.ts` file for the pattern.

**There's no backend-local e2e test anymore.** The NestJS-generated smoke e2e (`test/app.e2e-spec.ts`, boots the whole app in-process, hits `/health`) was retired — it's superseded by the consolidated `e2e/` suite at the repo root (`e2e/api/` hits this API directly over real HTTP; `e2e/ui/` drives it through the real frontend). It couldn't simply be *moved* there: it depends on `@nestjs/testing` booting `AppModule` in-process, which only resolves from this repo's own `node_modules` — relocating the file outside this repo breaks Node's module resolution unless the whole NestJS dependency tree gets duplicated at the new location, which fights this project's own "fully independent deployable units" design (§SYSTEM_ARCHITECTURE.md §2). Run `npm run test:e2e` from the **repo root**, not here.

**The stress test found a real bug.** `scripts/stress-test.ts` simulates concurrent load against the live API. The first version of this test — 50 concurrent fresh logins — produced ~40% spurious 401s on *correct* credentials. The root cause wasn't the API's business logic at all: `SupabaseService` was handing out one **shared, cached** anon Supabase client for every `signInWithPassword()` call, and that client's internal GoTrue auth lock (built for a single browser tab, not dozens of concurrent server-side sign-ins sharing one instance) corrupted state under concurrency. The fix was to make `getAnonClient()` construct a **fresh** client per call (cheap — `createClient()` does no I/O) instead of reusing a singleton. After the fix: 50 concurrent authenticated sessions, 0 failed requests, max response 3.2s. This is exactly the kind of bug that never shows up in sequential manual testing and only appears under real concurrent load — worth understanding even if you never touch this file again.

**A second real bug, found by just... clicking around and noticing it felt slow.** Home and Compliance Tracker were measurably sluggish (1.6–2.3s and 0.3–0.5s respectively) — not a dev-server artifact, a real backend problem. Two causes: (1) `DashboardService.getStaffOverview()`/`getAdminOverview()` fetched `compliance_records` once for their own stats, then called `computeMonthlyTrend()`, which fetched the **exact same records again** from scratch — the fix was splitting it into a pure `buildMonthlyTrend(records)` that reuses what the caller already has, only refetching in the standalone `GET /dashboard/trend` endpoint that has nothing to reuse; (2) `ComplianceRecordService.ensureCurrentCycleRecords()` — a SLA lookup + full active-employee fetch + upsert — ran on **every single** tracker/dossier request instead of only when actually needed, so it's now cached per cycle-year in memory (safe here specifically because this app has no runtime employee-creation endpoint — new employees only ever arrive via seed scripts followed by a restart). Two more independent-query pairs got `Promise.all`'d instead of sequential `await`s while in there. Result: dashboard down to 0.7–1.2s. The lesson: a REST-over-HTTP client like `supabase-js` makes every `.from().select()` a real network round trip to a remote Postgres — code that "looks fine" can still be paying for 6 sequential round trips when 4 (or fewer) would do.

**A third real bug, found while reviewing a live Activity Logs screenshot and noticing the same entry repeated over and over.** `AuditInterceptor` derives `entity_type` from the URL's first path segment (`segments[1]`) — correct for almost every module, but `/api/me/*` has 11 genuinely different sub-resources (`profile`, `devices`, `activity-logs`, `login-history`, `privacy-settings`, ...) that all collapsed to the same `entity_type: 'me'`, so every one of them rendered as the identical string "Accessed Profile" in the UI. Not a duplicate-write bug — the audit trail was recording every request correctly, append-only, exactly as designed — the labels just weren't specific enough to tell genuinely different actions apart. Fixed by extracting `deriveEntityType()` (now unit-tested — see `audit.interceptor.spec.ts`) to special-case the `me` module and include its sub-resource segment (`me-profile`, `me-devices`, etc.), with matching entries added to `activity.service.ts`'s label map. Historical rows keep their original (coarser) labels — `audit_logs` is append-only, so a DB trigger blocks ever rewriting them; the fix only changes what gets written going forward.

**Slow-3G evidence:** a throttled-network Playwright pass (400kbps, 400ms latency) confirmed login, viewing the compliance tracker, and completing an upload all succeed — slowly, with a visible busy/loading state at every step (never a frozen screen), and a single upload under throttling produces exactly one document row, not a duplicate.

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
