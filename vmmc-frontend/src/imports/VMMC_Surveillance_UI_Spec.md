# VMMC SURVEILLANCE — UI / UX Build Specification

**For:** Figma Make / Stitch AI (design-generation handoff)
**Product:** VMMC TB DOTS Health Management System — *Staff Personal Surveillance Dashboard*
**Owner:** Veterans Memorial Medical Center · Department of Health (PH) · Data Privacy Compliant (RA 10173)

> **How to use this file.** Feed this whole document to the tool as the master prompt. If the tool struggles with everything at once, generate **Screen 0 (Login)** first, lock the visual language, then generate the remaining screens one at a time so the chrome stays consistent. Attach the 6 reference screenshots and the VMMC seal PNG alongside this file — the AI reads palette and logo placement far better from an image than from hex codes alone.

---

## 0. Design Intent — READ THIS FIRST (anti-generic direction)

This is **not** a generic SaaS dashboard. It is a **government clinical-surveillance command center** for a Philippine military/veterans hospital. It must feel *authoritative, medical, and institutional* — the visual tone of an official health registry, not a startup app. Reject every default "AI dashboard" instinct: no purple gradients, no glassmorphism, no floating emoji, no Inter-everywhere, no generic rounded pastel cards.

The identity rests on **five deliberate motifs**. Preserve all five:

1. **Two-tone institutional wordmark.** "VMMC" and "SURVEILLANCE"/"TRACKER" are always split into two colors — **green + white** on the dark navy chrome, **navy + green** on light surfaces. Never render the wordmark in a single flat color.
2. **Command-center chrome vs. clinical canvas.** The top bar and left sidebar are **deep navy (near-black institutional blue)**; the working area is a **clean off-white clinical canvas**. This high-contrast split is the backbone of the whole system.
3. **Status-driven colored top borders.** Registry/staff cards carry a **thick colored strip along the top edge** — green = compliant/cleared, red = alert/infiltrate. The border color *is* the status; it reads at a glance across a grid.
4. **The VMMC seal.** The circular hospital seal (green/blue crest) appears at real size on login and small in the nav. It is the credibility anchor — treat it as a crest, not a logo blob.
5. **Green gradient "hero" panels.** Key summary panels use a **dark-green diagonal gradient** with light text — evoking a physical status board / badge. Everything else stays flat and clean.

**Tone words:** clinical, official, trustworthy, dense-but-legible, government-grade.
**Avoid:** playful, trendy, glassy, neon, consumer-social.

---

## 1. Design Tokens

### 1.1 Color palette (exact)

**Brand / Primary**
| Token | Hex | Use |
|---|---|---|
| `vmmc-green` | `#008D46` * | Primary brand color, main UI headers, wordmark "VMMC", primary CTAs |
| `vmmc-blue` | `#1D3D93` | Primary navigation accent, key buttons, login CTA, active states |

\* *Source palette listed this as `#008D6G` (invalid hex). `#008D46` is the working value — replace globally if your Figma file specifies otherwise.*

**Status indicators**
| Token | Hex | Meaning |
|---|---|---|
| `status-alert` | `#D32F2F` | Alert red — infiltrate, detected, urgent, non-compliant top border |
| `status-compliance` | `#2E7D32` | Compliance green — cleared, verified, compliant top border |
| `status-warning` | `#F9AB25` | Warning amber — pending actions, caution |
| `status-info` | `#0288D1` | Info blue — informational, reports verified |

**Typography / neutrals**
| Token | Hex | Use |
|---|---|---|
| `text-primary` | `#121212` | Headings, primary text |
| `text-body` | `#545454` | Body copy, captions, secondary labels |
| `border-gray` | `#E0E0E0` | Card borders, dividers, input outlines |

**Surfaces & semantic accents**
| Token | Hex | Use |
|---|---|---|
| `surface-white` | `#FFFFFF` | Main content background, cards |
| `surface-offwhite` | `#F4F7F6` | Page canvas behind cards, subtle contrast fills |
| `compliance-bg` | `#C8E6C9` | Soft-green fill for compliant rows / cleared badges |
| `info-bg` | `#BBDEFB` | Soft-blue fill for info / pending states |

