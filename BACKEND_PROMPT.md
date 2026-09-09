# ShiftSync — Backend Build Plan (Phased, Stop-and-Verify)

You are building `/backend` for ShiftSync against the requirements in the original assessment document (Priority Soft — Full-Stack Developer Assessment) and staying consistent with every design decision already made and documented in the frontend README's "Design Decisions" section. Where this plan references "§N," that's the assessment doc's numbered section (§1 User Management, §2 Shift Scheduling, §3 Swapping, §4 Overtime/Compliance, §5 Fairness, §6 Real-Time, §7 Notifications, §8 Calendar/Time, §9 Audit Trail) and "Eval scenario" refers to the six named scenarios in that doc (Sunday Night Chaos, Overtime Trap, Timezone Tangle, Simultaneous Assignment, Fairness Complaint, Regret Swap).

## Non-negotiable ground rules for every phase

1. **Stop at the end of every phase.** Do not begin the next phase under any circumstances, even if the work seems small or you're confident. End each phase by: summarizing what you built, listing exact manual verification steps (URLs, demo logins, example requests/responses) a human can run right now, and explicitly asking for approval to continue. Wait.
2. **Consistency with already-documented frontend decisions is mandatory, not optional.** The frontend README already commits to specific answers on the "Intentional Ambiguities" (de-certification keeps historical data, desired hours is a soft signal only, consecutive-day counting is per-calendar-day regardless of shift length, editing after swap approval re-runs the constraint engine against the new assignee, timezone-spanning locations are out of scope). Implement the backend to match these exactly — don't silently re-decide any of them. If you hit a genuinely new ambiguity not already covered, stop and ask rather than inventing a answer.
3. **Wire the frontend incrementally, phase by phase — never all at once at the end.** The frontend's `/frontend/src/services/*.ts` files already expose function signatures matching what a real API needs (e.g. `getShiftsForWeek(locationId, weekStart): Promise<Shift[]>`). Each phase below names exactly which service files to swap from mock to real. Build one small shared `apiClient` (base URL from an env var, attaches the auth token) in Phase 1 and route every subsequent swap through it. Resources not yet migrated in a given phase stay on mock data — don't break anything that isn't in scope yet. Components/hooks should never need to change; only the service file's internals do.
4. **No detail from the assessment doc gets dropped.** Each phase below explicitly cross-references the doc sections and eval scenarios it covers so nothing quietly falls through the cracks. If you notice something in the original doc that isn't covered by any phase, stop and flag it before proceeding rather than assuming it's out of scope.

## Stack

Node.js + TypeScript, Express, Prisma (Postgres/Neon) for the schema and standard queries, with hand-written raw SQL migrations for anything Prisma can't express (the assignment exclusion constraint, specifically — Prisma's schema language doesn't support `EXCLUDE` constraints, so that one migration is raw SQL run alongside the Prisma-managed ones). Zod for request validation. `jsonwebtoken` + `bcrypt` for auth. Socket.IO for real-time (Phase 5). Vitest for unit tests, especially the constraint engine — this is the highest-value code to test given the grading weight on constraint correctness.

---

## Phase 1 — Foundations: schema, seed, auth

**Covers:** §1 (roles/certifications schema), §8 (storage model for time/timezone), §9 (audit log schema), groundwork for everything else.

