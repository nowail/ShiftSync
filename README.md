# ShiftSync

Multi-location staff scheduling for a fictional restaurant group, "Coastal Eats." Built as a
take-home assessment: a fully-designed React frontend (originally mock-data-driven) backed by
a real Node/Express/Postgres (Neon) API built out phase-by-phase, with a documented constraint
engine, real-time updates, and analytics.

- Frontend design decisions: `frontend/README.md`
- Backend built phase-by-phase — each phase has its own commit, see `git log --oneline`

## Deployed URLs

_Pending — see "Deployment" below. This section will be filled in once hosting is chosen and
the app is actually deployed._

- Frontend: TBD
- Backend API: TBD

## Login

Every seeded account shares one password. Pick a role on the login screen to prefill a demo
email, or use any of these directly:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@coastaleats.com` | `password123` |
| Manager (Downtown SF) | `casey.manager@coastaleats.com` | `password123` |
| Manager (Midtown NYC) | `devon.manager@coastaleats.com` | `password123` |
| Staff | `kayla.lee@coastaleats.com` | `password123` |

Any other seeded staff member's email also works with `password123` — the login screen's role
selector is a UI convenience, not an access boundary; the real check is server-side JWT + role.

## Running locally

```bash
# Backend
cd backend
cp .env.example .env   # set DATABASE_URL to your Neon connection string
npm install
npx prisma migrate deploy
npm run db:seed
npm run dev             # http://localhost:4000