**Derived chrome colors (not in the sheet — required for the navy shell)**
| Token | Hex | Use |
|---|---|---|
| `chrome-navy` | `#0E1E2B` | Top bar + sidebar base (deep institutional navy, ~near-black blue) |
| `chrome-navy-2` | `#152B3C` | Slightly lighter navy for the user pill / hover rows in nav |
| `chrome-muted` | `#7C8B99` | Muted labels inside navy chrome ("NAVIGATION MENU", timestamps) |
| `hero-green-from` | `#0B3D2E` → `hero-green-to` `#008D46` | Diagonal gradient for hero status panels (dark → brand green) |

### 1.2 Typography

Use a **geometric humanist sans for display/headings** and a **clean neutral sans for body**. Do **not** use Inter for everything.

- **Display / wordmark / headings:** **Poppins** (fallback: Montserrat) — SemiBold/Bold. This gives the rounded, confident institutional feel seen in the mockups.
- **Body / labels / data:** **Public Sans** (fallback: Inter) — a US-gov-style workhorse that suits a health registry.

| Style | Font | Size | Weight | Case / Tracking |
|---|---|---|---|---|
| Wordmark "VMMC …" | Poppins | 20px | 700 | UPPERCASE, tight |
| Page title (e.g. "Profile & Security") | Poppins | 26px | 700 | Sentence case |
| Page subtitle | Public Sans | 14px | 400 | `text-body` |
| Card / section header | Poppins | 13px | 600 | UPPERCASE, +0.06em tracking, `text-body` |
| Big stat number ("142", "Dec 20, 2026") | Poppins | 28–40px | 700 | — |
| Body text | Public Sans | 14px | 400 | `text-body` |
| Micro label / caption / timestamp | Public Sans | 11–12px | 500 | UPPERCASE for labels, `chrome-muted`/`text-body` |
| Badge / pill text | Public Sans | 11px | 600 | UPPERCASE |
| Button label | Poppins | 13px | 600 | UPPERCASE for chrome buttons, Sentence case for form buttons |

### 1.3 Shape, spacing, elevation

- **Corner radii:** cards `14px`; buttons/inputs/badges `8px`; pills/avatars `full`; hero panel `16px`.
- **Card style:** `surface-white`, `1px solid border-gray`, soft shadow `0 1px 3px rgba(16,30,43,0.06)`. Flat and crisp — no heavy drop shadows.
- **Spacing scale:** 4 / 8 / 12 / 16 / 24 / 32. Content padding `32px`. Card padding `20–24px`. Grid gap `20px`.
- **Colored top border on status cards:** `6px` solid strip flush to the top edge, filling the full card width, matching card radius on the top corners.
- **Icons:** thin-to-regular line icons (Lucide / Phosphor style). Never filled emoji.

---

## 2. Global Layout (applies to all authenticated screens: 1–4)

Two fixed regions of navy chrome frame a light scrolling canvas.

### 2.1 Top bar (`chrome-navy`, height ~64px, full width)
Left → right:
- **VMMC seal** (circular crest) ~40px.
- **Wordmark block:** line 1 = "**VMMC**" in `vmmc-green` + "**SURVEILLANCE**" in white, 20px Poppins 700, UPPERCASE. Line 2 = "TB DOTS & PULMONARY COMPLIANCE REGISTRY" 10px, `chrome-muted`, UPPERCASE, +tracking.
- **Center-right facility block** (right-aligned text): "Veterans Memorial Medical Center" white 13px 600; below it "Staff Personal Surveillance Dashboard" in `vmmc-green` 11px.
- **User pill** (`chrome-navy-2`, rounded-full, right end): green circular avatar with initials "**JD**", then "Juan Dela Cruz, RN" white 13px 600 + "Nurse Unit Supervisor" `vmmc-green` 11px, then a down-chevron.

### 2.2 Left sidebar (`chrome-navy`, width ~230px, full height)
- Label "NAVIGATION MENU" 10px `chrome-muted` UPPERCASE, top.
- Nav items, each = line icon + label, 14px, vertical rhythm ~48px:
  1. Home Dashboard (Screen 1)
  2. Compliance Tracker (Screen 4)
  3. Results & Upload (Screen 3)
  4. Profile Settings (Screen 2)
