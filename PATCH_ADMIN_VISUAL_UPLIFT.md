Patch: elevate the visual design of the Admin screens (Overview, Fairness, Audit Log). Sidebar and Manager/Staff shells are working — leave those alone. This pass is scoped to Admin only, and to visual design, not new functionality.

Context: these screens are functionally complete but visually flat — plain striped tables, no data visualization, no visual encoding, bare filter rows. The goal is "eye-catching and considered," not "generic SaaS dashboard kit." Do not default to: identical rounded cards with the same soft grey shadow on everything, gradient washes as decoration, or a wall of pastel stat tiles. Stay inside the existing token system (ink/paper/amber/brick/moss/flag + slate scale, Archivo Narrow + Inter) — the fix is composition and hierarchy, not new colors.

Apply these changes:

1. **KPI summary strip, top of each Admin screen** (Overview, Fairness, Audit Log). 3-4 numbers max per screen, real and computed from the mock data, not decorative placeholders:
   - Overview: total open/unfilled shifts across locations, this week's overtime cost projection, count of active violations needing attention.
   - Fairness: lowest fairness-score location, highest, company average.
   - Audit Log: total actions this week, most active location, most common action type.
   Each stat: a large Archivo Narrow number, a plain-language label below it, and where meaningful a small inline delta vs. last week (e.g. "+3 vs last week") — no fabricated sparkline unless you have real day-by-day mock data to back it, don't add a chart just to fill space.

2. **Real chart on the Audit Log and Fairness screens** using recharts (already an approved library) — install if not present:
   - Audit Log: a small horizontal bar or dot-density strip showing actions per day for the visible date range, sitting between the KPI strip and the table, not competing with it for attention.
   - Fairness: replace or supplement the raw numbers with an actual bar chart of premium-shift-share vs. total-hours-share per staff member — this is the chart that answers "is this actually fair" at a glance, which is the whole point of the screen.
   Keep charts restrained: no 3D, no heavy gridlines, use the existing token colors (moss for good/balanced, flag for borderline, brick for genuinely inequitable), and label axes plainly.

3. **Visual encoding in the Audit Log table**:
   - Actor column: small colored initial-avatar chip (deterministic color per person from a fixed palette derived from the token set, not random) next to the name.
   - Action column: a colored badge/pill per action type (approved swap, edited shift, published schedule, assigned shift, added staff), not plain text — use the semantic tokens (moss for approvals/publishes, slate for edits, amber for assignments) consistently, and reuse this badge component anywhere action types appear elsewhere in the app.
   - Row hover state that lifts the row subtly (background shift, not a shadow trick) to make the table feel responsive.

4. **Toolbar redesign**: group the search + filters into a single visually cohesive bar (shared background/border container) rather than four independent boxes floating in a row. Convert "All entities" / "All locations" into pill-style segmented filters if the option count is small enough to fit (a handful of entity types, 4 locations) rather than dropdowns — this reads as more considered and is faster to scan/use than a generic `<select>`.

5. **Overview screen**: below the new KPI strip, replace any plain list of locations with a compact card-per-location row that includes the location name, a small coverage indicator (e.g. filled vs unfilled shift count as a simple ratio bar, not a gauge chart), and current local time for that location — this ties back to the multi-timezone requirement and gives admins the one piece of context they need before drilling into a location.

Don't touch: Manager shell, Staff shell, the violation/explanation panel, the schedule board, routing, or the mock service layer's data shapes (you can compute derived stats client-side from existing mock data — don't invent new backend-shaped fields).

When done, tell me which files changed, confirm the build is clean, and flag anywhere you deviated from this because the existing component structure made a different approach cleaner.
