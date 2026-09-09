Patch: overridable hard violation for the 7th-consecutive-day rule.

Context: the violation/explanation panel currently treats all `brick`-tier (hard-blocked) violations as unoverridable — correct for double-booking, skill mismatch, location cert mismatch, the 12-hour daily cap, and the 10-hour rest rule. But the assessment brief explicitly requires one hard violation to be overridable: the 7th consecutive day worked in a week requires manager override with a documented reason. Right now that case has no path forward in the UI.

Do this:

1. In the mock constraint-check logic (wherever violations are currently classified/returned in the mock layer), add a distinction between two violation subtypes within the hard-block tier:
   - `blocking` — no override possible (double-booking, skill mismatch, location cert, 12hr cap, 10hr rest gap). Behavior unchanged.
   - `overridable` — currently only the 7th-consecutive-day case. Same `brick` visual treatment (it's still a hard stop by default), but the panel offers a way through.

2. In the violation/explanation panel component, when a violation is `overridable`:
   - Keep the existing rule explanation and `brick` styling as-is.
   - Add an "Override and assign anyway" action, visually secondary to the primary "choose an alternative" path — this should never look like the default or easy option.
   - Selecting it reveals a required, non-empty reason field (textarea, placeholder like "Why is this override necessary?"). The assign action stays disabled until a reason is entered.
   - On confirm, the assignment goes through and a record is written via the existing audit mock service: actor, timestamp, entity (the shift/assignment), and the override reason as part of the before/after payload — same audit pattern already used elsewhere, don't invent a new one.

3. Add a small visual marker on the schedule board for any assignment that was made via override (e.g. a subtle icon/badge on that shift cell) so a manager scanning the board can immediately spot overridden assignments without opening each one — this matters for the Overtime Trap scenario, where the point is surfacing hidden risk, not hiding it once accepted.

4. Update the seed mock data with one example: a staff member on their 7th consecutive day, already assigned via override, with a documented reason — so this state is visible on first load, not just reachable by clicking through the flow.

5. Update the README's Design Decisions section: replace the current "hard violations have no override button" note with the corrected rule — non-overridable violations stay hard-blocked; the 7th-consecutive-day case is the one documented exception, per the brief's explicit requirement, with a mandatory reason captured to the audit trail.

Don't touch /backend. Keep this scoped to the violation panel, the mock constraint logic, the schedule board badge, seed data, and the README — no unrelated refactors.

When done, tell me which files changed and confirm the build is still clean.