- **Active item:** filled pill background in `vmmc-blue` with a subtle left glow, white text, icon tinted. Inactive: `chrome-muted` text, transparent bg, hover = `chrome-navy-2`.

### 2.3 Content canvas
- Background `surface-offwhite`. Left-padded from the sidebar, top-padded from the bar.
- Every screen opens with a **page title (Poppins 26/700)** + one-line **subtitle** (`text-body` 14px).

---

## 3. Shared Components

**Primary button (green):** `vmmc-green` fill, white label, radius 8px, e.g. "SAVE CHANGES", "BROWSE FILE", "INSPECT DEPARTMENT STAFF". Hover darken ~8%.
**Primary button (navy/dark):** near-black fill, white label, e.g. "View Official X-Ray PDF", "UPLOAD LABORATORY DOCUMENT".
**Login CTA (blue):** `vmmc-blue` fill, full-width, "Log in as Staff".
**Text-link action:** `vmmc-green` UPPERCASE 12px, no underline (e.g. "CHANGE PIN", "CONFIGURE", "REVIEW SETTINGS").
**Danger/logout button:** soft pink fill `#FDECEC`, `status-alert` text, e.g. "LOGOUT FROM SESSION".

**Status badge (pill):** rounded-full, 11px 600 UPPERCASE, with a leading dot.
- Cleared / Not Detected / Verified / On Track → text `status-compliance`, fill `compliance-bg`.
- Infiltrate / Detected / Alert → text `status-alert`, fill `#FDE7E7`.
- Info / Pending → text `status-info`, fill `info-bg`.

**Department tag:** neutral grey pill, `#EFEFEF` fill, `text-body`, UPPERCASE (NURSING, ADMIN, RADIOLOGY, DIETARY).

**Input field:** white fill, `1px border-gray`, radius 8px, label above in 11px UPPERCASE `text-body`. Focus ring `vmmc-blue`.

**Card:** per §1.3. **Status card:** card + colored `6px` top strip.

---

## 4. Screens

### Screen 0 — Login / Portal (reference image 6)
Full-viewport split, no sidebar. Slim navy top bar present (seal + wordmark left; facility block right).

**Left panel (~55%)** — soft diagonal gradient from white to pale green:
- Large **VMMC seal** crest.
- Wordmark **"VMMC" (`vmmc-blue`) "TRACKER" (`vmmc-green`)** — very large, ~44px Poppins 700; beneath it "TB DOTS & X-RAY COMPLIANCE MANAGEMENT SYSTEM" `vmmc-blue` UPPERCASE small.
- Headline (navy, Poppins 28/700): "Secure Hospital-wide Clinical Screening & Surveillance Portal".
- Paragraph in `text-body`: designed exclusively for clinicians, laboratory technicians, and administrators of Veterans Memorial Medical Center — monitor employee pulmonary compliance clearances, upload diagnostic X-Rays, and coordinate follow-up molecular testing loops.

**Right panel — login card** (white, radius 14px, soft shadow):
- "Log In" heading (Poppins 22/700) + subtitle "Input your secure credentials below to enter the active pulmonary compliance registry."
- **Segmented toggle:** two tabs — "STAFF LOGIN" (active = `vmmc-blue` fill, white) / "ADMIN LOGIN" (inactive = grey).
- Field "EMPLOYEE ID" — placeholder "Enter ID number".
- Field "PASSWORD" — placeholder "Enter password", trailing eye toggle icon.
- Row: green checkbox "Remember Me" (left) · "Forgot Password?" link `vmmc-green` (right).
- Full-width `vmmc-blue` button "Log in as Staff".
- Fine print: "BY LOGGING IN, YOU AGREE TO THE **TERMS OF SERVICE** AND **PRIVACY POLICY**" (linked words bold).
- Footer inside card: "AUTHORIZED ACCESS ONLY" in `vmmc-green`, UPPERCASE, centered.

**Page footer strip:** "Veterans Memorial Medical Center • Department of Health   |   Data Privacy Compliant (RA 10173) • Intranet Code Active" — tiny `text-body`.

---

