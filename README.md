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
  Each signed-in browser/device is its own `UserSession` row, so staff can
  be signed in on the desk PC and a phone at once, and sign any device out
  from their Profile (effective on that device's next request).
- **Monorepo**: npm workspaces — `apps/web`, `apps/api`,
  `packages/shared-schemas` (Zod schemas + the permission catalog, shared by
  both apps).

## Project structure

```
apps/web/src
├── main.jsx              # bootstraps React, React Query, the router, the PWA SW
├── index.css             # Tailwind + the ink/state design tokens
├── app/                  # composition root — the only layer that knows every module
│   ├── router.jsx        #   route table (pages wired to nav items + permissions)
│   ├── navigation.js     #   NAV_ITEMS, assembled from each module's *_NAV_ITEM
│   ├── AdminShell.jsx    #   sidebar + header chrome around every page
│   ├── RootLayout.jsx    #   silent session restore on cold load
│   ├── authStore.js      #   Zustand session store (token, user, tenant, permissions)
│   ├── ModuleRefresh.jsx #   per-module Refresh button + Ctrl+R/F5 (refetches only what's on screen)
│   ├── useSessionSync.js #   keeps permissions/branding in sync with /me while the app is open
│   └── guards/           #   ProtectedRoute (signed in?) / RequirePermission (allowed?)
├── modules/<domain>/     # one folder per business area, all shaped the same way
│   ├── pages/            #   the routed screen(s) — the module's entry point
│   ├── components/       #   modals/cards/forms owned by this module
│   └── constants.js      #   route path, nav item (icon + permission), React Query keys
├── ui/                   # domain-agnostic design-system primitives (Button, Modal, DataTable…)
│   └── index.js          #   the barrel — outside ui/, import ONLY from "@/ui/index.js"
└── lib/                  # framework-free helpers: api.js (fetch + refresh), format.js,
                          #   dateRange.js, theme.js

apps/api/src
├── server.js / app.js    # boot + plugin/route registration
├── config/env.js         # validated process.env
├── plugins/              # Fastify decorators: prisma client, JWT authenticate
├── routes/*.routes.js    # one plugin per resource; every handler checks permissions
└── lib/                  # tax, billing, availability, reports, audit, tokens, permissions

packages/shared-schemas/src   # Zod schemas + the permission catalog, one file per entity
```

Module map (`apps/web/src/modules/`):

| Module         | Page              | Components                                                                                                            |
| -------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------- |
| `auth`         | `LoginPage`       | —                                                                                                                     |
| `dashboard`    | `DashboardPage`   | `StatCard`, `RoomBoardCard`                                                                                           |
| `rooms`        | `RoomsSetupPage`  | `RoomFormModal`, `RoomTypesModal`                                                                                     |
| `housekeeping` | `HousekeepingPage`| `RoomClosuresModal`                                                                                                   |
| `reservations` | `ReservationsPage`| `BookingFormModal`, `ManageStayModal`, `EditBookingModal`, `ExtendStayModal`, `RoomBookingsModal`, `DayBookingsModal`, `DaySheet`, `BookingRow`, `MiniDatePicker`, `MonthYearPicker` (+ `calendarUtils.js`) |
| `invoices`     | `InvoicesPage`, `InvoiceDesignPage` | `InvoiceModal`, `InvoiceDocument`, `ProvisionalBillModal`, `GuestDetailsForm`, `InvoiceDesignForm` (+ `useInvoiceTemplate.js`, `invoicePreviewSample.js`) |
| `reports`      | `ReportsPage`     | `ReportPeriodPicker`, `BookingsReport`, `RevenueReport`, `OccupancyReport`, `GstReport`, `reportParts` (+ `reportPeriod.js`) |
| `settings`     | `SettingsLayout` (hub) → `HotelProfilePage`, `TaxRulesPage`, `PaymentMethodsPage`, `StatusesPage` | `SettingsSection`, `TaxRuleFormModal` (+ `taxRuleUtils.js`) |
| `staff`        | `StaffPage`       | `UserFormModal`, `ResetPasswordModal`                                                                                 |
| `roles`        | `RolesPage`       | `RoleEditor`                                                                                                          |
| `audit`        | `AuditLogPage`    | `AuditDetailModal` (+ `auditFormat.js`)                                                                               |
| `profile`      | `ProfilePage`     | `SignedInDevicesCard`                                                                                                 |
| `common`       | —                 | `StatusBadge`, `GstCalculator` — components/keys shared by several modules but still domain-aware (so not in `ui/`) |

Conventions:

- Imports are always absolute: `@/…` in the web app, `#src/…` in the API and
  shared package. No `./` or `../` chains.
- Dependency direction is one-way: `app → modules → { ui, lib }`. Modules may
  import each other's `constants.js` (to invalidate a query) and components
  (e.g. Reservations opens `InvoiceModal`), but never anything in `app/`.
- `ui/` never imports from `modules/` or knows about hotels, GST, or bookings.
- Every page renders a `PageHeader`; the shell adds the module **Refresh**
  button to it automatically (via `PageHeaderExtrasContext`), so a new
  module gets it for free. Refresh (or Ctrl+R / Cmd+R / F5 inside the app)
  re-fetches only the queries currently on screen, re-syncs permissions,
  and keeps the page's filters and open dialogs; Ctrl+Shift+R is still a
  full browser reload.

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
- **Checkout, cancellation & refunds** — check-in, checkout and cancel
  act on the whole stay (every room of a group) at once, all-or-nothing
  (`POST /bookings/:id/check-in|checkout|cancel`). When a guest leaves
  later or earlier than booked, staff choose at checkout whether to bill
  the actual stay or the booked nights; checkout is refused unless the
  balance is exactly zero (collect what's due, or refund an overpayment,
  in the same step). Cancelling refunds everything the guest paid.
  Refunds are their own `Payment` rows (`type: "refund"`) and come off
  collections in the dashboard and reports. A finalized invoice prints
  from a frozen snapshot, with GST split rate by rate (equal CGST/SGST
  plus a round-off line).
- **Settings** — a hub with one tab per area, each gated by its own
  permission:
  - **Hotel profile** (`settings.manage`) — name, address, phone, GSTIN,
    logo, brand color, used on every printed invoice and in the sidebar.
  - **Tax rules** (`taxrules.manage`) — GST slabs on the room tariff. A
    slab is matched on the tariff per room per night *before* GST, as the
    half-open range (above, up to], so a boundary tariff falls in the lower
    slab. Overlapping active slabs are refused, a "GST in force today"
    ladder flags any tariff range no rule covers, and a rule that has billed
    a finalized invoice keeps its rate, slab and start date (end-date it and
    add a new one to change the rate). The SAC code feeds the GSTR-1 export.
  - **Payment methods** (`paymentmethods.manage`) — add, rename, switch
    off; a method with payments can't be deleted, and one must stay on.
  - **Statuses** (`statuses.manage`) — rename, recolor and reorder room/
    booking/payment statuses, and choose whether a new booking starts
    Pending or Confirmed. The built-in statuses (`Status.isSystem`,
    `WORKFLOW_STATUS_CODES`) drive check-in/checkout, so their codes are
    fixed.
- **Roles & Permissions** (`roles.manage`) — create, rename, duplicate and
  delete roles and tick their permissions. The built-in Admin role is
  read-only and always holds every permission (incl. future ones); a role
  in use can't be deleted, and nobody can remove `roles.manage` from their
  own role. Changes apply on the affected users' next request.
- **Audit Log** (`auditlog.view`) — every recorded change, newest first,
  filterable by date, person, area and action, with plain-English labels,
  a before/after view, and a per-record history.
- **Invoice Design** (Admin-only, `invoices.customize`) — pick the printed
  invoice's layout (Classic/Modern/Minimal), accent color, font and size,
  logo position, which optional hotel/guest fields show, and the wording of
  the thank-you note, bank details, terms, footer and signatory (plus a
  signature/stamp image), with a live preview. Stored per tenant in
  `InvoiceTemplate`; presentation only — GST-required fields always print
  and figures/numbers are never affected.
- **Reports** — one Day/Week/Month/Year/Custom period (weeks start
  Sunday, ‹ › to step, kept in the URL) scopes four tabs, each with its own
  CSV export: **Bookings** (stays, room-nights, average stay, by status /
  room type, and a compact detail table with a totals row for the whole
  range), **Revenue** (net collected vs billed with change vs the previous
  period, by payment method, by staff member, and a per-day/week/month
  table for cash reconciliation), **Occupancy** (a room counts if it's
  occupied at midnight; past nights are *actual*, later ones *on the
  books*, never averaged together; closures excluded; ADR, RevPAR, average
  stay, by room type), and **GST** (B2B/B2C split, rate-wise table,
  invoice list and a GSTR-1-friendly CSV with GSTIN and SAC).

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

See the build order in [AI_RULES.md](AI_RULES.md) — Phase 4 is complete;
next up are the first live deployment and Phase 7's multi-tenant/reseller
layer.
