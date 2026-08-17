# Frontend Standards (vmmc-frontend)

This file exists so that anyone — human or AI assistant — picking up this codebase can make changes that match the established design and conventions **without the original author having to re-explain them every time**. If you're an AI assistant working in this repo: read this file before making any UI/UX change, and follow it by default instead of asking the user to specify things it already answers.

If a request doesn't fall under any rule here, follow the closest existing precedent in the codebase rather than inventing something new (see "Design fidelity" below).

---

## 1. Design fidelity — the core rule

**Base every visual change on the UI/UX that already exists in this codebase. Do not invent new visual language.**

This app was originally generated in Figma Make with a deliberate design system (colors, typography, spacing, component shapes). New or changed work must look like it belongs, not like a bolt-on.

- Reuse existing color tokens (section 3), typography (section 4), and component shapes (section 5) — don't pick new ones.
- Before building a new screen/section, find the closest existing screen that solved a similar problem (stat cards, modals, empty states, forms, list rows) and follow that precedent.
- If a genuinely new visual pattern is truly needed with no precedent anywhere in the app, flag it as a decision rather than silently inventing one — but exhaust the "find a precedent" search first.
- **"Match an existing screen's pattern" means reuse its card chrome / spacing / typography conventions — it does NOT mean copying that screen's specific layout shape onto different content.** E.g. a review-queue screen isn't an upload screen just because it lives near one; don't force-fit a dropzone layout, a 4-card stat grid, or a CTA card onto content that isn't semantically the same thing just because a sibling screen happens to have one. When in doubt, check whether the mobile version of the same screen already solved the layout — scale that up before reaching for a different screen's structure.
- Don't assume a shared *label* implies a shared *implementation* across contexts (e.g. two roles both having a "Privacy & Security" row does not mean they lead to the same sub-screens) — verify against the actual target content/mockup before reusing UI wholesale.

## 2. Styling convention — hybrid inline styles + Tailwind

This codebase uses inline `style={{}}` objects for visual styling and Tailwind utility classes **only** for responsive/breakpoint behavior. This was a deliberate choice made during the Vite→Next.js migration to preserve exact visual fidelity without a full rewrite.

- **Colors, fonts, fixed spacing, shadows, border-radius, etc. → inline `style={{}}`.**
- **Layout direction, grid columns, widths, show/hide across breakpoints → Tailwind `className` (`sm:`, `lg:`, `xl:` prefixes).**
- **Never control the same CSS property from both places on the same element.** Inline `style` always wins over a plain Tailwind class for the same property (a Tailwind class needs `!important`/`!` to beat it) — this causes silent, hard-to-spot bugs (e.g. `style={{ display: 'flex' }}` combined with `className="lg:hidden"` will never actually hide the element). When adding responsive behavior to an element that already has a fixed inline value for that property, move that property out of `style` entirely and into `className`.
- **Inline style key order matters for shorthand-vs-longhand collisions.** A border reset must come *before* a directional override in the same object: `{ border: 'none', borderTop: '1px solid #e2e8f0' }` is correct; the reverse order lets the later `border: 'none'` clobber the earlier `borderTop`, producing a default thick black browser border instead of the intended thin gray line. Watch for this pattern anywhere `border`/`borderTop`/`borderBottom`/etc. are combined in one object.
- Prefer Tailwind classes for genuinely new code where there's no existing inline-style precedent to match, but never mix the two mechanisms on one property regardless.

## 3. Color palette

CSS variables in `src/app/globals.css`:

| Token | Hex | Use |
|---|---|---|
| `--vmmc-green` | `#008D46` | Primary brand green |
| `--vmmc-blue` | `#1D3D93` | Primary brand blue |
| `--status-alert` | `#D32F2F` | Alert/critical status |
| `--status-compliance` | `#2E7D32` | Compliant status |
| `--status-warning` | `#F9AB25` | Warning status |
| `--status-info` | `#0288D1` | Info status |
| `--text-primary` | `#121212` | Primary text |
| `--text-body` | `#545454` | Body text |
| `--border-gray` | `#E0E0E0` | Default borders |
| `--surface-white` / `--surface-offwhite` | `#FFFFFF` / `#F4F7F6` | Page/card surfaces |
| `--chrome-navy` / `--chrome-navy-2` | `#0E1E2B` / `#152B3C` | App chrome (header/sidebar) |
| `--chrome-muted` | `#7C8B99` | Muted chrome text |