### Screen 1 — Home Dashboard: "Staff Health Status Overview" (reference image 5)
Nav active: **Home Dashboard**. Title + subtitle "Real-time surveillance analytics, personal checkups, and department compliance tracking."

**Row A — two panels side by side:**
- **Hero status panel (left, ~65%)** — `hero-green` diagonal gradient, white text, radius 16px:
  - Top row: dark pill tag "SURVEILLANCE PERIOD" (left) · green pill "ANNUAL CYCLE: 2026" (right).
  - Huge date "**Dec 20, 2026**" (Poppins ~40/700).
  - Line with green dot: "NEXT COMPLIANCE DUE: DEC 20, 2026".
  - **Pending-actions inset** — darker translucent box, warning ⚠ icon, "PENDING ACTIONS" label + "Complete Chest X-Ray screening".
  - Footer 3-col meta: Department = Nurse · VMMC Unit ID = VMMC-02-1234 · Last Audited = Nov 12, 2025.
- **Department compliance card (right, ~35%)** — white:
  - Header "MY DEPARTMENT COMPLIANCE".
  - "**92% Done**" + green "On Track" pill.
  - **Circular progress ring** in `vmmc-blue`, center label "**04** PENDING STAFF".
  - Full-width `vmmc-green` button "INSPECT DEPARTMENT STAFF →".

**Row B — four equal stat cards** (white, each: soft-tinted square icon top-left, big number, small UPPERCASE label):
1. ⚠ (red tint) — "URGENT ACTIVE ACTIONS" — **3 Cases**
2. ✓ (green tint) — "REGISTRY COMPLIANCE" — **142 Completed**
3. 📄 (blue tint) — "REPORTS VERIFIED TODAY" — **11 Files**
4. ⟳ (blue tint) — "REGISTRY CYCLE REFRESH" — **Bi-Annual**

**Row C — call-to-action banner** (white, full width): left icon + "Are you ready to submit your latest pulmonary laboratory report?" (bold) with subtext about uploading official CXR scans or GeneXpert assays for instant department verification; right = dark button "UPLOAD LABORATORY DOCUMENT".

---

### Screen 2 — Profile & Security (reference image 2)
Nav active: **Profile Settings**. Title + subtitle "Manage personal details, inspect surveillance audits, review login sessions, and edit security constraints." Two-column layout.

**Left column (~34%):**
- **Profile card:** green banner top; overlapping circular avatar "JD"; name "Juan Dela Cruz, RN" (bold); "NURSE UNIT SUPERVISOR" in `vmmc-green` UPPERCASE; "VMMC NURSE UNIT • VMMC-02-1234" caption. Full-width soft-pink "LOGOUT FROM SESSION" button.
- **Activity Logs card:** header "ACTIVITY LOGS" + right pill "INTERACTIVE LOG". Vertical list, each entry = green status dot + title + timestamp/IP caption:
  - Secure Login Successful — May 27, 2026, 11:10 PM · IP: 192.168.12.105
  - Accessed Health Registry Tracker — May 27, 2026, 11:11 PM · IP: …
  - Downloaded Official Report: John Doe — May 27, 2026, 11:12 PM · IP: …

**Right column (~66%):**
- **Account Settings card:** gear icon + "ACCOUNT SETTINGS". Fields: "DISPLAY NAME" = Juan Dela Cruz, RN · "EMAIL ADDRESS" = j.delacruz@vmmc.gov.ph · "OFFICE PHONE / MOBILE NO." = +63 917 123 4567. Bottom-right `vmmc-green` "SAVE CHANGES".
- **Privacy & Security card:** lock icon + "PRIVACY & SECURITY". Three rows, each = icon + title + one-line description + right-aligned green text-link:
  - Change PIN — "Secure your desktop surveillance account with a unique lockpin." → **CHANGE PIN**
  - Manage Registered Devices — "View and authenticate mobile phones linked to your VMMC Supervisor profile." → **CONFIGURE**
  - Data Privacy Settings — "Enforce health registry encryption and adjust data telemetry visibility rules." → **REVIEW SETTINGS**

---

### Screen 3 — Results & Upload: "Upload Pulmonary Laboratory Reports" (reference image 3)
Nav active: **Results & Upload**. Title + subtitle "Submit chest diagnostic films or GeneXpert assays. Documents will be cryptographically logged and evaluated immediately." Two columns.

