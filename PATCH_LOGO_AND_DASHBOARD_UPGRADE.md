Patch: (1) integrate the finished logo assets, (2) increase data-visualization density on the Admin/Manager dashboards, inspired by a reference dashboard's *structure* — NOT its visual style. Read all of this before starting; part 2 has an explicit style boundary that matters.

---

## Part 1 — Logo integration

Two logo files, `shiftsync-logo.png` and `shiftsync-logo.svg`, are saved in the project root (next to FRONTEND_PROMPT.md, not inside /frontend).

1. Move `shiftsync-logo.svg` into `/frontend/public/` and also into `/frontend/src/assets/` (public copy for favicon generation, src copy for importing into components).
2. Replace the current text-only "ShiftSync" wordmark in the sidebar header with the icon (from `src/assets`) placed to the left of the existing "ShiftSync" text, sized to sit comfortably next to the current type — icon roughly the same height as the wordmark's cap-height, not larger. Do this in both the Manager/Admin sidebar and the Staff mobile shell's header.
3. Add the icon to the Login screen near the "ShiftSync" heading, same relative sizing logic.
4. Generate a favicon set (16x16, 32x32, apple-touch-icon) from `shiftsync-logo.png`, place in `/frontend/public/`, and wire up the `<link>` tags in `index.html`.
5. Confirm at actual rendered size (sidebar ~24-28px) the icon is still legible — if the gap between the three bars disappears or it looks like a smudge at that size, flag this back to me rather than shipping something illegible.

---

## Part 2 — Data-visualization density (style-bounded)

Context: I reviewed a reference dashboard (a generic e-commerce admin template) for structural inspiration — KPI tiles with icon chips and deltas, a multi-line trend chart, a gradient area chart, grouped bar comparisons, a geographic map, and a ranked progress-bar list. The goal is to bring that *density and variety of real visualization* into ShiftSync's Admin/Manager screens.

**Explicit style boundary — do not deviate from this:** stay entirely within the existing token system (ink #1C2333, paper #F6F4EE, amber #E8A33D, brick #C1473F, moss #3E7C6B, flag #B8842E, the slate scale) and the existing Archivo Narrow + Inter type pair. Do NOT introduce: purple/indigo as a UI color, pastel rainbow icon chips, heavy rounded-corner-on-everything with identical soft grey drop shadows, or decorative gradient washes on cards. Icon chips should be colored from the semantic token set only (e.g. moss for positive/healthy, amber for attention/premium, brick for risk) — never an arbitrary rainbow per card. This is a hard constraint, not a preference: the whole point of this brand system is to avoid reading as a generic dashboard template, and copying that surface style would undo that.

Apply these additions:

1. **Admin Overview — location coverage map.** Add a simple US map (a lightweight SVG US states map component, or a library like `react-simple-maps` if adding a dependency is easier than hand-rolling one) highlighting the states/regions containing Coastal Eats' 4 locations. Color each location marker/state by its current coverage status using the semantic tokens: moss (fully staffed), flag (soft warning — approaching overtime or minor gaps), brick (unfilled shifts / hard risk). Clicking a location jumps to that location's schedule board (if routing supports a location-scoped view) or at minimum shows a small tooltip/popover with its stat summary. This is a stronger, more relevant use of the "map" pattern than the reference had, since multi-location/multi-timezone is core to this product's actual requirements — lean into that.

2. **Manager Overtime dashboard — hours trend chart.** Add a multi-line chart (recharts) showing weekly hours-so-far for the 3-4 staff members closest to or over the 35/40-hour thresholds, one line per person, with reference lines at 35h and 40h. Use slate/ink shades for the lines themselves (not a rainbow) and reserve amber/brick only for the threshold reference lines and any point where a line crosses them.

3. **Admin Fairness — ranked list.** Add a ranked horizontal-bar list (top of the Fairness screen, above or beside the existing bar chart from the previous patch) showing staff sorted by premium-shift share, e.g. "1. [Name] — 45% premium shifts" with a proportional bar, similar in structure to a "top products" ranked list — but styled with your existing badge/pill component, moss-to-brick color scale based on how far each person's ratio sits from equitable (near 1.0 = moss, far below = brick), not a decorative gradient bar.

4. **KPI tiles, revisited.** Wherever KPI tiles already exist (Overview, Fairness, Audit Log from the prior patch), make sure each has: a small icon in a solid-color chip (semantic token, not pastel), the big Archivo Narrow number, the label, and a delta if meaningful — matching the reference's *information density per tile*, not its color treatment.

Don't touch: Staff shell, the violation/explanation panel, the schedule board, routing structure beyond what's needed for the map's location-click behavior, or mock data shapes (derive everything client-side from existing mock data — if a new stat genuinely requires new seed fields, add them to the mock seed data only, not to any assumed backend contract).

When done: tell me which files changed and any new dependencies added, confirm the build is clean, and take screenshots of the Overview map, the Overtime trend chart, and the Fairness ranked list.
