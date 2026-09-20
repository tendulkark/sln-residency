import { guestSchema, guestUpdateSchema } from "@sln/shared-schemas";
import { requirePermission } from "#src/lib/permissions.js";
import { recordAudit } from "#src/lib/audit.js";

const GUEST_EDITABLE_FIELDS = ["name", "phone", "phone2", "email", "idProofType", "idProofNumber", "address", "companyName", "gstin"];

export default async function guestsRoutes(fastify) {
  fastify.get(
    "/guests",
    { preHandler: [fastify.authenticate, requirePermission("guests.view")] },
    async (request) => {
      const { search } = request.query;
      return fastify.prisma.guest.findMany({
        where: {
          tenantId: request.user.tenantId,
          ...(search
            ? {
                OR: [
                  { name: { contains: search, mode: "insensitive" } },
                  { phone: { contains: search, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        orderBy: { name: "asc" },
        take: 20,
      });
    }
  );

  fastify.post(
    "/guests",
    { preHandler: [fastify.authenticate, requirePermission("guests.edit")] },
    async (request, reply) => {
      const parsed = guestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
      }

      const guest = await fastify.prisma.guest.create({
        data: { tenantId: request.user.tenantId, ...parsed.data },
      });

      await recordAudit(fastify.prisma, {
        tenantId: request.user.tenantId,
        userId: request.user.id,
        action: "guest.create",
        entityType: "Guest",
        entityId: guest.id,
      });

      return reply.code(201).send(guest);
    }
  );

  // Correct an existing guest's details — most commonly a GSTIN/company
  // name a guest only supplies after they've already checked out, once
  // ManageStayModal's normal edit UI is no longer offered for the stay. A
  // deliberately narrower gate than `guests.edit` (which regular staff
  // already hold, for creating a guest on a new booking): this can retro-
  // actively change what every past invoice for this guest prints, so it's
  // admin-only by default (`guests.correct` isn't in the seeded Employee
  // role) even though nothing in the route itself hardcodes a role name.
  // A *finalized* invoice's own "Billed To" block is frozen at generation
  // time (Invoice.guestSnapshot) precisely so this doesn't silently rewrite
  // history — correcting one means cancel + reissue
  // (invoices.routes.js `POST /invoices/:id/cancel`), same as a wrong tax
  // figure (AI_RULES.md #4). Only a *reserved* (not yet finalized) invoice's
  // print reflects this edit immediately, same as any other pre-checkout
  // booking detail.
  fastify.patch(
    "/guests/:id",
    { preHandler: [fastify.authenticate, requirePermission("guests.correct")] },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const existing = await fastify.prisma.guest.findFirst({ where: { id: request.params.id, tenantId } });
      if (!existing) return reply.code(404).send({ error: "Guest not found" });

      const parsed = guestUpdateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
      }

      const guest = await fastify.prisma.guest.update({ where: { id: existing.id }, data: parsed.data });

      const changes = {};
      for (const field of GUEST_EDITABLE_FIELDS) {
        if (field in parsed.data && existing[field] !== guest[field]) changes[field] = { from: existing[field], to: guest[field] };
      }
      // Purely a debugging/audit breadcrumb pointing at the stay that
      // prompted this — never persisted on Guest, and the caller is trusted
      // (an already-permission-checked admin) so it's read straight off the
      // body rather than re-validated against guestUpdateSchema.
      const bookingId = typeof request.body?.bookingId === "string" ? request.body.bookingId : undefined;

      await recordAudit(fastify.prisma, {
        tenantId,
        userId: request.user.id,
        action: "guest.correct",
        entityType: "Guest",
        entityId: guest.id,
        metadata: { changes, ...(bookingId ? { bookingId } : {}) },
      });

      return guest;
    }
  );
}
