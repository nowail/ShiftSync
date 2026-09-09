-- Simultaneous Assignment eval scenario: the last line of defense against one staff
-- member ending up double-booked, enforced by Postgres itself so it holds even under a
-- real concurrent race (two managers assigning the same person to overlapping shifts at
-- nearly the same instant) — the app-level engine check in Phase 3 can't fully close that
-- race on its own since two requests can both pass the pre-check before either commits.
--
-- Why this lives on Assignment.rangeStart/rangeEnd instead of joining to Shift:
-- Postgres EXCLUDE constraints are declared on a single table and can only reference that
-- table's own columns (or expressions over them) — they cannot span a join to Shift's
-- startsAt/endsAt. So Assignment carries its own denormalized copy of the shift's time
-- range (rangeStart/rangeEnd), written once when the assignment is created and never
-- expected to change afterward (a time change means a new Shift, not a mutated one, per
-- how the frontend already models edits). The application layer (Phase 3) is responsible
-- for keeping these in sync with the parent Shift at write time; this migration only
-- adds the DB-level guarantee once that data exists.
--
-- The exclusion only applies to `active` assignments — a `cancelled` assignment (e.g. the
-- staff member who lost a swap, or was unassigned) must not keep blocking new bookings for
-- that same time range.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Assignment"
  ADD CONSTRAINT "assignment_no_double_booking"
  EXCLUDE USING gist (
    "staffId" WITH =,
    tstzrange("rangeStart", "rangeEnd", '[)') WITH &&
  )
  WHERE ("status" = 'active');
