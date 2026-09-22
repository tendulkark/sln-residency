import { requirePermission } from "#src/lib/permissions.js";
import { recordAudit } from "#src/lib/audit.js";
import { computeStayBreakdown, nextInvoiceNumber, guestSnapshotFrom } from "#src/lib/billing.js";
import { startOfDay, endOfDayExclusive } from "#src/lib/reports.js";

const TENANT_LETTERHEAD_SELECT = {
  name: true,
  logoUrl: true,
  primaryColor: true,
  address: true,
  phone: true,
  email: true,
  gstin: true,
};

// Whitelisted so a client can never smuggle an arbitrary Prisma orderBy
// shape in through the query string (AI_RULES.md #3-style trust boundary,
// applied to sort params too). "guest"/"room" sort by the *live*
// booking.guest.name / room.roomNumber relation, not a finalized invoice's
// frozen guestSnapshot — the same rare-edge-case simplification as the
// list's own display already makes for anything except the guest name
// shown in the row itself.
function invoiceOrderBy(sortBy, sortDir) {
  const dir = sortDir === "desc" ? "desc" : "asc";
  switch (sortBy) {
    case "invoiceNumber":
      return { invoiceNumber: dir };
    case "date":
      return { generatedAt: dir };
    case "guest":
      return { booking: { guest: { name: dir } } };
    case "room":
      return { booking: { room: { roomNumber: dir } } };
    default:
      return { generatedAt: "desc" };
  }
}

const INVOICE_LIST_INCLUDE = {
  booking: { select: { guest: { select: { name: true } }, room: { select: { roomNumber: true } } } },
  generatedBy: { select: { name: true } },
  cancelledBy: { select: { name: true } },
  supersedes: { select: { invoiceNumber: true } },
  supersededBy: { select: { invoiceNumber: true } },
};

function invoiceListRow(inv) {
  return {
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    bookingId: inv.bookingId,
    // A finalized invoice's own snapshot outranks the guest's current (maybe
    // since-corrected) name, so a reissued-for-GSTIN row still lists under
    // whatever name that specific document was actually printed with.
    guestName: inv.isFinalized && inv.guestSnapshot ? inv.guestSnapshot.name : inv.booking.guest.name,
    room: inv.booking.room.roomNumber,
    generatedAt: inv.generatedAt,
    generatedByName: inv.generatedBy.name,
    total: inv.total,
    isFinalized: inv.isFinalized,
    isCancelled: inv.isCancelled,
    cancelledAt: inv.cancelledAt,
    cancelledByName: inv.cancelledBy?.name ?? null,
    cancellationReason: inv.cancellationReason,
    supersedesInvoiceNumber: inv.supersedes?.invoiceNumber ?? null,
    supersededByInvoiceNumber: inv.supersededBy?.invoiceNumber ?? null,
  };
}

// InvoiceDocument only ever reads guest fields off `bookings[0].guest`
// (room-charge rows aside, every other booking in a group is billed under
// the same primary guest) — so freezing a finalized invoice's "Billed To"
// block is just swapping the snapshot in for that one entry's guest, live
// data staying untouched everywhere else the same `stay` object is used.
function bookingsForInvoiceView(invoice, stay) {
  if (!invoice.isFinalized || !invoice.guestSnapshot) return stay.bookings;
  const [primary, ...rest] = stay.bookings;
  return [{ ...primary, guest: { ...primary.guest, ...invoice.guestSnapshot } }, ...rest];
}

function invoiceView(invoice, tenant, stay) {
  return {
    invoice,
    tenant,
    bookings: bookingsForInvoiceView(invoice, stay),
    charges: stay.charges,
    payments: stay.payments,
    summary: stay.summary,
  };
}