1. Scaffold `/backend`: Express + TypeScript, Prisma connected to Neon (`DATABASE_URL` from `.env`, `.env.example` committed instead), health check route, centralized error-handling middleware, structured request logging.
2. Full schema via Prisma: `User` (role enum: admin/manager/staff), `Location` (name, IANA timezone string), `Skill`, `StaffSkill`, `StaffCertification` (staff↔location, with a `revokedAt` nullable field — never delete, per the de-certification decision), `AvailabilityRule` (recurring: day-of-week + start/end stored in **location-local time semantics per the Timezone Tangle decision** — resolve this exactly as the frontend README documents it), `AvailabilityException` (one-off overrides), `Shift` (`startsAt`/`endsAt` as `timestamptz`, locationId, skillRequired, headcount, status draft/published), `Assignment` (shiftId, staffId, status, assignedBy, assignedAt, plus fields for the override case: `isOverride` boolean, `overrideReason` nullable), `SwapRequest` (type swap/drop, fromStaffId, toStaffId nullable, shiftId, status, expiresAt), `Notification` (userId, type, payload, readAt nullable), `NotificationPreference` (userId, inAppOnly vs inAppPlusEmail), `AuditLog` (actorId, entityType, entityId, beforeJson, afterJson, action, at).
3. **Raw SQL migration**: add a Postgres exclusion constraint on `Assignment` over `(staff_id, tstzrange(shift.starts_at, shift.ends_at))` using the `&&` overlap operator (this needs a join or a denormalized range column kept in sync — pick whichever is cleaner given Prisma's migration model, and explain your choice). This is the DB-level defense for the Simultaneous Assignment eval scenario; document in code comments exactly what it prevents.
4. Seed script that **mirrors the frontend's mock seed data 1:1** — same location names/timezones, same staff names/skills/certifications, same specific scenario setups already baked into the frontend (Riley Wu's cross-timezone certification, the staff member near the weekly threshold, the pending unresolved swap, Portland's unfilled seats, the 7th-consecutive-day override example with its documented reason). This matters: the grader's experience should not change when the app switches from mock to real data.
5. Auth: JWT-based login (`POST /auth/login`), bcrypt-hashed passwords, role-based middleware (`requireRole('admin' | 'manager' | 'staff')`), and location-scoping middleware for managers (§1: "managers can only see/manage locations they're assigned to"). Seed one demo login per role for the login screen's role-selector to keep using.
6. CORS configured for the frontend's dev and deployed origins.

**Wire to frontend:** build the shared `apiClient`. Swap only the auth/login path from mock to real — the Login screen now hits real `/auth/login` and gets a real JWT. Everything else stays on mock data for now.

**STOP.** Report exact login credentials per role, confirm migrations ran clean against Neon, confirm the exclusion constraint exists (show the `\d` output or equivalent), and wait for manual verification before Phase 2.

---

## Phase 2 — Read layer: make the whole app show real data

**Covers:** §1 (staff/skills/certifications/availability reads), §2 (published schedule reads), §3 (swap status reads), §7 (notification reads), §9 (audit reads) — every screen becomes read-real, nothing is mutable yet.

1. Build every GET endpoint needed to render every existing screen with real data: locations, staff (with skills/certifications/availability), shifts for a given location+week, assignments for a shift, swap requests (with current state), notifications (with read/unread), audit log (filterable by actor/entity/location/date range).
2. Match response shapes exactly to what the frontend's TanStack Query hooks already expect from the mock layer — check each mock service file's return type before writing the corresponding endpoint.

**Wire to frontend:** swap `locations.ts`, `staff.ts` (read paths), `shifts.ts` (read paths), `swaps.ts` (read paths), `notifications.ts` (read paths), `audit.ts` to real API calls. Every screen in the app should now be rendering live Neon data — Admin, Manager, Staff — but no button that mutates anything should work yet (those still hit mock or no-ops).

**STOP.** Report which endpoints exist, confirm every screen renders live data with no console errors, deliberately test the loading/error states (stop the backend momentarily, confirm the frontend's existing error states — not a blank screen — still trigger correctly). Wait for manual verification before Phase 3.

---

## Phase 3 — Manager core: the constraint engine, shift/assignment mutations, publish workflow

**Covers:** §2 in full, §4's hard-block rules and the 7th-day override, §8's overnight-shift and DST handling, Eval scenarios: Overtime Trap, Simultaneous Assignment, Timezone Tangle.

This is the highest-weighted part of the entire assessment (constraint correctness 25% + edge cases 20%). Build it as a pure, isolated, unit-tested module (`/backend/src/engine`), independent of Express, taking `(staff, shift, existingAssignments, availability)` and returning `{ ok: true }` or `{ ok: false, violations: [{ rule, message, severity: 'block' | 'overridable' | 'warning' }], suggestions: StaffSuggestion[] }`.

1. Implement every rule from §2 and §4: no double-booking (range-overlap logic, correctly handling the overnight 11pm–3am case as one shift per §8), 10-hour rest gap, skill match, location certification (respecting `revokedAt` — decertified staff can't get *future* assignments, per the documented decision), availability window match (resolved per the documented Timezone Tangle answer), daily hours warn>8/block>12, weekly hours warn≥35, 6th-consecutive-day warning, 7th-consecutive-day **overridable** block (count consecutive days per-calendar-day in location-local time, regardless of shift length, per the documented decision).
2. Every rejection must return the specific rule broken in plain language plus 2-3 real suggested alternatives (query staff with matching skill + cert + availability, excluding whoever's already assigned).
3. `POST /shifts/:id/assign` — runs the engine; on `block`, returns 422 with the structured violation; on `overridable` (7th day only), accepts an optional `overrideReason` field — if absent, returns the violation as blocked-pending-reason; if present, proceeds and writes `isOverride`/`overrideReason` onto the Assignment plus an audit log entry.
4. Handle the DB exclusion constraint's actual violation at the database level too (not just the app-level pre-check) — catch the Postgres constraint-violation error on write and translate it into the same structured violation shape, so a real concurrent race (two managers, same instant) degrades gracefully instead of a raw 500.
5. Shift CRUD: create/edit/delete, with the 48-hour publish cutoff (configurable, default 48h) — edits inside the cutoff should be flagged, not silently blocked, per the already-documented decision. Publish/unpublish endpoints.
6. Edit-after-swap-approval: if a shift is edited while it has an approved swap, re-run the engine against the new assignee at the new time per the documented decision, and surface a conflict if it now fails.
7. Write every mutation in this phase through a single audit-logging wrapper (actor, before/after JSON, timestamp) — don't scatter manual `AuditLog.create` calls.
8. Unit tests (Vitest) for every rule in the engine, including the overnight-shift edge case and the 7th-day override path, independent of the Express layer.

**Wire to frontend:** swap `shifts.ts` (write paths) and the assign/publish/edit flows on the Manager schedule board to real endpoints. The violation/explanation panel and the override flow (already built in the frontend) should now be driven by real engine responses instead of mocked ones — confirm the response shape matches exactly, adjust the frontend's expected shape only if genuinely necessary and tell me if so.

**STOP.** Report engine test coverage, and give me specific manual test steps to try to trip each rule (which staff/shift combination triggers which violation) so we can verify the real UI shows correct, specific messages — not just that mutations succeed. Also give me a way to manually verify the DB-level race protection (e.g. two near-simultaneous requests via a script or two browser tabs). Wait for approval before Phase 4.

---

## Phase 4 — Staff self-service: availability, swaps/drops, notifications

**Covers:** §1 (availability writes), §3 in full, §7 in full, Eval scenario: Regret Swap, contributes to Sunday Night Chaos (pickup path).

1. Availability CRUD: recurring weekly rules + one-off exceptions, staff-scoped (a staff member can only edit their own).
2. Swap/drop/pickup as an explicit state machine: `pending_peer → pending_manager → approved/rejected/cancelled` for swaps; `open → claimed/expired` for drops. Enforce: max 3 pending requests per staff member: drop requests computed-expired 24h before shift start (compute at read time, per the already-documented decision — no cron dependency); a pending swap auto-cancels (with notification to both parties + audit entry) if the manager edits that shift (ties back to Phase 3 item 6); a requester withdrawing before manager approval simply cancels the request and leaves the original assignment untouched (the Regret Swap answer — implement it exactly this way, it's a named eval scenario).
3. Notification writes on every relevant event from §7's two lists (staff: new shift/shift change/swap update/schedule published; managers: swap/drop approval needed/overtime warning/availability change), plus a `NotificationPreference` endpoint (in-app only vs in-app+email — email is simulated: write to a `MockEmailOutbox` table/log, don't attempt real email sending).
4. Pickup flow: staff can browse and claim open/dropped shifts they're qualified for — runs through the same Phase 3 engine before confirming.
5. Added during Phase 2 (flagged as uncovered by any phase; folded in here): Admin's location/staff CRUD — `createLocation`, `createStaffMember`, `updateStaffMember` — wired to real write endpoints alongside the rest of this phase's write-path work.

**Wire to frontend:** swap `staff.ts` (availability writes), `swaps.ts` (write paths), `notifications.ts` (write/preference paths), and `locations.ts`/`staff.ts` (the Admin CRUD paths from item 5) to real endpoints. Staff mobile screens (My Schedule pickup action, Swaps, Availability, Notifications), the Manager swap-approval queue, and Admin's Locations & Users forms should now be fully live.

**STOP.** Report the state machine's exact transitions, give manual steps to walk through a full swap lifecycle and a full drop-and-pickup lifecycle, and confirm the 3-pending cap and 24h drop expiry are checkable by hand (e.g. how to fast-forward via seed data timestamps). Wait for approval before Phase 5.

---

## Phase 5 — Real-time layer

**Covers:** §6 in full, contributes to Eval scenarios Sunday Night Chaos (speed of coverage-finding) and Simultaneous Assignment (the conflict notification itself).

1. Socket.IO server, room-based: `location:{id}` and `user:{id}`.
2. Emit on: `schedule.published`/`schedule.updated` (room: location) so staff see updates without refreshing; `swap.requested`/`swap.resolved` (targeted to the specific users involved); `assignment.conflict` (targeted to the manager who loses a race from Phase 3's exclusion-constraint catch — fire this the instant that write fails, not on next poll); on-duty clock-in/out events (room: location) for the on-duty-now dashboard.
3. Auth the socket connection with the same JWT from Phase 1.

**Wire to frontend:** replace the frontend's scripted mock `realtime.ts` event emitter with real socket subscriptions in the same places it's currently used (toast layer, on-duty-now dashboard, notification center, schedule board live-update). Remove the timer-based fake events now that real ones exist.

**STOP.** Give manual steps to verify real-time behavior concretely — e.g. two browser windows logged in as different managers, one publishes a schedule and the other's staff view updates without a refresh; two managers attempting to assign the same staff member at nearly the same time to see the conflict notification fire live. Wait for approval before Phase 6.

---

## Phase 6 — Analytics: overtime dashboard, fairness, audit export

**Covers:** §4's dashboard/visualization requirements (reusing Phase 3's hour-calculation primitives, not reimplementing them), §5 in full, §9's export requirement, Eval scenario: Fairness Complaint.

1. Overtime dashboard endpoints: projected weekly cost, per-staff hours-so-far, which assignments are pushing someone into overtime, and a "what-if" preview endpoint (given a prospective staff+shift, return the engine's result *without* committing it) — built on top of Phase 3's engine and hour-calculation logic, not a separate implementation.
2. Fairness: tag Fri/Sat shifts starting ≥5pm as premium at the query level; compute the fairness ratio (premium-hours-share ÷ total-hours-share) per staff, matching exactly how the frontend README already describes and how the existing (currently mock-driven) Fairness screen visualizes it — the real numbers should slot into the same UI without needing shape changes.
3. Audit log filtering (actor/entity/location/date range) and CSV export endpoint.

**Wire to frontend:** swap the Overtime dashboard, Fairness screen, and Audit log's remaining client-side/mock-derived computations to real backend-computed values.

**STOP.** Give manual steps to spot-check a couple of computed numbers by hand against the seed data (e.g. verify one staff member's fairness ratio arithmetic yourself) so we can confirm the math is actually right, not just plausible-looking. Wait for approval before Phase 7.

---

## Phase 7 — Hardening & deployment

**Covers:** the Deliverables section of the assessment doc (working deployed app, public repo, seed data, documentation) and a final pass across all six eval scenarios together.

1. Write and run a concurrency test script that fires two near-simultaneous assignment requests for the same staff member to different shifts and confirms exactly one succeeds and the other returns the structured conflict — this is your evidence for the Simultaneous Assignment scenario, not just a manual click-test.
2. Walk all six eval scenarios end to end against the real backend (Sunday Night Chaos, Overtime Trap, Timezone Tangle, Simultaneous Assignment, Fairness Complaint, Regret Swap) and note the exact click-path for each — this becomes the README's demo guide.
3. Deploy the backend (host TBD — flag options and tradeoffs rather than picking silently) connected to the Neon instance, and the frontend, to public URLs.
4. Final README pass: login instructions per role, known limitations (including the ambiguity decisions, restated plainly), the eval-scenario walkthroughs from step 2, and a short note on what was found/fixed during backend hardening (in the same spirit as the frontend bug reports already documented).
5. Confirm the seed script can reset the demo to a clean, known state on demand — the grader may want to re-run scenarios.

**STOP.** Report deployed URLs, confirm the concurrency test's output, and give me the final walkthrough doc for a joint pass before you'd consider this submitted.
