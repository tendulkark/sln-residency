# SLN Residency — Hotel Staff Console

Multi-tenant hotel room-booking system for hotel **staff only** (Admin and
Employee accounts). There is no guest-facing booking, no guest login, and no
payment gateway — staff record payments manually (cash/UPI/card/etc.) after
collecting them at the desk, purely for reporting.

Nothing that can change per-hotel (statuses, roles/permissions, GST rates,
payment methods) is hardcoded — it's all editable data. See
[AI_RULES.md](AI_RULES.md) for the rules this codebase is built to.

## Stack

- **Frontend**: React 19 + Vite, Tailwind CSS v4, React Router v7, TanStack
  Query, Zustand — plain JavaScript (JSX), no TypeScript.
- **Backend**: Node.js + Fastify 5 + Prisma + PostgreSQL, JWT auth (access
  token in memory, refresh token as an httpOnly cookie, rotated on use).
- **Monorepo**: npm workspaces — `apps/web`, `apps/api`,
  `packages/shared-schemas` (Zod schemas + the permission catalog, shared by
  both apps).

## Phase 1 (this scaffold)

- Prisma schema for the full dynamic model: tenants, users, roles,
  permissions, statuses (per domain), room types, rooms, guests, bookings,
  payment methods, payments, tax rules, invoices, audit log.
- JWT auth with refresh rotation + a `requirePermission(code)` gate on every
  protected route.
- A seed script that creates one tenant ("SLN Residency"), the Admin/
  Employee roles, an admin login, default statuses, default payment
  methods, and a handful of sample rooms.
- A minimal staff console: login → sidebar shell → Rooms page showing each
  room's live status.

## Local setup

1. **Start Postgres** (or point `DATABASE_URL` at any Postgres instance you
   already have, e.g. a Neon/Supabase free-tier database):

   ```bash
   docker compose -f infra/docker-compose.yml up -d
   ```

2. **Install dependencies** (from the repo root — npm workspaces installs
   everything for both apps in one go):

   ```bash
   npm install
   ```

3. **Configure environment variables**:

   ```bash
   cp apps/api/.env.example apps/api/.env
   cp apps/web/.env.example apps/web/.env
   ```

   Edit `apps/api/.env` if your Postgres isn't the local Docker default.

4. **Run the database migration and seed**:

   ```bash
   npm run db:migrate
   npm run db:seed
   ```

   This prints the seeded admin login (default:
   `admin@sln-residency.test` / `ChangeMe123!` unless overridden in `.env`).

5. **Run both apps** (in two terminals):

   ```bash
   npm run dev:api   # http://localhost:4000
   npm run dev:web   # http://localhost:5173
   ```

6. Open `http://localhost:5173`, sign in with the seeded admin login, and
   you should land on the Rooms page showing the seeded sample rooms.

## What's next

See the build order in [AI_RULES.md](AI_RULES.md) — Phase 2 is the core
booking flow (create/edit/cancel a booking against a room + guest, with
dynamic booking statuses).
