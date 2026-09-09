# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

## Design Decisions

**Hard violations and overrides.** Most hard (`brick`-tier) violations in the assign flow are unoverridable by design — double-booking, a skill/location certification mismatch, and the 12-hour daily cap all block the assignment outright, with no path through the violation panel except picking a different staff member. The one documented exception is the **7th consecutive day worked in a week**: it's still a hard stop by default (same `brick` treatment, still blocks a plain assignment), but the assessment brief requires a manager override path for it specifically. Overriding requires a non-empty, written reason; the resulting assignment is flagged on the schedule board (a small shield icon on that shift cell) and recorded in the audit trail (actor, timestamp, the shift, and the reason). The goal is to make the underlying risk visible on an ongoing basis, not to clear it from view once accepted — see the seeded Riverside Portland Saturday grill shift for a live example.

## Intentional Ambiguities

> **These five entries were written during backend Phase 1** (`/backend`), not during the original frontend build — the backend plan (`BACKEND_PROMPT.md`) refers to this section as already existing and settled, but it wasn't; this is that gap being filled in now. Each answer below is either (a) a direct restatement of behavior the frontend code already has, confirmed by re-reading the actual implementation rather than assumed, or (b) a new call made because the backend schema needed one to proceed and none existed yet. The new ones are marked **[new]** and should be treated as proposed until confirmed — flag here if any should go the other way; nothing downstream past Phase 1's schema depends on them yet.

- **De-certification keeps historical data.** Revoking a `StaffCertification` sets a `revokedAt` timestamp; the row is never deleted, and no past `Assignment` made while the certification was active is retroactively touched. This is a direct schema decision restated from `BACKEND_PROMPT.md`'s own Phase 1 model list ("`revokedAt` nullable field — never delete"), not a new call.
- **Desired weekly hours is a soft signal only.** Confirmed by re-reading `lib/rules.ts`: `desiredWeeklyHours` is never referenced anywhere in `evaluateAssignment` or any violation check — it's profile/preference data a manager can see (Profile screen), not a constraint the engine enforces. The backend engine (Phase 3) should match this: no rule keyed on it.
- **Consecutive-day counting is per-calendar-day, regardless of shift length.** Confirmed by re-reading `consecutiveDaysIncluding` in `lib/rules.ts`: it builds a set of distinct local-calendar-date keys a staff member has *any* shift on and walks backward from there — a 2-hour shift and a 12-hour shift both count as exactly one day worked. The backend engine (Phase 3) should implement the 6th/7th-day rules the same way.
- **[new] Editing a shift after its swap has been approved re-runs the constraint engine against the new assignee.** The frontend never modeled this case (its `approveSwap` just mutates `assignedStaffId` directly, and there's no "edit a shift's time after an approved swap" flow in the mock UI to have decided this either way). Proposed backend behavior for Phase 3: if a `Shift` with an `approved` `SwapRequest` against it is edited (time, skill, or location), re-run the engine for the current assignee against the new shift; if it now fails, surface it as a conflict rather than silently applying the edit or silently reverting the swap.
- **Timezone-spanning locations are out of scope.** Confirmed directly from the schema: `Location.timezone` is a single IANA string, no multi-timezone-per-location concept exists anywhere in the frontend's types or seed data.
- **Availability windows are interpreted in the *shift's own* location-local time, not a staff member's home-location time.** `AvailabilityRule` has no location field at all in the frontend's shape (`{dayOfWeek, startTime, endTime}`, staff-scoped only) — so for a staff member certified at more than one location in different timezones (e.g. Alex Chen: Downtown SF + Midtown NYC), there was no existing answer for which clock a naive `'09:00'` refers to. This is now the confirmed, settled reading, taken from `BACKEND_PROMPT.md`'s own phrasing for the `AvailabilityRule` schema ("stored in location-local time semantics"): the naive time is compared directly against whichever location's local time the shift being checked is in — not converted from a fixed home-location anchor. In practice this means "available Mon 9–5" is treated as "available 9–5 local, at whichever site the shift is at," which is simpler to implement (no cross-timezone conversion at all) and requires no extra schema field to hold a second anchor location.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
