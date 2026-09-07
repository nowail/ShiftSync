# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

## Design Decisions

**Hard violations and overrides.** Most hard (`brick`-tier) violations in the assign flow are unoverridable by design — double-booking, a skill/location certification mismatch, and the 12-hour daily cap all block the assignment outright, with no path through the violation panel except picking a different staff member. The one documented exception is the **7th consecutive day worked in a week**: it's still a hard stop by default (same `brick` treatment, still blocks a plain assignment), but the assessment brief requires a manager override path for it specifically. Overriding requires a non-empty, written reason; the resulting assignment is flagged on the schedule board (a small shield icon on that shift cell) and recorded in the audit trail (actor, timestamp, the shift, and the reason). The goal is to make the underlying risk visible on an ongoing basis, not to clear it from view once accepted — see the seeded Riverside Portland Saturday grill shift for a live example.

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
