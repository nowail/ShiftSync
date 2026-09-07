# ShiftSync — Frontend Build Instructions (for Claude Code)

You are building the **frontend only** for ShiftSync, a multi-location staff scheduling platform for a fictional restaurant group, "Coastal Eats" (4 locations, 2 US timezones). This is a portfolio-grade take-home assessment — the UI must feel like a real, opinionated product, not a generic admin template.

**Scope boundary — read this first:** Work exclusively inside `/frontend`. Do not create, modify, or scaffold anything in `/backend` — that folder is out of scope for this pass and will be built separately. Every data need in this pass is satisfied by a mock data layer described in §5. Structure that layer so swapping it for real API calls later requires touching only one file per resource, not the components.

---

## 1. Tech stack

- **Vite + React + TypeScript** (strict mode on).
- **Tailwind CSS** for styling — configure the design tokens in §3 as Tailwind theme extensions, don't hardcode hex values in components.
- **React Router v6** for routing.
- **Zustand** for client state (auth/session, active role, active location, notification state) — keep it minimal, don't reach for Redux.
- **TanStack Query** for data-fetching *even against the mock layer* — this is the piece that makes the future backend swap trivial (query functions call the mock service now, a real fetch later; components never change).
- **date-fns** + **date-fns-tz** for all date/time logic. Never use raw `Date` math for timezone conversions.
- **Framer Motion** — used sparingly, for exactly one or two orchestrated moments (see §4), not on every card/hover.
- **lucide-react** for icons.
- Component primitives: build your own small set (Button, Input, Select, Modal, Toast, Badge, Tabs, Table) styled with Tailwind rather than pulling in a full component kit — this keeps the visual identity distinctive instead of reading as a UI-kit default.

---

## 2. Design direction (read before writing any CSS)

This is an **operations tool used under real pressure** — a manager needs to find shift coverage at 6pm on a Sunday in under a minute; a line cook needs to check next week's schedule on a cracked phone screen between prep tasks. The design's job is clarity and speed, not decoration. Ground every choice in that.

**Avoid these generic-AI tells entirely:** warm cream background with terracotta accent; near-black background with one neon accent; identical rounded cards with the same soft grey shadow on everything; tracked-out ALL-CAPS eyebrow labels above headings; middle-dot-joined meta strings; a monospace face used just for flavor on data labels.

**Design concept: "the departures board."** The organizing metaphor is an airport/transit departures board crossed with a diner's duty roster — a format built for one job: telling a person exactly where they need to be and when, at a glance, under time pressure. This gives you a legitimate reason to use a confident condensed display face for *actual schedule data* (shift times, staff names on the board) — not as generic decoration, but because that's literally what the content is.

**Color tokens** (define as Tailwind theme colors, named semantically):
- `ink` `#1C2333` — primary dark surface (manager/admin shell background). Warmer and less saturated than pure black — avoid `#0B0B0B`/`#111`.
- `paper` `#F6F4EE` — light surface, staff-facing screens and cards. Warm off-white, not stark white.
- `amber` `#E8A33D` — the one accent color. Used for: premium/desirable shift tags, "on shift now" live indicators, primary CTAs. Spend this color deliberately — it should feel like it means something each time it appears, not decorate everything.
- `brick` `#C1473F` — hard violations / blocked actions (12hr overage, double-booking). Muted brick red, not a neon alert red.
- `moss` `#3E7C6B` — success/confirmed states, published schedules.
- `slate-*` — a full neutral scale for text and borders (generate 5-6 steps between `ink` and `paper`).

**Type:**
- Display/data face: a confident condensed grotesque (e.g. Archivo Expanded/Condensed pairing, or similar) — used for shift times, staff names on the schedule board, and page headings. This is the personality of the product.
- UI/body face: a humanist sans (e.g. Inter) for everything else — forms, body copy, table cells, buttons.
- Set a real type scale (not ad hoc sizes) and don't accent single words with italics/color inside headlines.

