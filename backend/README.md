# ShiftSync backend

Node.js + TypeScript + Express + Prisma (Postgres). Built phase-by-phase per `BACKEND_PROMPT.md`
in the project root — this README covers what exists so far (**Phase 1: foundations**).

## Stack notes

- **Prisma is pinned to 6.19.3**, not the current `latest` (7.x). Prisma 7 removed
  `datasource.url` from `schema.prisma` in favor of a `prisma.config.ts` + driver-adapter
  pattern, which breaks the classic "`DATABASE_URL` from `.env`" setup this project (and
  `BACKEND_PROMPT.md`) assumes. 6.19.3 is the last stable line with the classic pattern.
- **The database is Neon** (`DATABASE_URL` in `.env`, `sslmode=require`) — both migrations,
  the seed script, and the exclusion constraint have been verified directly against Neon
  (not just local Postgres). A local Postgres 16 container is also supported for anyone
  without Neon access: it's plain vanilla Postgres, so nothing else about the setup changes,
  including the exclusion-constraint migration — just point `DATABASE_URL` at it instead.
- Two **known, low-risk `npm audit` findings**, both transitive dependencies of the `prisma`
  CLI package itself (not `@prisma/client`, not anything this app's runtime code touches):
  `mysql2` (via Prisma's bundled MySQL driver support, which we never invoke — this project
  only uses `provider = "postgresql"`) and `deepmerge-ts` (via `@prisma/config`'s dev-time
  config merging). The suggested `npm audit fix --force` downgrades `prisma` to a version
  that reintroduces the 6/7 mismatch above, so left as-is rather than force-fixed.

## Setup

```bash
cd backend
npm install
cp .env.example .env   # then point DATABASE_URL at your own Postgres if not using the below

# Local Postgres via Docker (matches the .env.example default):
docker run -d --name shiftsync-postgres \
  -e POSTGRES_USER=shiftsync -e POSTGRES_PASSWORD=shiftsync_dev_pw -e POSTGRES_DB=shiftsync \
  -p 5433:5432 postgres:16-alpine

npm run prisma:migrate   # applies both migrations, including the exclusion constraint
npm run db:seed          # mirrors the frontend mock seed 1:1
npm run dev               # http://localhost:4000
```

Frontend side: copy `frontend/.env.example` to `frontend/.env` (already defaults to
`VITE_API_URL=http://localhost:4000`) and run the frontend as usual.

## Demo logins

Every seeded account shares one password: **`password123`**

| Role | Email | Name |
|---|---|---|
| Admin | `admin@coastaleats.com` | Jordan Rivera |
| Manager (SF + Portland) | `casey.manager@coastaleats.com` | Casey Nolan |
| Manager (NYC + Boston) | `devon.manager@coastaleats.com` | Devon Marsh |
| Staff | `kayla.lee@coastaleats.com` | Kayla Lee |

(11 more staff accounts exist too — see `prisma/seed.ts` `STAFF` array for the full
list/emails; all use the same password.)

The Login screen's role selector prefills one of the first/last of these per role; typing
a different seeded email still works.

## What's real vs. mock right now (Phase 1 scope)

Only `POST /auth/login` and `GET /auth/me` are wired to the real backend
(`frontend/src/services/auth.ts` + `frontend/src/lib/apiClient.ts`). Every other screen —
schedule board, overtime, fairness, swaps, notifications, audit log — is still rendering
`frontend/src/lib/seed.ts`'s in-memory mock data, unchanged. This is intentional per the
phased plan: Phase 2 wires the read paths, Phase 3 wires the manager mutation flows, etc.

The backend's seeded `User` ids are deliberately identical to the frontend mock's staff ids
(`usr-admin`, `usr-mgr-sf`, `usr-4`, ...) — so a real login's `staffId` slots directly into
the still-mock-driven rest of the app with no translation layer, and nothing else needed to
change for Phase 1.

## Manual verification

```bash
# Health check (also confirms DB connectivity)
curl http://localhost:4000/health

# Real login
curl -s -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"casey.manager@coastaleats.com","password":"password123"}' | python3 -m json.tool

# Wrong password -> 401 with a structured error body
curl -s -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"casey.manager@coastaleats.com","password":"wrong"}' | python3 -m json.tool
```

**Exclusion constraint** — confirm it exists:

```bash
docker exec shiftsync-postgres psql -U shiftsync -d shiftsync -c '\d "Assignment"'
# look for:
#   "assignment_no_double_booking" EXCLUDE USING gist ("staffId" WITH =, tstzrange(...) WITH &&) WHERE (status = 'active')
```

Prove it actually rejects a double-booking (see `prisma/migrations/20260908144500_assignment_exclusion_constraint/migration.sql`
for the full reasoning comment): insert two `active` Assignment rows for the same
`staffId` with overlapping `rangeStart`/`rangeEnd` and confirm Postgres raises
`conflicting key value violates exclusion constraint "assignment_no_double_booking"`. This
was tested by hand during Phase 1 (overlapping active/active rejected; a `cancelled` row
overlapping is allowed; back-to-back non-overlapping rows are allowed; two *different*
staff overlapping on the same shift — the headcount > 1 case — is allowed) and cleaned up
afterward; the seed script's own successful run is a second, standing proof it doesn't
fire on legitimate data.

## Migrations

Two migrations, in order:

1. `20260908144335_init` — full schema from `prisma/schema.prisma`.
2. `20260908144500_assignment_exclusion_constraint` — raw SQL (not Prisma-expressible):
   `CREATE EXTENSION btree_gist` + the `EXCLUDE USING gist` constraint on `Assignment`.
   Written by hand as a `--create-only` migration; see the comment at the top of that
   file for why it lives on `Assignment.rangeStart/rangeEnd` (denormalized from `Shift`)
   instead of joining to `Shift` directly — Postgres exclusion constraints can't span a
   join, only reference the declaring table's own columns.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Start the API with hot reload (`tsx watch`) |
| `npm run build` / `npm start` | Compile to `dist/` and run it |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run prisma:migrate` | Apply pending migrations (dev) |
| `npm run prisma:studio` | Prisma's local DB browser |
| `npm run db:seed` | Re-run the seed script (wipes and rebuilds all seeded data) |
| `npm test` | Vitest (no tests yet — arrives with Phase 3's constraint engine) |
