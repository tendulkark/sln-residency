# AI_RULES.md — read this before writing any code in this repo

## What this project is

A multi-tenant SaaS hotel room-booking application, **staff-only** (Admin and
Employee accounts — there is no guest-facing booking or guest login), built in
JavaScript (not TypeScript) with React + Vite on the frontend and
Node.js + Fastify + Prisma on the backend, installable as a PWA.

It is sold to multiple hotels, not just one — every feature must work for
tenant #2 and #50, not just tenant #1 (SLN Residency).

There is **no payment gateway integration**. Staff record payments manually
(amount + payment method + status) against a booking, purely for
reporting/reconciliation. Never add Razorpay/Stripe/UPI-gateway code unless
explicitly asked later.

## Non-negotiable rules

1. Never hardcode a status string, GST rate, role name, permission name, or
   payment method name in application code. These live in the `Status`,
   `TaxRule`, `Role`, `Permission`, and `PaymentMethod` tables. If a feature
   seems to need a hardcoded value, stop and add a config table/row instead.
2. Every table holding business data must include `tenantId`, and every query
   must filter by it, taken from the authenticated request's user — never
   from client input. When adding a new table, add `tenantId` by default
   unless it is a truly global table (e.g. the `Permission` catalog).
3. Permission checks happen in the API, not just the UI. Hiding a button or
   menu item in React is a UX nicety, never a security boundary. Every
   backend route must check the caller's permissions before touching data
   (see `apps/api/src/lib/permissions.js`).
4. GST/tax is computed server-side. An invoice **number** is reserved the
   moment a booking is created, but the actual tax figures are computed and
   locked in only at checkout (invoice *finalization*), using the `TaxRule`
   row active at that moment — never trust a tax amount sent from the
   client, and never treat a pre-checkout reserved number as a real tax
   computation. A finalized invoice snapshots the rate/rule used so past
   invoices never change when an Admin edits future rates. A finalized
   invoice is never edited or hard-deleted — a wrong one is cancelled (kept
   forever, reason/who/when recorded, number never reused) and a
   replacement is reissued under the next number, atomically, in the same
   transaction (`invoices.routes.js` `POST /invoices/:id/cancel`). An
   unfinalized (reserved, pre-checkout) invoice needs no such ceremony —
   just edit the booking directly; the same reserved number keeps following
   it.
5. Payments are entered by staff after the fact (cash/UPI/card/etc. already
   collected at the desk) — do not build a checkout flow, do not integrate a
   payment gateway, do not process card details.
6. Do not introduce TypeScript, a different frontend framework, or a
   different ORM without being explicitly asked. Stay inside: React + Vite +
   JS, Fastify, Prisma, PostgreSQL.
7. Keep secrets out of the repo. All config (DB URL, JWT secrets) goes in
   `.env` files that are gitignored, referenced via `process.env`.
8. Prefer editing/extending existing modules over creating parallel/duplicate
   ones. Before adding a new file, check whether an existing
   service/route/component already owns that responsibility. Follow the
   layout in README.md "Project structure": a web module is
   `modules/<domain>/{pages,components,constants.js}`, app-wide plumbing
   (router, guards, auth store) lives in `app/`, design-system primitives in
   `ui/` (imported only via `@/ui/index.js`), and imports are always
   absolute (`@/…` on the web, `#src/…` in the API).
9. Every booking/payment/status-changing action must write an `AuditLog` row
   (who did what, when, on which tenant).
10. Use the shared Zod schemas in `/packages/shared-schemas` for validation
    on both frontend and backend — don't duplicate validation logic.
11. When unsure about a business rule (e.g. how a specific GST slab should
    behave), ask rather than guessing — tax logic must be correct, not
    merely plausible.

## Build order (current status)

- [x] Phase 1 — Foundation: monorepo scaffold, Postgres schema (Prisma),
      JWT auth + roles/permissions, tenant model, admin shell listing rooms
      and their status.
- [x] Phase 2 — Core booking flow: room types, availability (incl. a
      RoomClosure model for maintenance/renovation blocks), create/edit/
      status-transition bookings, dynamic booking statuses. Shipped alongside
      a Hotel Dashboard (live room board + stats), a Housekeeping view
      (derived from room status, no new table), and a Reservations calendar.
- [x] Phase 3 — Manual payments & GST: tax_rules engine and record-payment UI
      (`lib/tax.js`, `payments.routes.js`), plus invoice generation with
      snapshotted tax (`lib/billing.js`, `invoices.routes.js`). A real,
      permanent, sequential invoice number is reserved the instant a
      booking is created (`createReservedInvoice`, called from
      `bookings.routes.js`'s `POST /bookings`); checkout finalizes that
      same number's tax figures (`Invoice.isFinalized`) rather than issuing
      a new one, so the number on the Provisional Bill at booking time is
      the exact number on the final Tax Invoice. A stay has at most one
      *active* invoice at a time (a partial unique index on
      `bookingId WHERE isCancelled = false`, since it's no longer "exactly
      one, ever"). A finalized invoice that's wrong is cancelled and
      reissued under a fresh number, never edited/deleted — see rule #4.
      Printable from Manage Stay, reprinted from Reports, or found/managed
      from the dedicated **Invoices** module (search/filter by number,
      guest, room, date, status; cancel & reissue from there too).
- [ ] Phase 4 — Admin controls: room types/pricing management (Rooms Setup),
      hotel profile/branding (Settings), staff accounts (Staff), and the
      printed invoice's look (Invoice Design, `invoice-template.routes.js`)
      are in; manage roles/permissions, statuses, and tax rules are still
      outstanding.
- [x] Phase 5 — PWA polish: manifest + generated icons (favicons,
      apple-touch-icon, 192/512 + maskable) via `vite-plugin-pwa`, an
      offline-shell service worker (network-first for API calls), and iOS
      "Add to Home Screen" meta tags — installable on Android/iOS/desktop.
      Outstanding: a custom in-app "Install" button (`beforeinstallprompt`);
      today it relies on the browser's own native install UI.
- [x] Phase 6 — Reporting: a Rooms Reports module (`reports.routes.js`,
      `lib/reports.js`) covering Bookings (status/room-type breakdown, full
      audit-trail-backed detail table, CSV export), Revenue (by payment
      method + daily), Occupancy (daily % across the range), and GST
      (CGST/SGST collected, by rate, per-invoice).
- [ ] Phase 7 — Multi-tenant/reseller layer: tenant sign-up, subdomain
      routing, subscription plan gating, white-label theming.