In practice, most screen-level components use inline hex literals directly rather than always referencing these vars. The **actual recurring palette** used across `src/screens/*.tsx` and `src/components/*.tsx` (reuse these, don't introduce new hex values without checking this list first):

| Hex | Typical role |
|---|---|
| `#1f3151` | Navy — primary text/heading color used constantly across cards |
| `#a0aec0` | Muted gray — secondary/meta text |
| `#008d46` | VMMC green — primary brand actions/accents |
| `#00b06b` | Secondary green (progress bars, success accents) |
| `#e2e8f0` | Standard card/row border |
| `#718096` | Secondary gray text |
| `#f8fafc` / `#f1f5f9` | Light gray fills (tags, subtle backgrounds) |
| `#cbd5e0` | Gray borders (dept tags, dividers) |
| `#4a5568` | Dark gray text (on light gray fills) |
| `#4299e1` / `#2b6cb0` | Blue accents (links, one-off buttons like Upload signature) |
| `#4ade80` | Staff-role accent (light green, e.g. staff title text in desktop chrome) |
| `#e53e3e` / `#c53030` | Destructive/error red (delete/logout buttons, error text) |
| `#fff5f5` | Light red background (destructive button fill) |
| `#38a169` / `#f0fff4` / `#e6f9ee` / `#c6f6d5` | Green success shades (banners, confirmation cards) |
| `#fffaf0` / `#feebc8` / `#b7791f` / `#dd8b3a` / `#fffbea` | Amber/warning shades (pending status, notice cards) — `#b7791f` for text, `#feebc8`/`#fffaf0` for border/bg |
| `#63b3ed` | Admin-role accent (light blue, mirrors `#4ade80`'s role in staff chrome) |

When a screen needs a "destructive secondary action" (delete, reject, logout), reuse `#e53e3e` text on `#fff5f5` background — this exact pairing is already established in 3+ places (Logout, Delete Signature, Reject in Review Queue).

## 4. Typography

- **Headings/labels:** Poppins, weight 700–800.
- **Body:** Public Sans, weight 400–600.
- **Uppercase section labels/badges:** `fontSize: 10-11, fontWeight: 800, letterSpacing: '0.05-0.08em', textTransform: 'uppercase'` — used everywhere a small all-caps label appears (card headers, badges, nav labels). Don't hand-roll a different uppercase-label treatment.

## 5. Component patterns

Reuse these shapes rather than designing new ones:

- **Cards:** `borderRadius: 16-24`, `boxShadow: '0 4px 12px rgba(0,0,0,0.05)'`, `border: '1px solid #e2e8f0'`, white background, `padding: 24-32`.
- **Pills (buttons/badges):** `borderRadius: 999`.
- **Modals:** centered `AnimatePresence`-wrapped card over a dimmed backdrop, header row with a title + `X` close icon, backdrop-click-to-close. One shared modal instance per logical group (e.g. one modal component switching body content by an `activeModal`/`selectedItem` key) rather than duplicating the chrome per case, when the chrome itself is identical and only body content differs.
- **Dropdowns:** `useState` open flag + a `useEffect` document-level click listener added only while open (removed on cleanup) to close on outside-click, with `onClick={e => e.stopPropagation()}` on the trigger's wrapper so the opening click doesn't immediately close it. Chevron rotates 180° via `motion.div animate={{ rotate: open ? 180 : 0 }}`. (Established pattern: `Compliance.tsx`'s `CustomDropdown`, reused verbatim for the desktop header identity dropdown in `Layout.tsx`.)
- **Toggle switch:** the app's only on/off control is the hand-built `ToggleSwitch` component (green pill ⇄ gray pill, sliding knob) — reuse it verbatim for any new boolean setting instead of re-inventing.
- **List rows** (staff directory, review queue, activity logs, devices, etc.): icon box (fixed size, `flexShrink: 0`) + `flex: 1` text column (title + meta line) + optional trailing badge/chevron. This is the dominant list-item shape across the whole app — default to it for any new list.
- **Entrance animation:** `fadeRise` from `src/lib/motion.ts` (`opacity 0→1`, `y: 12→0`, `duration: 0.38`, staggerable via an `i` index param) for new sections appearing on mount. `pageTransition` for route-level transitions.

## 6. Responsive breakpoints

Tailwind defaults are used as-is — **there is no separate "tablet" breakpoint in this codebase.**

| Breakpoint | Width | Meaning here |
|---|---|---|
| (none) | < 640px | Mobile-native layout |
| `sm` | 640px | Mobile → tablet/desktop switch-over starts |
| `lg` | 1024px | Sidebar goes from off-canvas drawer to static; tablet → desktop |
| `xl` | 1280px | Used when a `sm:` breakpoint needs to be pushed coarser (see gotcha below) |

- The **mobile-native block** (`className="flex sm:hidden"` or similar) and the **tablet/desktop block** (`hidden sm:flex`) are usually two full sibling JSX blocks per screen — not one block reflowed with breakpoint classes — because mobile mockups in this app often have genuinely different content/composition, not just a resized layout. Shared state/handlers live once at the top of the component; only the JSX differs. Don't duplicate `{children}` from a shared layout wrapper across two breakpoint blocks — that double-mounts whatever's inside it.
- The **640px–1024px range is the tablet range** — anything gated at `sm` is already "tablet responsive" by construction. When asked to make something "responsive to tablets," audit actual rendering at 640/768/834/900/1024px rather than assuming a missing breakpoint needs to be added.
- **Nested breakpoint gotcha:** a Tailwind responsive prefix keys off *viewport* width, not the actual width available to the element it's on. A `sm:flex-row` nested inside a container that's itself only narrowed by a coarser split (e.g. an outer `lg:flex-row` two-column shell) can collide right at that coarser breakpoint's boundary — the outer split goes 2-column exactly when the inner element also wants to go horizontal, leaving it too cramped. **Rule: a nested responsive class must use a breakpoint at least one tier coarser than the outer layout split it lives inside**, e.g. `xl:flex-row` inside an `lg:flex-row` outer split, not the same `lg:` or finer.
- `document.documentElement.scrollWidth > clientWidth` overflow checks do **not** catch this class of bug (content can clip inside a nested flex/grid child without growing the page's own scroll area). Verify responsive changes by rendering real device viewports (e.g. Playwright's `devices['iPad Mini landscape']`) and looking at the screenshot, not just an automated overflow check.

## 7. Roles (staff / admin)

Auth is `sessionStorage`-only (no backend yet) — `src/lib/auth.ts` stores `vmmc_auth` (boolean) and `vmmc_role` (`'staff' | 'admin'`, default `'staff'`). `getRole()` is the read helper; call it in a `useEffect` (it's not SSR-safe / must run client-side) and re-check on `pathname` change if the value needs to stay live across navigation.

- The 4 dashboard-group screens (`Dashboard.tsx`, `Compliance.tsx`, `Upload.tsx`, `Profile.tsx`) and the shared chrome (`Layout.tsx`) all branch their content on `role` — staff and admin see different content at the same routes, not different routes.
- When adding role-specific content, follow the existing branch structure (`role === 'admin' ? (...) : (...)`) rather than introducing new routes or duplicate page files.
- Each role has its own accent color for identity/branding elements: staff = green `#4ade80`, admin = light blue `#63b3ed` — keep them visually distinguishable wherever both roles' identity appears in the same shared component.
- **Don't invent new nav destinations, sub-screens, or admin capabilities without a concrete request/mockup to point at.** Leave a button/row visually present but inert (no-op on click) rather than guessing what it should do — this codebase has repeated precedent for "flag it as a placeholder, wire it up once the real target is specified" rather than filling gaps speculatively. If you must guess a label/icon for a not-yet-specified nav slot, treat it as provisional and expect it to be corrected later, not as a firm spec.

## 8. Per-breakpoint navigation ("back", "on success, go where") 

When the same logical action (e.g. a "Back" button, or "where do we land after a form successfully submits") has a genuinely different correct destination on mobile vs. desktop **because their forward-navigation structures differ** (e.g. mobile has a real intermediate list screen that desktop skips by going straight from a quick-access card into a sub-view), don't force one shared handler to serve both. Split into two handlers/labels (mobile's original + a `*Desktop` variant, or an optional `onDone`-style callback parameter defaulting to mobile's behavior) rather than compromising one breakpoint's UX to keep the code DRY. Audit any handler that is both (a) shared across breakpoints and (b) has a "where does this navigate to when finished" step for this same class of bug — it tends to recur at both explicit "Back" buttons and success/completion callbacks.

## 9. Verification workflow

- **The user typically runs their own `npm run dev` live throughout a session.** Never run `next build` or delete `.next` while a dev server might already be running against this project directory — both actions corrupt the live server's `.next` state and crash it (500s / "compaction failed" errors), requiring a manual terminal restart. Use `npx tsc --noEmit` for type-checking instead — it's safe to run anytime and doesn't touch `.next`.
- For browser/visual verification, install Playwright **outside** the project directory (e.g. a scratch/tmp directory) and drive it against the already-running `localhost` server rather than starting a second dev server (Next.js only allows one dev-server lock per project directory anyway). Clean up the scratch install afterward; never touch the project's own `node_modules` or `.next` for this.
- Use Playwright's real device profiles (`devices['iPad Mini landscape']`, etc.) over manually guessed viewport pixel numbers when verifying tablet/mobile-specific layout claims.
- `forcedColors: 'active'` media emulation can reproduce Windows High Contrast mode rendering deterministically, without needing to be on that OS — useful if a user reports unexplained black borders/outlines around custom-styled buttons (see section 10).
- Locator gotcha: Playwright's `text=X` / `getByText('X')` do case-insensitive **substring** matching by default, which is unreliable on this app's dual mobile/desktop-block screens (both blocks exist in the DOM simultaneously, only one visible; also substrings like "Confirm" matching "Confirm Password"). Use `getByRole('button', { name: text, exact: true })` and filter to the actually-visible match when a screen has two breakpoint-gated versions of similar text.

## 10. Accessibility trade-off on record

`src/app/globals.css` sets `forced-color-adjust: none` on `html, button, input, select, textarea`. This means the app **always renders its own custom theme even for users with Windows High Contrast Mode (or other forced-colors accessibility modes) enabled**, overriding what would otherwise be a genuine OS-level accessibility accommodation. This was a deliberate, explicit choice (the custom design was judged to matter more here than forced-colors support) — flag this trade-off if a future request touches accessibility more broadly, don't just "fix" it back without checking.

## 11. "Don't invent, don't over-scope" — general default

- Don't add fields, screens, states, or data that no existing mockup/precedent asked for. If a request implies new UI with no shown target, build the narrowest reasonable version and leave genuinely undefined parts inert rather than guessing broadly.
- When asked to "make X work" with no further spec, implement real front-end state/interaction using only patterns already established elsewhere in the app (see section 5) — don't add backend calls, persistence beyond component state, or confirmation dialogs unless an existing precedent already has one for the same class of action (e.g. destructive actions in this app currently have **no** confirm-dialog convention — match that, don't add one unprompted).
- When asked for a "detailed view of X", scope the detail strictly to X itself — not adjacent-but-different data that happens to live on the same screen.
- If unsure whether something is a bug or a deliberate existing behavior, check whether it reproduces on the *other* role/screen first before assuming a fix is needed — some issues turn out to be pre-existing shared-chrome bugs unrelated to the current task, and some "bugs" turn out to be OS/browser settings (e.g. forced-colors mode), not code.

---

**For file locations, dev server setup, and the auth model's mechanics, see [AGENTS.md](AGENTS.md).** This file is about visual/interaction conventions; AGENTS.md is about how to run and navigate the project.
