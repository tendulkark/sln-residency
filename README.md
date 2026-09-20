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

## Phase 1 (foundation)

- Prisma schema for the full dynamic model: tenants, users, roles,
  permissions, statuses (per domain), room types, rooms, room closures,
  guests, bookings, payment methods, payments, tax rules, invoices, audit
  log.
- JWT auth with refresh rotation + a `requirePermission(code)` gate on every
  protected route.
- A seed script that creates one tenant ("SLN Residency"), the Admin/
  Manager/Employee roles, an admin and a manager login, default statuses/payment methods/tax
  rule, three room types, and 22 sample rooms with sample bookings and
  payments.

## Phase 2 (this build)

- **Hotel Dashboard** — live stats (occupancy, tonight's revenue, needs
  attention, today's payments by method) and a room board grouped by floor,
  with Day/Week/Month/Custom date filters, floor/status/search filters,
  "New booking" and "Closed periods".
- **Rooms Setup** — add/edit/delete rooms, manage room types and pricing
  (base price + live CGST/SGST breakdown from the active `TaxRule`).
- **Housekeeping** — rooms needing cleaning/maintenance, derived straight
  from `Room.status` (no separate task table), with a one-click "mark
  available".
- **Reservations** — a Day/Week/Month booking calendar (month view renders
  bookings as spanning bars colored by their dynamic `Status`), booking
  creation (with inline or existing-guest lookup), check-in/check-out/cancel
  transitions, and manual payment recording.

## Phase 3 & 6 (this build)

- **Tax invoices** — every booking reserves a real, permanent, sequential
  invoice number the instant it's created, shown on the Provisional Bill
  from day one; "Checkout & Print Bill" finalizes that same number's
  tax-snapshotted GST figures (letterheaded from Settings) rather than
  issuing a new one. Printed from a dedicated invoice view, reprintable
  from Manage Stay or Reports, and browsable/searchable from the
  **Invoices** module — which also supports cancel & reissue for a wrong
  finalized invoice (never a bare edit/delete; the old one is kept,
  cancelled, and reasoned, and a replacement is issued under the next
  number).
- **Settings** — hotel profile (name, address, phone, GSTIN, logo, brand
  color) used on every printed invoice and in the sidebar.
- **Reports** — a Rooms Reports module with four tabs: Bookings (status/
  room-type breakdown, a full detail table with every audit-trail-backed
  column, CSV export), Revenue (by payment method + daily trend), Occupancy
  (daily % across a date range), and GST (CGST/SGST collected, by rate,
  per-invoice) — all filterable by date range.

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
   `admin@sln-residency.test` / `ChangeMe123!` unless overridden in `.env`)
   and a Manager login (`manager@sln-residency.test` / `ChangeMe123!`) that
   has every permission except post-checkout corrections, for testing
   role-based restrictions.

5. **Run both apps** (in two terminals):

   ```bash
   npm run dev:api   # http://localhost:4000
   npm run dev:web   # http://localhost:5173
   ```

6. Open `http://localhost:5173`, sign in with the seeded admin login, and
   you should land on the Hotel Dashboard showing the seeded rooms/bookings.

## What's next

See the build order in [AI_RULES.md](AI_RULES.md) — next up is the rest of
Phase 4's admin controls (roles/permissions, statuses, tax rules, and staff
account management UIs), followed by Phase 5's PWA polish.