export default async function invoicesRoutes(fastify) {
  // Fetch a previously-generated invoice for reprinting (any room in a
  // group booking resolves to the same invoice). 404 means "not generated
  // yet" — the frontend falls back to POST to generate one. Only ever
  // resolves the *active* invoice for the stay — a cancelled one is a
  // historical record, viewed via GET /invoices/:id instead, never
  // reprinted as if it were current.
  fastify.get(
    "/bookings/:id/invoice",
    { preHandler: [fastify.authenticate, requirePermission("invoices.view")] },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const stay = await computeStayBreakdown(fastify.prisma, tenantId, request.params.id);
      if (!stay) return reply.code(404).send({ error: "Booking not found" });

      const invoice = await fastify.prisma.invoice.findFirst({
        where: { tenantId, bookingId: { in: stay.bookings.map((b) => b.id) }, isCancelled: false },
      });
      if (!invoice) return reply.code(404).send({ error: "Invoice not generated yet" });

      const tenant = await fastify.prisma.tenant.findUnique({ where: { id: tenantId }, select: TENANT_LETTERHEAD_SELECT });
      return invoiceView(invoice, tenant, stay);
    }
  );

  // Browse/search every invoice ever issued, active or cancelled — the
  // "find and manage a past invoice" screen that generation-time reprint
  // buttons alone don't cover.
  fastify.get(
    "/invoices",
    { preHandler: [fastify.authenticate, requirePermission("invoices.view")] },
    async (request) => {
      const tenantId = request.user.tenantId;
      const { search, from, to, status, sortBy, sortDir } = request.query;
      const page = Math.max(1, Number(request.query.page) || 1);
      const pageSize = Math.min(200, Math.max(1, Number(request.query.pageSize) || 50));

      const where = {
        tenantId,
        ...(status === "active" ? { isCancelled: false, isFinalized: true } : {}),
        ...(status === "reserved" ? { isCancelled: false, isFinalized: false } : {}),
        ...(status === "cancelled" ? { isCancelled: true } : {}),
        ...(from || to
          ? { generatedAt: { ...(from ? { gte: startOfDay(from) } : {}), ...(to ? { lt: endOfDayExclusive(to) } : {}) } }
          : {}),
        ...(search
          ? {
              OR: [
                { invoiceNumber: { contains: search, mode: "insensitive" } },
                { booking: { guest: { name: { contains: search, mode: "insensitive" } } } },
                { booking: { room: { roomNumber: { contains: search, mode: "insensitive" } } } },
              ],
            }
          : {}),
      };

      const [total, invoices] = await Promise.all([
        fastify.prisma.invoice.count({ where }),
        fastify.prisma.invoice.findMany({
          where,
          include: INVOICE_LIST_INCLUDE,
          orderBy: invoiceOrderBy(sortBy, sortDir),
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
      ]);

      return { rows: invoices.map(invoiceListRow), total, page, pageSize };
    }
  );

  // Fetch one specific invoice by its own id, active or cancelled — used by
  // the Invoices list to view/print a historical (cancelled) record, which
  // GET /bookings/:id/invoice above deliberately can't resolve.
  fastify.get(
    "/invoices/:id",
    { preHandler: [fastify.authenticate, requirePermission("invoices.view")] },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const invoice = await fastify.prisma.invoice.findFirst({
        where: { id: request.params.id, tenantId },
        include: { cancelledBy: { select: { name: true } }, supersededBy: { select: { invoiceNumber: true } } },
      });
      if (!invoice) return reply.code(404).send({ error: "Invoice not found" });

      const stay = await computeStayBreakdown(fastify.prisma, tenantId, invoice.bookingId);
      if (!stay) return reply.code(404).send({ error: "Booking not found" });

      const tenant = await fastify.prisma.tenant.findUnique({ where: { id: tenantId }, select: TENANT_LETTERHEAD_SELECT });
      return invoiceView(invoice, tenant, stay);
    }
  );

  // Finalize the stay's tax invoice at checkout — the number itself was
  // already reserved at booking time (bookings.routes.js), so this locks in
  // the final taxable figures against whatever TaxRule is active *now*
  // (AI_RULES.md #4) rather than creating a new document. Idempotent: once
  // finalized, calling it again just returns the same invoice unchanged, so
  // a retried "Checkout & Print Bill" click is safe. Falls back to creating
  // one from scratch for a booking that predates invoice-at-booking-time
  // reservation.
  fastify.post(
    "/bookings/:id/invoice",
    { preHandler: [fastify.authenticate, requirePermission("invoices.generate")] },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const stay = await computeStayBreakdown(fastify.prisma, tenantId, request.params.id);
      if (!stay) return reply.code(404).send({ error: "Booking not found" });

      const bookingIds = stay.bookings.map((b) => b.id);
      let invoice = await fastify.prisma.invoice.findFirst({ where: { tenantId, bookingId: { in: bookingIds }, isCancelled: false } });

      const finalFigures = {
        subtotal: stay.summary.taxableValue,
        taxRuleId: stay.taxRule?.id ?? null,
        taxRateSnapshot: stay.summary.taxRatePercent,
        taxAmount: stay.summary.cgst + stay.summary.sgst,
        total: stay.summary.grandTotal,
        guestSnapshot: guestSnapshotFrom(stay.primary.guest),
      };

      if (invoice && !invoice.isFinalized) {
        invoice = await fastify.prisma.invoice.update({
          where: { id: invoice.id },
          data: { ...finalFigures, isFinalized: true, generatedAt: new Date(), generatedById: request.user.id },
        });

        await recordAudit(fastify.prisma, {
          tenantId,
          userId: request.user.id,
          action: "invoice.finalize",
          entityType: "Invoice",
          entityId: invoice.id,
          metadata: { bookingId: stay.primary.id, invoiceNumber: invoice.invoiceNumber, total: invoice.total },
        });
      } else if (!invoice) {
        try {
          invoice = await fastify.prisma.invoice.create({
            data: { tenantId, bookingId: stay.primary.id, invoiceNumber: await nextInvoiceNumber(fastify.prisma, tenantId), ...finalFigures, generatedById: request.user.id, isFinalized: true },
          });

          await recordAudit(fastify.prisma, {
            tenantId,
            userId: request.user.id,
            action: "invoice.finalize",
            entityType: "Invoice",
            entityId: invoice.id,
            metadata: { bookingId: stay.primary.id, invoiceNumber: invoice.invoiceNumber, total: invoice.total, legacyBooking: true },
          });
        } catch (err) {
          if (err.code !== "P2002") throw err;
          // Lost a race against a near-simultaneous "Checkout & Print Bill"
          // (or a retried request) — the partial unique index on
          // (bookingId WHERE isCancelled = false) or the tenantId+
          // invoiceNumber constraint means an active invoice for this stay
          // now exists; use it rather than generating a second one.
          invoice = await fastify.prisma.invoice.findFirst({ where: { tenantId, bookingId: { in: bookingIds }, isCancelled: false } });
          if (!invoice) throw err;
        }
      }
      // else: already finalized — return unchanged, past figures never move.

      const tenant = await fastify.prisma.tenant.findUnique({ where: { id: tenantId }, select: TENANT_LETTERHEAD_SELECT });
      return reply.code(201).send(invoiceView(invoice, tenant, stay));
    }
  );

  // Cancel a wrong invoice and atomically reissue its replacement — never a
  // bare edit/delete of a legally-numbered tax document (AI_RULES.md #4).
  // The cancelled row is kept forever (isCancelled + reason + who/when) and
  // the new invoice records which one it supersedes, so the full sequence
  // and paper trail stay intact.
  fastify.post(
    "/invoices/:id/cancel",
    { preHandler: [fastify.authenticate, requirePermission("invoices.cancel")] },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const reason = (request.body?.reason ?? "").trim();
      if (!reason) return reply.code(400).send({ error: "A cancellation reason is required" });

      const oldInvoice = await fastify.prisma.invoice.findFirst({ where: { id: request.params.id, tenantId } });
      if (!oldInvoice) return reply.code(404).send({ error: "Invoice not found" });
      if (oldInvoice.isCancelled) return reply.code(409).send({ error: "Invoice is already cancelled" });
      // A reserved-but-unfinalized invoice doesn't need cancel+reissue —
      // nothing about it is legally fixed yet, so just edit the booking
      // directly and the same number keeps following it. Cancel+reissue is
      // only for undoing a *finalized* (checkout-time) tax invoice.
      if (!oldInvoice.isFinalized) {
        return reply.code(409).send({ error: "This invoice isn't finalized yet — edit the booking directly instead of cancelling." });
      }

      const stay = await computeStayBreakdown(fastify.prisma, tenantId, oldInvoice.bookingId);
      if (!stay) return reply.code(404).send({ error: "Booking not found" });

      let newInvoice;
      // A concurrent cancel+reissue of the very same invoice can't happen
      // (the isCancelled check above and the row update inside the
      // transaction serialize that), but two different invoice numbers
      // could still be picked from the same "latest" read under load — the
      // same race nextInvoiceNumber already documents for plain generation
      // — so retry once on a tenantId+invoiceNumber collision.
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          // eslint-disable-next-line no-await-in-loop
          newInvoice = await fastify.prisma.$transaction(async (tx) => {
            await tx.invoice.update({
              where: { id: oldInvoice.id },
              data: {
                isCancelled: true,
                cancelledAt: new Date(),
                cancelledById: request.user.id,
                cancellationReason: reason,
              },
            });

            return tx.invoice.create({
              data: {
                tenantId,
                bookingId: oldInvoice.bookingId,
                invoiceNumber: await nextInvoiceNumber(tx, tenantId),
                subtotal: stay.summary.taxableValue,
                taxRuleId: stay.taxRule?.id ?? null,
                taxRateSnapshot: stay.summary.taxRatePercent,
                taxAmount: stay.summary.cgst + stay.summary.sgst,
                total: stay.summary.grandTotal,
                // Re-reads whatever the Guest row says right now — if this
                // reissue was triggered by an admin correcting the guest's
                // details (guests.routes.js `PATCH /guests/:id`) moments
                // earlier, that correction is what gets frozen in here.
                guestSnapshot: guestSnapshotFrom(stay.primary.guest),
                generatedById: request.user.id,
                isFinalized: true,
                supersedesInvoiceId: oldInvoice.id,
              },
            });
          });
          break;
        } catch (err) {
          if (err.code !== "P2002" || attempt === 1) throw err;
        }
      }

      await recordAudit(fastify.prisma, {
        tenantId,
        userId: request.user.id,
        action: "invoice.cancel",
        entityType: "Invoice",
        entityId: oldInvoice.id,
        metadata: { invoiceNumber: oldInvoice.invoiceNumber, reason, reissuedAs: newInvoice.invoiceNumber },
      });
      await recordAudit(fastify.prisma, {
        tenantId,
        userId: request.user.id,
        action: "invoice.finalize",
        entityType: "Invoice",
        entityId: newInvoice.id,
        metadata: { bookingId: oldInvoice.bookingId, invoiceNumber: newInvoice.invoiceNumber, total: newInvoice.total, supersedes: oldInvoice.invoiceNumber },
      });

      const tenant = await fastify.prisma.tenant.findUnique({ where: { id: tenantId }, select: TENANT_LETTERHEAD_SELECT });
      return invoiceView(newInvoice, tenant, stay);
    }
  );
}
