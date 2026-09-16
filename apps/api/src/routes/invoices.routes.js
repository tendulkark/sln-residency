import { requirePermission } from "../lib/permissions.js";
import { recordAudit } from "../lib/audit.js";
import { computeStayBreakdown } from "../lib/billing.js";

const TENANT_LETTERHEAD_SELECT = {
  name: true,
  logoUrl: true,
  primaryColor: true,
  address: true,
  phone: true,
  email: true,
  gstin: true,
};

async function nextInvoiceNumber(prisma, tenantId) {
  const prefix = `INV-${new Date().getFullYear()}-`;
  const count = await prisma.invoice.count({ where: { tenantId, invoiceNumber: { startsWith: prefix } } });
  return `${prefix}${String(count + 1).padStart(5, "0")}`;
}

function invoiceView(invoice, tenant, stay) {
  return {
    invoice,
    tenant,
    bookings: stay.bookings,
    charges: stay.charges,
    payments: stay.payments,
    summary: stay.summary,
  };
}

export default async function invoicesRoutes(fastify) {
  // Fetch a previously-generated invoice for reprinting (any room in a
  // group booking resolves to the same invoice). 404 means "not generated
  // yet" — the frontend falls back to POST to generate one.
  fastify.get(
    "/bookings/:id/invoice",
    { preHandler: [fastify.authenticate, requirePermission("invoices.view")] },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const stay = await computeStayBreakdown(fastify.prisma, tenantId, request.params.id);
      if (!stay) return reply.code(404).send({ error: "Booking not found" });

      const invoice = await fastify.prisma.invoice.findFirst({
        where: { tenantId, bookingId: { in: stay.bookings.map((b) => b.id) } },
      });
      if (!invoice) return reply.code(404).send({ error: "Invoice not generated yet" });

      const tenant = await fastify.prisma.tenant.findUnique({ where: { id: tenantId }, select: TENANT_LETTERHEAD_SELECT });
      return invoiceView(invoice, tenant, stay);
    }
  );

  // Generate the tax invoice for a stay, snapshotting the tax rate/amount
  // used (AI_RULES.md #4) so a later change to the tenant's TaxRule never
  // rewrites a past invoice. Idempotent: calling it again for the same
  // stay returns the invoice already generated rather than issuing a new
  // number, so a retried "Checkout & Print Bill" click is safe.
  fastify.post(
    "/bookings/:id/invoice",
    { preHandler: [fastify.authenticate, requirePermission("invoices.generate")] },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const stay = await computeStayBreakdown(fastify.prisma, tenantId, request.params.id);
      if (!stay) return reply.code(404).send({ error: "Booking not found" });

      const bookingIds = stay.bookings.map((b) => b.id);
      let invoice = await fastify.prisma.invoice.findFirst({ where: { tenantId, bookingId: { in: bookingIds } } });

      if (!invoice) {
        try {
          invoice = await fastify.prisma.invoice.create({
            data: {
              tenantId,
              bookingId: stay.primary.id,
              invoiceNumber: await nextInvoiceNumber(fastify.prisma, tenantId),
              subtotal: stay.summary.taxableValue,
              taxRuleId: stay.taxRule?.id ?? null,
              taxRateSnapshot: stay.summary.taxRatePercent,
              taxAmount: stay.summary.cgst + stay.summary.sgst,
              total: stay.summary.grandTotal,
              generatedById: request.user.id,
            },
          });

          await recordAudit(fastify.prisma, {
            tenantId,
            userId: request.user.id,
            action: "invoice.generate",
            entityType: "Invoice",
            entityId: invoice.id,
            metadata: { bookingId: stay.primary.id, invoiceNumber: invoice.invoiceNumber, total: invoice.total },
          });
        } catch (err) {
          if (err.code !== "P2002") throw err;
          // Lost a race against a near-simultaneous "Checkout & Print Bill"
          // (or a retried request) — the unique bookingId/invoiceNumber
          // constraint means the invoice we wanted now exists; use it
          // rather than generating a second one for the same stay.
          invoice = await fastify.prisma.invoice.findFirst({ where: { tenantId, bookingId: { in: bookingIds } } });
          if (!invoice) throw err;
        }
      }

      const tenant = await fastify.prisma.tenant.findUnique({ where: { id: tenantId }, select: TENANT_LETTERHEAD_SELECT });
      return reply.code(201).send(invoiceView(invoice, tenant, stay));
    }
  );
}