**Layout:**
- Manager/Admin shell: fixed left nav rail (icon + label, collapsible), top bar with active-location switcher and current time-in-that-location, main content area. The schedule view itself is the hero screen — a week-grid "board" where each cell is a shift slot, staff assigned to it shown with their name and skill badge.
- Staff shell: **not a squeezed-down manager view** — a distinct mobile-first layout with a bottom tab bar (Schedule / Swaps / Notifications / Profile), single-column card lists instead of a grid. Design this one mobile-first, then scale up, since staff will genuinely use this on a phone.
- Left-align content; avoid center-justified marketing-style layouts — this is a working tool.

**Principles:**
1. Clarity under pressure — the highest-frequency, most time-critical actions (find coverage, approve a swap, see who's on duty now) should be reachable in one glance or one click from the relevant dashboard, not buried in a menu.
2. Calm confidence — reserve `brick` red for genuine hard blocks; warnings (approaching overtime, 6th consecutive day) get a distinct visual treatment (amber-adjacent, not red) so managers can triage severity at a glance.
3. One motion moment: use Framer Motion for the schedule board's publish action (a satisfying, single confirmation animation when a manager publishes a week) and for the real-time "conflict" flash when two managers collide on an assignment. Everything else uses instant or near-instant transitions — no fade-slide-up on every card.
4. Respect `prefers-reduced-motion`, visible keyboard focus rings on every interactive element, real color-contrast (WCAG AA minimum) even within the ink/paper/amber palette.

Before writing components, produce a one-paragraph written design plan confirming these tokens and a rough ASCII wireframe of the manager schedule board and the staff mobile home screen. Check it against the "avoid" list above, then build.

---

## 3. Tailwind theme setup

Configure `tailwind.config.ts` with the semantic color tokens from §2 (not raw hex in components), the two font families, and a type scale with clear steps (e.g. display: 14/16/20/28/40px condensed; body: 13/14/16/18px). Add a `container` max-width tuned for a dashboard (not a marketing site's centered 1200px block).

---

## 4. Information architecture — every screen, by role

Build all of these as real routes with real (mocked) data — no "coming soon" placeholders for anything listed in the assessment brief. Where a feature genuinely depends on backend logic not yet built (e.g. actual WebSocket push), mock the *behavior* with realistic fake events on a timer so the UI demonstrably works end-to-end.

### Shared
- **Login** — role selector (Admin / Manager / Staff) for demo convenience, plus email/password fields (non-functional, mocked auth). This is a take-home demo; make it trivial for a grader to jump into any role.
- **Notification center** — slide-over panel, persisted list, read/unread state, grouped by day. Reachable from a bell icon in both shells.
- **Toast/live-update layer** — global, shows real-time-style events (schedule published, swap resolved, assignment conflict) as they "arrive" from the mock real-time layer.
- **Violation/explanation panel** — a reusable component: when an assignment is rejected, show the specific rule broken in plain language, plus a short list of suggested alternative staff with why they qualify. This single component is used across the manager assignment flow and should be the most carefully designed piece of UI in the app — it's the direct UI expression of the assessment's core requirement.

### Admin
- **Corporate overview** — all 4 locations at a glance: today's coverage status, current week's overtime cost projection per location, count of open violations/unfilled shifts, quick links.
- **Locations & users** — manage locations (name, timezone), manage staff/managers (roles, skills, per-location certifications).
- **Fairness & distribution report** — cross-location view of hours distributed and premium-shift share per staff member, with the ratio-based fairness score from the plan, sortable/filterable.
- **Audit log** — searchable/filterable table (actor, entity, date range, location), with export action (mocked download).

### Manager
- **Schedule board** (hero screen) — week view per location, shift cells with assigned staff, headcount fill indicator, unfilled-shift highlighting, drag-or-click to assign. Publish/unpublish control with the 48-hour cutoff visibly indicated (e.g. a lock icon on shifts inside the cutoff window).
- **Assign staff flow** — selecting a shift opens a panel listing eligible staff; attempting an ineligible one triggers the violation/explanation panel (§ shared) instead of a generic error.
- **Overtime dashboard** — per-staff weekly hours bar (35h/40h markers), daily-hours flags, consecutive-day tracker, a "what-if" preview when hovering/selecting a prospective assignment before confirming.
- **Swap & drop approvals** — queue of pending requests with the current state-machine stage shown clearly (requested → peer accepted → awaiting your approval), one-click approve/reject.
- **On-duty now** — live-updating list of who's currently clocked in at this manager's location(s), pulling from the mocked real-time layer.
- **Shift history** — per-shift audit trail (who changed what, when).

### Staff (mobile-first)
- **My schedule** — upcoming shifts as cards, times shown in the shift's location timezone with the timezone explicitly labeled (important given the multi-timezone requirement), overnight shifts visually shown as a single spanning card.
- **Availability** — set recurring weekly windows + one-off exceptions, simple day-by-day editor.
- **Swaps** — request a swap against a specific shift, offer a drop, browse and claim open shifts you're qualified for; show your 3-pending-request limit clearly if you're at the cap.
- **Profile** — skills, location certifications, desired weekly hours.

---

## 5. Mock data layer

Create `/frontend/src/services/` with one file per resource (`shifts.ts`, `staff.ts`, `locations.ts`, `swaps.ts`, `notifications.ts`, `audit.ts`). Each exports functions with the same signature/shape a real API client would have (e.g. `getShiftsForWeek(locationId, weekStart): Promise<Shift[]>`), backed internally by an in-memory seeded dataset with an artificial small delay (150-300ms) so loading states are real and visible, not instant.

Seed the mock dataset to cover the assessment's own evaluation scenarios so every screen has something meaningful to show on first load: a staff member certified at both a Pacific and an Eastern location; someone already near 38 hours this week; a pending swap request sitting unresolved; an unfilled shift starting soon with only one qualified backup; a published week and a draft week; some past audit history.

Build a tiny mock real-time layer (`/frontend/src/services/realtime.ts`) using a simple event-emitter, with a few scripted events fired on a timer after load (a swap gets resolved, a conflict fires) purely so the toast/notification/on-duty-now UI can be seen working without a real backend yet.

---

## 6. States you must not skip

For every list, table, and board view: design and implement the **loading**, **empty**, and **error** states explicitly — don't let them fall back to a blank screen. Empty states should read as an invitation to act (e.g. "No shifts published yet — create the first one for this week"), not a dead end. Error states name what happened and what to do next, in the interface's voice.

---

## 7. Responsiveness — explicit breakpoints

- **< 640px (mobile)**: staff shell fully mobile (bottom tab bar, single column). Manager/Admin shells collapse the nav rail to icons-only or a drawer; the schedule board becomes a scrollable single-day view with day-switcher tabs instead of a 7-column grid.
- **640-1024px (tablet)**: manager schedule board shows 3-4 days at once with horizontal scroll for the rest.
- **> 1024px (desktop)**: full week grid, nav rail expanded.

Test and visibly verify (describe what you checked) that no layout breaks or overflows at 375px width — that's the real constraint, not just "responsive in principle."

---

## 8. Definition of done for this pass

- Every screen in §4 exists as a real route with real mock data, not a stub.
- The violation/explanation component is genuinely well designed — this is the single most important piece of UI in the whole app.
- Mobile staff experience is designed mobile-first, not a squeezed manager view.
- Loading/empty/error states exist everywhere data is fetched.
- No hardcoded colors outside the Tailwind theme config; no personal names, emails, or identifying info anywhere in code, comments, or mock data.
- `/backend` untouched.
- Written confirmation at the end of the session of what design tokens were used and a short self-critique against the "avoid" list in §2.
