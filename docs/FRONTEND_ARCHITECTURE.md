# VMMC TB DOTS — Frontend Architecture

This document exists so the team can open this repo cold and actually understand *why* it's built the way it is — not just where the files are. Read it top to bottom once, then use it as a reference. Pair it with [`SYSTEM_ARCHITECTURE.md`](SYSTEM_ARCHITECTURE.md) for the whole-system view and [`BACKEND_ARCHITECTURE.md`](BACKEND_ARCHITECTURE.md) for the API this UI talks to. If you're making a visual/interaction change, [`FRONTEND_STANDARDS.md`](../vmmc%20frontend/FRONTEND_STANDARDS.md) is the actual conventions rulebook — this document is about understanding the app, that one is about extending it correctly.

> This document lives in `docs/`, but all repo-relative paths mentioned below (`src/...`, etc.) are relative to `vmmc frontend/`, not to this file's own location.

---

## 1 · Where this app came from, and what that explains

This app started life as a **Figma Make**–generated Vite SPA — a fully mocked, visually-complete prototype with hardcoded arrays standing in for real data. It was migrated to **Next.js 16 (App Router) + React 19 + TypeScript**, and the backend-integration work (this whole capstone build) was explicitly scoped as **"integration, not redesign"**: replace every mock data source with a real API call, keep the visual design, motion, and component shapes byte-for-byte the same. That origin story explains almost every stylistic oddity you'll find in this codebase — most importantly the styling convention in §3.

---

## 2 · Routing model — thin route pages, real screens

```
src/app/
├── layout.tsx                    Root HTML shell
├── page.tsx                       "/" — client-redirects to /dashboard or /login
├── login/page.tsx                 Public
├── forgot-password/page.tsx       Public
└── (dashboard)/                   Route group — shares one auth-guarded layout
    ├── layout.tsx                  Renders <Layout> (header+sidebar) around every child route
    ├── dashboard/page.tsx
    ├── compliance/page.tsx
    ├── upload/page.tsx
    └── profile/page.tsx
```

Every file under `src/app/` is intentionally tiny — it just renders the real implementation from `src/screens/*.tsx`. This split exists so the actual screen logic isn't tangled up with Next.js routing conventions, and so screens are trivially reusable/testable outside the router. If you're looking for what a page *does*, always go to `src/screens/`, never `src/app/`.

