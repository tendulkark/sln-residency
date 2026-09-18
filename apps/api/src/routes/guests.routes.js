import { guestSchema } from "@sln/shared-schemas";
import { requirePermission } from "#src/lib/permissions.js";
import { recordAudit } from "#src/lib/audit.js";

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
}