# Frontend, in a second terminal
cd frontend
cp .env.example .env    # VITE_API_URL=http://localhost:4000
npm install
npm run dev              # http://localhost:5173
```

See `backend/README.md` for stack notes (why Prisma is pinned, local-Postgres-vs-Neon, the
exclusion-constraint migration) and `frontend/README.md` for design decisions.

## Resetting the demo to a clean state

```bash
cd backend
npm run db:seed
```

The seed script fully wipes and rebuilds every table (in FK-safe order) before reseeding —
it's the same script used for the initial setup, safe to re-run at any time. Confirmed during
Phase 7: after a full development/testing session that had accumulated significant
throwaway data (30 users, 222 shifts, 187 assignments, 57 swap requests, 351 audit entries —
every scenario walkthrough and test script run in this README's own verification left real
rows behind), one `npm run db:seed` brought the database back to exactly the clean seed
baseline (14 users, 117 shifts, 101 assignments, 3 swap requests, 6 audit entries) with no
manual cleanup. Safe to run before a grading session, or between them.

---

## Demo guide: the six eval scenarios

Each of the following was walked end-to-end against the real backend during Phase 7 (verified
via direct API calls against live Neon data, not assumed) before being written up as a
click-path below. All six work from a freshly-seeded database; none require you to have
already set anything up beforehand, except where noted.

### 1. Sunday Night Chaos (speed of coverage-finding)

Demonstrates the full drop → manager approval → pickup → manager approval cycle, and the
real-time push that makes it fast.

1. **As staff** (`kayla.lee@coastaleats.com`): open two browser windows/tabs. In the first,
   log in as Kayla and go to **Swaps**. Under "My upcoming shifts," pick any shift and click
   **Drop**.
2. **As manager** (`casey.manager@coastaleats.com`), in the second tab: go to **Swaps & Drops**.
   The drop request appears in the pending list (live — no refresh needed, per the Phase 5
   Socket.IO wiring). Approve it.
3. **As a different, qualified staff member** (any staff member certified for that shift's
   skill at Downtown SF, e.g. `priya.nair@coastaleats.com`): log in, go to **Swaps** — the
   now-open shift appears under "Open shifts you can claim" (computed live from real
   certification + availability + schedule-conflict checks, not a static list). Click **Claim**.
4. **As manager** again: back on **Swaps & Drops**, approve the claim. The shift now shows the
   new staff member assigned on the **Schedule Board**.

**What this proves:** the drop/claim state machine (Phase 4), the real engine re-checking
eligibility at claim time (not just at request time), and the Socket.IO live updates (Phase 5)
that let a manager and staff member see each other's actions without polling — the actual
point of "speed of coverage-finding."

### 2. Overtime Trap

1. **As manager**, go to the **Overtime dashboard** and note who's closest to 35–40h this
   week (the per-staff hour bars, sorted with the highest first).
2. Go to the **Schedule Board**, find an open shift, and assign it to that staff member. The
   engine allows the assignment (weekly overtime is a **soft** warning, not a hard block) but
   returns a `weekly_overtime` violation in the response — visible as a toast/notice, and the
   location's managers get an `overtime_warning` notification (check the bell icon).
3. Back on the **Overtime dashboard**, the assignment now shows: the staff member's hour bar
   crosses the 40h reference line (turns red), and the **Projected weekly overtime cost** KPI
   at the top increases — computed as `max(0, hours-40) × $19/hr × 1.5`, the same formula the
   original frontend mock used, now computed server-side from real Assignment rows.

**What this proves:** the engine's soft-vs-hard violation distinction (assignment isn't
blocked, just flagged), the overtime-warning notification to managers (§7), and the
Overtime dashboard's real, backend-computed hours-so-far and cost projection (Phase 6).

### 3. Timezone Tangle

Alex Chen (`alex.chen@coastaleats.com`) is seeded certified at **Downtown SF** (Pacific) *and*
**Midtown NYC** (Eastern) — the deliberate cross-timezone certification case.

1. **As Alex** (`alex.chen@coastaleats.com`): go to **Availability** and add a recurring
   window — e.g. **Wednesday 06:00–14:00**. (A fresh seed gives Alex no availability rules at
   all, so this step makes the scenario concrete; any window works, the point below holds for
   any of them.)
2. **As a manager scoped to Midtown NYC** (`devon.manager@coastaleats.com`): on the
   **Schedule Board**, create a shift at Midtown NYC on the next Wednesday, **08:00–12:00
   Eastern**. Open the assign panel and pick Alex Chen — he shows as an **eligible candidate**
   and the assignment succeeds.
3. Now try a shift the same Wednesday at **15:00–18:00 Eastern**. Alex is now correctly
   **blocked** ("falls outside Alex Chen's declared availability window for that day").

The reason this is a genuine test and not a coincidence: 08:00 Eastern is 05:00 Pacific, and
15:00 Eastern is 12:00 Pacific — both technically **outside** Alex's 06:00–14:00 window if it
were (incorrectly) checked against his *home* timezone. The engine evaluates availability
against the *shift's own* location-local time — the documented Timezone Tangle decision
(`frontend/README.md`'s "Intentional Ambiguities") — so 08:00 Eastern correctly passes and
15:00 Eastern correctly fails, using the shift's location, not Alex's home location.

### 4. Simultaneous Assignment

**Automated evidence** (the actual proof — see `backend/scripts/race-test-simultaneous-assignment.ts`):

```bash
cd backend
npx tsx scripts/race-test-simultaneous-assignment.ts
```

Fetches a real staff member's real availability, builds two different shifts inside a real
available window, and fires both `POST /shifts/:id/assign` requests **concurrently** for the
same staff member. Expected (and confirmed, 7 consecutive runs during Phase 7): exactly one
`200`, one `422` from the **Postgres exclusion constraint** (not the app-level pre-check —
the script checks the actual error message to tell the two apart), no raw `500`, no
double-booking committed.

**Manual click-path** (same race, visible live): as the same manager, open the Schedule Board
in two browser tabs. Create two shifts with overlapping times. In both tabs, open the assign
panel for the same staff member on the two different shifts, and click **Assign** in both
tabs as close together as you can. One succeeds; the other tab shows a live red
**"Assignment conflict"** toast — pushed the instant the database catches the race (Phase 5's
`assignment.conflict` socket event), not on the next page load.

### 5. Fairness Complaint

1. **As admin** (`admin@coastaleats.com`): go to **Fairness & distribution**.
2. The **KPI strip** (Lowest/Highest/Company average fairness score) is the location-level
   view — each location's share of the company's premium shifts relative to its share of
   total hours worked, ~1.0 meaning proportional.
3. The **table** below is per-staff: find any staff member's row and check their **Fairness
   score** column against the arithmetic printed under "Known limitations" below — both
   numbers are backend-computed (`GET /fairness`, `GET /fairness/locations`), not derived in
   the browser.
4. To manufacture an actual complaint-worthy case: assign a staff member several Friday/
   Saturday evening (≥5pm local) shifts in a row via the Schedule Board, then a mostly-
   daytime week for someone else — the ranked list ("Ranked by premium-shift share") and the
   bar chart will visibly separate the two.

### 6. Regret Swap

1. **As staff** (any staff member with an upcoming shift, e.g. `marcus.cho@coastaleats.com`):
   go to **Swaps**, pick a shift under "My upcoming shifts," click **Request swap**, and pick
   a target teammate.
2. Still as that staff member, under "My requests," click **Withdraw** on the request you just
   made — before the manager (or the target peer) has acted on it.
3. Check the **Schedule Board**: the original shift is still assigned to the original staff
   member, completely untouched. The swap request's stage is `cancelled`.

This is the literal "Regret Swap" answer from `BACKEND_PROMPT.md`: withdrawing before manager
approval **only** cancels the request — the original assignment was never touched while it was
pending, so there's nothing to revert.

---

## Known limitations and documented ambiguity decisions

These are genuine ambiguities in the assessment brief and frontend mock that needed an answer
to build the backend, restated plainly (most were already logged in
`frontend/README.md`'s "Intentional Ambiguities" during Phase 1; a few were resolved later,
as noted):

- **De-certification keeps historical data.** Revoking a certification sets `revokedAt`; the
  row is never deleted, and past assignments made while it was active are never retroactively
  touched.
- **`desiredWeeklyHours` is a soft signal only** — never referenced by the constraint engine,
  just profile data a manager can see.
- **Consecutive-day counting is per-calendar-day, regardless of shift length** — a 2-hour
  shift and a 12-hour shift both count as exactly one day worked, in the shift's own
  location-local calendar date.
- **Editing a shift after its swap has been approved re-runs the constraint engine** against
  the new assignee at the new time; a resulting failure surfaces as a `409 swap_conflict`
  rather than silently applying the edit or reverting the swap.
- **Timezone-spanning locations are out of scope** — `Location.timezone` is a single IANA
  string.
- **Availability windows are interpreted in the shift's own location-local time**, not a
  staff member's home-location time (Timezone Tangle, demonstrated above).
- **Drop requests expire 24h before shift start, computed at read time** — the persisted
  `stage` never changes just because time passed; only the *displayed* stage does (`expired`).
  No cron dependency, by design.
- **A pending swap auto-cancels (with notification to both parties) if the manager edits that
  shift** while it's still pending — a *pending* swap hasn't taken effect, so there's nothing
  to protect by blocking the edit; an *approved* swap's assignee is instead re-checked against
  the new shift (see above).
- **The 7th consecutive day worked is the only overridable hard violation** — every other hard
  block (double-booking, cert mismatch, 12h daily cap, 10h rest gap, unavailable) can never be
  forced through, no matter what.
- **Premium-shift tagging is a computed property, not a stored flag** — Fri/Sat starting ≥5pm
  location-local, derived fresh on every read (and kept in sync on write, as DB hygiene only).
  Never client-settable. See "What was found and fixed" below for why this mattered.
- **Overtime cost has no real wage data behind it** — the schema has no per-staff pay rate
  anywhere, so cost is projected at a flat mock rate (`$19/hr × 1.5` for hours over 40/week),
  carried over verbatim from the frontend mock's own placeholder. A real deployment would need
  actual wage data per staff member or role.
- **The fairness score can look extreme on a thin data week.** Both fairness metrics are
  ratios over whatever premium shifts exist that week — and in a typical seeded week there are
  very few (sometimes exactly one) premium shift company-wide. When almost the entire
  "premium" pool belongs to one person, their score isn't a meaningful signal of systemic
  unfairness, just an artifact of a tiny sample size. Concretely (verified against a fresh
  `npm run db:seed` reset, current week): with one premium shift company-wide held by Kayla
  Lee (1 of her 5 shifts that week, 40h out of 422h worked company-wide), her per-staff
  fairness score computed to 2.11, and Downtown SF's location-level score (holding that same
  shift, 166 of the company's 422 hours) computed to 2.54 — both far from the ~1.0
  "proportional" center, from a single shift. These exact numbers will drift slightly between
  seed runs (shift assignment has some randomization), but the shape of the effect — a lone
  premium shift producing a score well above 2 — reproduces every time. A real deployment
  would want either a longer rolling window (e.g., trailing 4 weeks) or a minimum-sample-size
  guard before treating a score as actionable. Not fixed in this build — flagged as a known
  limitation, not a bug.
- **There are two structurally different "fairness score" metrics on the same screen** — the
  KPI strip (location-level: a location's *pool share* of premium shifts ÷ its *pool share* of
  hours, centered near 1.0) and the per-staff table column (a *personal ratio* of premium-to-
  total shifts, divided by a *pool share* of hours — mathematically unbounded, and not
  designed to land on the same scale as the KPI strip). Both are real, both are correct for
  what they each measure, but they are not comparable to each other. See "What was found and
  fixed" below.
- **On-duty-now presence pushes are a best-effort convenience, not the source of truth.**
  Live `presence.clockIn`/`clockOut` socket events are scheduled via in-memory timers bounded
  to roughly 20 days out (under Node's ~24.8-day `setTimeout` ceiling) — a shift assigned
  further in the future than that won't get an instant push when its time arrives. `GET
  /presence`, computed fresh from real Assignment/Shift rows at read time, is unaffected and
  is what the dashboard's 15-second poll always falls back to — so the dashboard is never
  wrong, just occasionally not instant for very-far-future assignments.

## What was found and fixed during the backend build

In the spirit of the frontend's own documented bug-hunting pass, here's what actually broke
and got fixed while building the backend — not just what shipped:

- **The notify()-inside-transaction timeout (Phase 4).** `PATCH /shifts/:id`'s auto-cancel-
  pending-swaps path started returning raw `500`s under real Neon latency. Root cause,
  confirmed from the actual stack trace, not guessed: `notify()` was writing notifications on
  the same Prisma interactive transaction as the shift edit itself — several sequential
  network round trips (one per notification recipient) that could push the whole transaction
  past Prisma's 5000ms default timeout. Prisma doesn't fail cleanly at that point; it silently
  kills the transaction in the background while the JS callback keeps running, and the *next*
  `tx.*` call throws `P2028` well after the real deadline. Fixed by moving every notification
  write (and later, every Socket.IO emit) to run after the mutation's transaction commits,
  using the pooled bare Prisma client instead of the transaction's dedicated connection —
  notifications have no correctness reason to be atomic with the mutation they describe. This
  surfaced a follow-on investigation into which other mutation endpoints had the same
  before/after-work-outside-the-transaction blind spot; the swap approve/reject handlers did,
  and got the same fix.
- **Cold-start vs. genuine round-trip serialization, disentangled with data, not assumption.**
  After the fix above, repeated timing tests on `PATCH /shifts/:id` still showed noisy,
  non-monotonic response times (5–9s on some runs). Rather than attribute this to Neon
  connection-pool cold start without evidence, a 5-run-from-cold-restart test was used
  specifically to check — and the pattern (a reversal partway through, not a clean decay)
  didn't match cold-start alone. Further investigation found a real, previously-uncounted
  blind spot: only round trips *inside* the transaction had been counted; the full handler
  actually made roughly 13 sequential round-trip-equivalents, only 6 of them inside the
  transaction. Fixed by batching genuinely-independent lookups (confirmed independent by
  tracing data dependencies first, not wrapped blindly in `Promise.all`) and skipping the
  approved-swap re-check entirely when an edit doesn't touch time or skill.
- **The headcount race (Phase 3).** A second, different race from the staff-double-booking one
  above: two managers assigning two *different* staff members to the *last* open seat of a
  multi-seat shift. The Postgres exclusion constraint keys on `staffId` and does nothing here.
  Fixed with a `SELECT ... FOR UPDATE` row lock on the `Shift` row before counting active
  assignments inside the assign transaction.
- **`isPremium` was a client-trusted stored flag, not a computed rule (Phase 6).** Originally
  a plain boolean a manager could set when creating a shift (though the frontend UI never
  actually exposed a control for it — it was always `false` unless a test script set it
  directly). BACKEND_PROMPT calls for Fri/Sat-≥5pm-local shifts to be tagged premium "at the
  query level." Fixed by deriving it fresh at read time from the shift's actual start time and
  location timezone, ignoring the stored column for every response. Checked against all 202
  shifts in the database at the time: **20 were previously mistagged premium** (Fri/Sat, but
  only 3pm — before the 5pm cutoff) and are now correctly shown as not premium; 6 genuinely-
  qualifying evening shifts that had never been tagged are now correctly shown as premium.
- **The Fairness KPI-strip formula mismatch, caught by a direct, skeptical challenge — not
  self-discovered.** The first Fairness-screen backend pass ported the per-staff table
  column's formula (`computeFairnessRows`) and reported it as "matching the frontend exactly."
  It was accurate for that one column, but the screen's KPI strip (Lowest/Highest/Company
  average) is driven by a *different*, structurally distinct function
  (`computeLocationFairness`) that was never touched or ported. When the numbers were
  challenged against the KPI strip's historically-observed range, the actual literal source
  for the KPI strip was pulled and diffed line-by-line, the discrepancy was traced to real,
  distinct formulas (not a bug in either one), and the location-level endpoint was then built,
  ported the same rigorous way, and hand-verified against live data (documented above). The
  lesson: "matches the frontend" needs to specify *which* frontend computation, verified by
  reading the literal current source — not asserted from memory of what a screen "generally"
  does.
- **Race-test script rot, not a regression.** `scripts/race-test.ts` (Phase 3) picked a fully
  random day-of-week and time for its two test shifts, without checking whether the target
  staff member (hardcoded to a specific seeded person) was actually available then. That
  person's real seed availability was Mon/Tue 9–5 only — a uniformly random day/time had
  roughly a 1-in-10 chance of landing inside it. Re-run cold at the start of Phase 7: 3 out of
  3 runs failed, all for the same reason (both requests rejected by the app-level availability
  check before either ever reached the database, proving nothing about the actual race this
  script exists to demonstrate). It's very likely this script only ever passed by chance
  during Phase 3's original verification and had been silently unreliable ever since. Replaced
  with `scripts/race-test-simultaneous-assignment.ts`, which fetches the target's *real*
  availability from the API first and only ever builds a candidate shift inside a real
  window — confirmed across 7 fresh runs during Phase 7, all passing for the right reason.
- **Uncommitted work and git identity, a process incident worth stating plainly.** All of
  Phases 2 through 5's work sat entirely uncommitted in the working tree for an extended
  stretch of this build — nothing was lost, but it was a real, unflagged risk the whole time
  (a `git clean`, `git reset --hard`, or lost working directory would have destroyed four
  phases of work with no recovery path), and it wasn't surfaced until directly questioned.
  Separately, the one commit that *did* exist carried a real personal name and email pulled
  from global git config, with no repo-local override set. Both were fixed once raised: the
  uncommitted work was split into one commit per phase (assigning multi-phase files to
  whichever phase's work in them was most substantial, called out explicitly in each commit
  message rather than picked silently); the identity was corrected repo-locally and then, once
  discovered that the initial fix only touched the most recent commit, the *entire* history was
  rewritten with `git filter-repo` (installed for the purpose) after a full filesystem and
  git-object backup, verified commit-by-commit afterward with zero remaining instances of the
  personal identity, and confirmed the rewrite touched only commit metadata (identical tree
  hash before and after). No remote was ever configured, so this stayed entirely local. Told
  here as-is because it's a real part of how this build actually went, not just the parts that
  went smoothly.

## Concurrency evidence

```bash
cd backend
npx tsx scripts/race-test-simultaneous-assignment.ts   # Simultaneous Assignment (staff double-booking)
npx tsx scripts/race-test-headcount.ts                  # last-seat capacity race (different bug, different fix)
```

Both scripts create fresh test data on every run (wide random time windows, real-eligibility
checks via the actual API — never hardcoded fixtures) so they're safe to run repeatedly
without manual cleanup, and safe to run against the same database the demo guide above uses.

## Deployment

Not yet deployed — see the next message for hosting options and tradeoffs. Nothing gets
deployed anywhere without an explicit go-ahead first.