**Four screens, eight views.** There are only four screens (`Dashboard`, `Compliance`, `Upload`, `Profile`) but each one branches its entire content on role — **staff and admin see genuinely different content at the same route**, not different routes. `Compliance.tsx` at `/compliance` is "Compliance Tracker" (your own + your department, if you're a UNIT_HEAD) for staff, and "Staff Directory" (hospital-wide) for admin. Same file, same route, `role === 'admin' ? (...) : (...)` branching throughout.

---

## 3 · The styling convention — and why it exists

This is the single most important thing to understand before touching any JSX in this repo, and it trips up everyone the first time.

**Inline `style={{}}` owns every visual property. Tailwind `className` owns only responsive/breakpoint behavior.** Colors, fonts, spacing, shadows, border-radius — all inline. Which-layout-at-which-viewport-width — Tailwind, and *only* that.

```tsx
// Correct: color/spacing/radius inline, responsive layout in className
<div className="flex flex-col lg:flex-row gap-6" style={{ background: '#fff', borderRadius: 20, padding: 32 }}>
```

Why: the Figma Make output was one giant tree of inline styles (a common Figma-to-code export pattern). Rather than rewrite the whole app into Tailwind classes during the Next.js migration — which would have risked subtly changing the pixel-perfect design — the migration kept every inline style as-is and layered Tailwind on top *only* for the responsive behavior Figma's static export couldn't express. The result is a deliberate hybrid, not an accident.

**The gotcha this creates:** inline `style` always wins over a plain Tailwind class for the same CSS property (a Tailwind class needs `!important` to override it). So `style={{ display: 'flex' }}` combined with `className="lg:hidden"` **will never actually hide the element** — the inline `display: flex` always wins. If you need a property to behave responsively, that property has to live in `className` entirely, not split between the two mechanisms.

---

## 4 · Auth model — client-only, by design

There is **no cookie-based session** and **no server-side auth check**. The whole thing is:

```ts
// src/lib/auth.ts
sessionStorage.setItem('vmmc_session', JSON.stringify({ accessToken, expiresAt, user }))
```

`login()` stores the real JWT (issued by the backend's `/auth/login`, itself a real Supabase Auth token) plus the decoded user object in `sessionStorage`. `getToken()` reads it back out for every API call. Because `sessionStorage` doesn't exist during server rendering, every auth check (`isAuthenticated()`, `getRole()`) has to run client-side inside a `useEffect` — never at module scope, never during SSR. `useAuthGuard('auth' | 'guest')` (`src/lib/useAuthGuard.ts`) is the shared hook every protected/public route uses: it renders nothing until the client-side check resolves, then either redirects or lets the page render.

**Two role representations coexist on purpose:**
```ts
getRole(): 'staff' | 'admin'                    // the legacy two-door split the mock screens branch on
getPreciseRole(): 'STAFF' | 'UNIT_HEAD' | 'ADMIN' | null   // the real backend-confirmed role
```
`UNIT_HEAD` always maps to the `'staff'` door (dept-scoped staff UI) in `getRole()` — the finer STAFF-vs-UNIT_HEAD distinction *within* that door (e.g. "does this user see the department-wide Compliance Tracker or only their own dossier") is handled by components calling `getPreciseRole()` directly where it matters, not by inventing a third UI door.

---

## 5 · The API client — built for a bad connection on purpose

`src/lib/api.ts` is a thin `fetch` wrapper (`api.get/post/patch/delete`) that every screen uses instead of calling `fetch` directly. It exists to solve one specific, named problem from the build spec: **"the client's terrible mobile data."** Every call automatically gets:

- **The bearer token attached** (`Authorization: Bearer <token>` from `sessionStorage`), so screens never touch auth headers themselves.
- **A 10s timeout** via `AbortController`, so a hung request doesn't spin forever.
- **Retry with backoff** (2 retries, 500ms then 1500ms) — but only for genuinely retryable failures: network drops, timeouts, and 408/429/5xx responses. A real 400 (bad input) or 401 (bad credentials) is thrown immediately, never retried.
- **An `Idempotency-Key` option**, passed straight through as a header for write calls, matching the backend's idempotency convention (see backend docs §8) — the frontend doesn't invent its own idempotency logic, it just carries the key the caller supplies.
- **Two distinct error types** — `ApiError` (the server responded, just not with 2xx — has a real `status` and `message`) vs. `ApiConnectionError` (the server never responded at all after every retry). Screens use this distinction to show different messages ("Invalid credentials" vs. "Connection is slow — please try again").

Screens are expected to surface an `onRetry` callback into a visible "Retrying…" UI state rather than freezing silently — see `Upload.tsx`'s submit button (`{submitting ? (retrying ? 'Retrying…' : 'Saving…') : 'Submit'}`) for the reference pattern.

---

## 6 · Responsive strategy — two full sibling blocks, not one reflowed layout

There is **no separate "tablet" breakpoint.** Tailwind's defaults are used as-is: below `sm` (640px) is the mobile-native layout, `sm`–`lg` (640–1024px) is already "tablet responsive" by construction, `lg`+ is desktop.

Almost every screen is structured as two complete, parallel JSX trees:

```tsx
<div className="sm:hidden">      {/* mobile-native layout — often genuinely different content, not just resized */}
  {role === 'admin' ? (...) : (...)}
</div>
<div className="hidden sm:block"> {/* tablet/desktop layout */}
  {role === 'admin' ? (...) : (...)}
</div>
```

This looks like duplication, and it partly is — but it's deliberate, not an oversight: the original mobile mockups frequently have a genuinely different information architecture (a list-then-detail flow on mobile vs. a single dense page on desktop), not just a CSS-reflowed version of the same markup. Shared state and handlers are declared once at the top of the component; only the JSX differs between the two blocks. When a "Back" button or a "where do we land after success" callback needs a different destination on mobile vs. desktop (because their navigation structures genuinely differ), you'll see two handlers (e.g. `handleUpdatePassword(onDone?)` in `Profile.tsx`) rather than one handler awkwardly serving both.

---

## 7 · Component patterns worth knowing before you build something new

- **Cards:** `borderRadius: 16–24`, `boxShadow: '0 4px 12px rgba(0,0,0,0.05)'`, `border: '1px solid #e2e8f0'`.
- **Modals:** one `AnimatePresence`-wrapped centered card over a dimmed, click-to-close backdrop; a header row with a title + `X` button. When a modal has multiple sub-views (e.g. Profile's Activity/Privacy/Account modal), it's **one modal component switching body content by an active-view key**, not one modal per case — see `Profile.tsx`'s shared PIN/Devices/Data-Privacy/Account modal for the reference.
- **Dropdowns:** `useState` open flag + a `document`-level click listener added only while open (cleaned up on close), with `onClick={e => e.stopPropagation()}` on the trigger wrapper so opening it doesn't also immediately close it. `Compliance.tsx`'s `CustomDropdown` is the canonical implementation, reused verbatim for the desktop header's identity dropdown in `Layout.tsx`.
- **Toggle switch:** one hand-built `ToggleSwitch` component (green pill ⇄ gray pill, sliding knob) is the *only* on/off control anywhere in the app — every boolean setting reuses it.
- **List rows:** icon box (fixed size) + `flex: 1` text column (title + meta line) + optional trailing badge/chevron. This exact shape recurs across the staff directory, review queue, activity logs, devices, escalations — anywhere a list appears.
- **Entrance animation:** `fadeRise` from `src/lib/motion.ts` — `opacity 0→1`, `y: 12→0`, staggerable via a numeric `custom` index passed to each `motion.*` element, so a screen's sections visibly cascade in on mount rather than popping in at once.
- **Skeleton loading:** `src/components/Skeleton.tsx` — `SkeletonBlock` (pulsing placeholder rectangle, animated via `framer-motion`'s `animate={{ opacity: [0.5, 1, 0.5] }}` with `repeat: Infinity` rather than Tailwind's `animate-pulse`, to stay consistent with the inline-style-owns-visuals convention above), plus three shape presets built on top of it: `SkeletonListRow`, `SkeletonCard`, `SkeletonStaffCard`. Used by `Dashboard.tsx` and `Compliance.tsx` in place of a plain "Loading…" string — replaced screen-by-screen, matching each real layout's actual shape (stat-card grid, list rows, bordered staff card) rather than one generic spinner.

---

## 8 · What each screen actually talks to

| Screen | Staff sees | Admin sees | Real endpoints |
|---|---|---|---|
| `Dashboard.tsx` | Personal next-due date, department compliance %, urgent/registry/reports stat cards, monthly trend, escalation list (UNIT_HEAD only) | Hospital compliance %, total personnel, critical cases, annual clearance progress + monthly breakdown, CSV report exports | `GET /dashboard/overview`, `GET /escalations`, `PATCH /escalations/:id/acknowledge`, `GET /reports/*` |
| `Compliance.tsx` | Own dossier (STAFF) or full department tracker (UNIT_HEAD) | Hospital-wide staff directory with Compliant/Critical/Pending rollup | `GET /me/compliance-summary`, `GET /compliance/tracker`, `GET /compliance/employees/:id/dossier`, `GET /departments` |
| `Upload.tsx` | Upload CXR/GeneXpert results, see own Recent Submissions | Review Queue — approve (with saved signature) or reject pending documents | `POST /documents`, `GET /me/documents`, `GET /review-queue`, `PATCH /documents/:id/review` |
| `Profile.tsx` | Account settings, Activity Logs, Login History, Manage Devices, Data Privacy toggles, Change PIN | Everything staff has, plus Digital Signature capture and admin Performance Overview | `GET/PATCH /me/profile`, `GET /me/activity-logs`, `GET /me/login-history`, `GET/POST/DELETE /me/devices`, `GET/PATCH /me/privacy-settings`, `PATCH /me/security/pin`, `PATCH /me/security/password`, `GET/POST/DELETE /me/signature`, `GET /me/performance-stats` |
| `Layout.tsx` (shared chrome) | Notification bell (real in-app notifications) | Same | `GET /me/notifications` |

Every one of these was, at some point in this build, a hardcoded array sitting at module scope in the screen file. If you ever see a `const someMockLookingArray = [...]` at the top of a screen file today, that's either (a) small structural config that's genuinely static (nav item lists, DTO-shaped option lists) or (b) a known remaining gap — check the file for a comment explaining which.

---

## 9 · How it actually works — three worked code walkthroughs

Everything above explains *what* exists and *why*. This is the *how*: tracing real code line by line so you could rebuild a piece of this yourself.

### 9.1 Walkthrough: how a protected page decides whether to render at all

Every route under `(dashboard)` shares one layout file, and that layout is the *entire* auth check for every page beneath it:

```tsx
// src/app/(dashboard)/layout.tsx
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ready = useAuthGuard('auth')
  if (!ready) return null          // render NOTHING until the check resolves
  return <Layout>{children}</Layout>
}
```

Trace `useAuthGuard('auth')` itself (`src/lib/useAuthGuard.ts`):
```ts
export function useAuthGuard(mode: 'auth' | 'guest') {
  const [ready, setReady] = useState(false)   // (1) starts false — nothing renders yet
  useEffect(() => {
    const authed = isAuthenticated()          // (2) reads sessionStorage — only possible client-side, hence useEffect
    if (mode === 'auth' && !authed) { router.replace('/login'); return }  // (3) not logged in -> bounce, stay `ready=false` forever
    setReady(true)                            // (4) logged in -> flip to true, component re-renders, `children` shows
  }, [mode, router])
  return ready
}
```
The reason this has to be a `useEffect` and not a plain `if (!isAuthenticated())` check at the top of the component: `sessionStorage` doesn't exist during server-side rendering, and Next.js renders every component once on the server first. If you read `sessionStorage` outside a `useEffect`, the server-render crashes. Returning `false` initially and flipping it inside `useEffect` guarantees the check only ever runs in the browser, after hydration — at the cost of a one-frame flash of nothing, which is why `if (!ready) return null` exists.

### 9.2 Walkthrough: a screen going from "loading" to real data on screen

`Dashboard.tsx` is the clearest example of the fetch-then-render pattern every screen uses:

```tsx
const [overview, setOverview] = useState<Overview | null>(null)   // (1) null = "haven't fetched yet"

useEffect(() => {
  api.get<Overview>('/dashboard/overview').then(setOverview).catch(() => {})   // (2) fire once on mount
}, [])                                                                         // (3) empty deps = run once, not on every render

if (!overview) {
  return <div style={{ textAlign: 'center', padding: '80px 0', color: '#a0aec0' }}>Loading…</div>  // (4)
}
const adminData = overview.role === 'admin' ? overview : null    // (5) narrow the response by its own role field
const staffData = overview.role === 'staff' ? overview : null
// ... everything below this line can now safely assume `overview` is real data, not null
```
Step (4) is the whole "no frozen screen on a slow connection" story from a component's point of view: while `overview` is still `null` — whether that's 50ms or 15 seconds on Slow 3G — the component renders a visible `Loading…` state instead of a blank screen or (worse) crashing trying to read `overview.role` on `null`. Every data-fetching screen in this app follows this exact three-part shape: `useState(null)` → `useEffect` fetch on mount → an early-return loading guard before the real render.

### 9.3 How to add a new feature end to end (a real, recently-shipped example)

This is the exact sequence the Compliance Tracker's department filter was converted from a hardcoded array to live data — use it as a template.

**Before:** `const depts = ['All Departments', 'OPD Nursing', 'Radiology', 'Dietary', 'Administration']` sitting at module scope, and a hand-written name→code lookup ternary for the API filter param.

1. **Confirm the backend already has what you need.** `GET /departments` already existed — no backend work required for this one. (If it hadn't, that would have been step 0: go add it in `vmmc backend` first, following its own §11.3 "how to add a new endpoint.")
2. **Add state for the real data**, inside the component:
   ```tsx
   const [departments, setDepartments] = useState<Department[]>([])
   ```
3. **Fetch it on mount**, same three-part shape as §9.2:
   ```tsx
   useEffect(() => {
     api.get<Department[]>('/departments').then(setDepartments).catch(() => {})
   }, [])
   ```
4. **Derive the values the JSX actually needs from that state**, computed fresh on every render rather than stored separately (so they're never out of sync with `departments`):
   ```tsx
   const depts = [ALL_DEPARTMENTS, ...departments.map(d => d.name)]
   ```
5. **Replace the hand-written lookup** with a real lookup against the fetched data:
   ```tsx
   // before: const code = dept === 'OPD Nursing' ? 'OPD' : dept === 'Radiology' ? 'RAD' : ...
   const code = departments.find(d => d.name === dept)?.code
   ```
6. **Delete the now-dead hardcoded array entirely** — don't leave it "just in case."
7. **Type-check** (`npx tsc --noEmit`), then **verify in a real browser**, not just visually — actually select a filter option and confirm the list of results changes, not just that the dropdown shows the right labels. (A dropdown that shows real options but silently doesn't filter anything is a bug that's invisible unless you click through the interaction, not just look at a screenshot.)

The pattern generalizes: **find the hardcoded array → add fetch state → derive the JSX's inputs from that state → delete the hardcoded array → verify the interaction, not just the render.** This is exactly the same sequence every single mock-to-real conversion in this app's build history followed, screen after screen.

---

## 10 · Running it locally

```bash
cd "vmmc frontend"
npm install
cp .env.example .env.local   # NEXT_PUBLIC_API_URL, defaults to the local backend
npm run dev                  # http://localhost:3000 (or $PORT)
```

The backend must be running separately (`vmmc backend`, `npm run start:dev`) for anything beyond the login screen to work — this app has no mock-data fallback anymore.

**Gotchas worth knowing before you hit them:**
- **Never run `next build` or delete `.next` while a dev server might be running against this directory** — both corrupt the live server's `.next` state (500s, "compaction failed"). Use `npx tsc --noEmit` for type-checking any time instead; it's always safe.
- This project hit a real **Turbopack + space-in-path** bug (`Capstone VMMC` has a space) that crash-loops the *dev server* specifically. The dev server is run with `--webpack` as a result (`npx next dev --webpack`). `next build` (production) uses Turbopack fine — the bug is dev-server-specific.
- For **one-off, exploratory** browser verification (not a committed test), install Playwright **outside** this project directory (e.g. a scratch folder) and drive it against the already-running dev server — never a second dev server instance, and never inside this repo's own `node_modules`. For **real, committed** e2e coverage, use the `e2e/` suite at the repo root instead (see below) rather than writing another scratch script.
- Because of §6's dual mobile/desktop blocks, both versions of an element usually exist in the DOM simultaneously (only one is visually shown). A plain `page.getByText('X')` in a test can silently match the *hidden* one first — chain `.locator('visible=true').first()` onto any locator that might match both (`e2e/ui/helpers.ts`'s `visibleText()` at the repo root already does this).

**Testing, two layers:**
- **Unit tests** (`npm test`, Vitest) — scoped deliberately narrow: pure, dependency-free functions in `src/lib/*` (e.g. `calculateAge`/`formatBirthDate`/`toCsv` in `src/lib/format.ts`, `getInitials` in `src/lib/auth.ts`). No jsdom, no component rendering — `vitest.config.ts` runs in a plain Node environment. These functions were deliberately extracted out of the screen components that used to define them inline (`Profile.tsx`, `Dashboard.tsx`) specifically so they could be unit-tested without dragging in React/Next.js/framer-motion just to reach one small function.
- **End-to-end tests** (`npm run test:e2e` from the repo root, Playwright) — real browser, real running app, real backend. Covers actual user flows (login, dashboard, compliance tracker, profile identity) that unit tests deliberately don't touch. See `docs/SYSTEM_ARCHITECTURE.md` §2 for how the two repos' e2e coverage is consolidated in one place.

---

## 11 · If you want to go deeper on one thing

- **The styling convention's real-world failure mode:** search this codebase's git history (or just `FRONTEND_STANDARDS.md` §2) for the border-shorthand-ordering gotcha — a `{ border: 'none', borderTop: '...' }` object where key order silently changes the rendered result.
- **How a screen goes from "loading" to "real data":** `Dashboard.tsx` — it fetches `/dashboard/overview` once, gates the entire render behind a `Loading…` state until it resolves, then narrows the response's `role` field to pick which of the two full render trees to show. Small file to read end-to-end for the "screen talks to real backend" pattern in miniature.
- **The retry/backoff UI pattern in practice:** `Upload.tsx`'s submit flow — trace `onRetry` from `api.ts` through to the button's rendered label.