**Left (~60%) — dropzone card:** large **dashed `border-gray` rounded rectangle**, centered contents: cloud-upload line icon, "Upload New Medical Result" (bold), "Drag and drop your certified PDF report here, or click to browse files from your local storage." (`text-body`), `vmmc-green` "BROWSE FILE" button, caption "Accepted filetypes: PDF only • Max limit: 10MB".

**Right (~40%) — Recent Submissions card:** header "RECENT SUBMISSIONS". File row = green file-icon tile + "CXR_Official_Result.pdf" (bold) + "Chest X-Ray • 1.4 MB" + "May 27, 2026, 11:14 PM" + right green "VERIFIED" badge. Empty-state footer text, centered `text-body`: "Missing a previous cycle report? Contact the Pulmonary Surveillance archives to retrieve previous records."

---

### Screen 4 — Compliance Tracker: "Staff Pulmonary Registry" (reference image 4)
Nav active: **Compliance Tracker**. Title + subtitle "Filter, inspect, and evaluate surveillance compliance status of personnel across clinical sectors."

**Filter bar:** wide search input "Search employee or peer compliance state…" + right dropdown "All Departments".

**Staff card grid — 3 columns, gap 20px.** Each card is a **status card** (colored `6px` top strip = red if any alert, green if fully cleared):
- Name (bold, may wrap two lines) + right-aligned department tag pill.
- Employee ID + role caption (e.g. "VMMC-23-4567 · Staff Nurse").
- **CHEST X-RAY** row: label left, status badge right (● Infiltrate (L) red / ● Cleared green).
- **GENEXPERT** row: label left, badge right (● Detected red / ● Not Detected green).
- Footer: "Exam: OCT 12, 2025" (date, green month) left · dark "View Official X-Ray PDF" button right.

Sample data to render (preserve red/green mix so the top-border logic is visible):
| Name | Dept | ID · Role | Chest X-Ray | GeneXpert | Exam | Strip |
|---|---|---|---|---|---|---|
| Mariel Reyes | NURSING | VMMC-23-4567 · Staff Nurse | Infiltrate (L) | Detected | OCT 12, 2025 | red |
| John Doe | ADMIN | VMMC-21-1209 · Admin Assistant | Cleared | Not Detected | NOV 05, 2025 | green |
| Ricardo Sanchez | RADIOLOGY | VMMC-23-4567 · Staff Nurse | Infiltrate (L) | Detected | OCT 12, 2024 | red |
| Robi Bartolome | ADMIN | VMMC-25-005 · HR Officer | Cleared | … | … | green |
| Joselito Manalo | NURSING | VMMC-23-051 · Head Nurse | Cleared | … | … | green |
| Rafael Mendoza | DIETARY | VMMC-23-019 · Chief Chef | Cleared | … | … | green |

Grid scrolls vertically; keep consistent card heights per row.

---

## 5. Interaction & State Notes (for tools that build logic, e.g. v0)

- **Sidebar nav** switches the active screen; active item uses the `vmmc-blue` pill.
- **Login toggle** (Staff/Admin) swaps the active tab styling and the CTA label ("Log in as Staff" / "Log in as Admin").
- **Password eye** toggles field visibility.
- **Dropzone** highlights border to `vmmc-green` on drag-over; on drop, add a row to Recent Submissions with a "VERIFIED" badge.
- **Status badges & card top borders are data-driven:** any red result (Infiltrate / Detected) forces the red top strip; all-clear forces green.
- **Circular progress ring** reflects the department completion %.
- **Save Changes** persists the profile fields (local state is fine for the prototype).

---

## 6. Do / Don't recap for the generator

**DO:** deep-navy chrome + off-white canvas · two-tone VMMC wordmark · colored 6px status top borders · green gradient hero panel · dotted status badges · the circular seal as a real crest · Poppins headings.

**DON'T:** single-color wordmark · purple/neon gradients · glassmorphism · drop-shadow-heavy cards · emoji · Inter for everything · rounded pastel "friendly app" look. This is a government health-surveillance system — keep it institutional.
