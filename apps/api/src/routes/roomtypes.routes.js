import { roomTypeSchema, updateRoomTypeSchema } from "@sln/shared-schemas";
import { requirePermission } from "../lib/permissions.js";
import { recordAudit } from "../lib/audit.js";
import { priceRoom } from "../lib/tax.js";

export default async function roomTypesRoutes(fastify) {
  fastify.get(
    "/room-types",
    { preHandler: [fastify.authenticate, requirePermission("roomtypes.view")] },
    async (request) => {
      const tenantId = request.user.tenantId;
      const roomTypes = await fastify.prisma.roomType.findMany({
        where: { tenantId },
        orderBy: { basePrice: "asc" },
        include: { _count: { select: { rooms: true } } },
      });

      // Live GST breakdown for each type's base price — the same TaxRule
      // lookup used for room pricing/booking, so what's shown here always
      // matches what a booking against this type actually bills.
      return Promise.all(
        roomTypes.map(async (rt) => ({ ...rt, pricing: await priceRoom(fastify.prisma, tenantId, rt.basePrice) }))
      );
    }
  );

  fastify.post(
    "/room-types",
    { preHandler: [fastify.authenticate, requirePermission("roomtypes.edit")] },
    async (request, reply) => {
      const parsed = roomTypeSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
      }

      const roomType = await fastify.prisma.roomType.create({
        data: { tenantId: request.user.tenantId, ...parsed.data },
      });

      await recordAudit(fastify.prisma, {
        tenantId: request.user.tenantId,
        userId: request.user.id,
        action: "roomtype.create",
        entityType: "RoomType",
        entityId: roomType.id,
        metadata: parsed.data,
      });

      return reply.code(201).send(roomType);
    }
  );

  fastify.patch(
    "/room-types/:id",
    { preHandler: [fastify.authenticate, requirePermission("roomtypes.edit")] },
    async (request, reply) => {
      const parsed = updateRoomTypeSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
      }

      const existing = await fastify.prisma.roomType.findFirst({
        where: { id: request.params.id, tenantId: request.user.tenantId },
      });
      if (!existing) return reply.code(404).send({ error: "Room type not found" });

      const roomType = await fastify.prisma.roomType.update({
        where: { id: existing.id },
        data: parsed.data,
      });

      await recordAudit(fastify.prisma, {
        tenantId: request.user.tenantId,
        userId: request.user.id,
        action: "roomtype.update",
        entityType: "RoomType",
        entityId: roomType.id,
        metadata: parsed.data,
      });

      return roomType;
    }
  );

  fastify.delete(
    "/room-types/:id",
    { preHandler: [fastify.authenticate, requirePermission("roomtypes.edit")] },
    async (request, reply) => {
      const existing = await fastify.prisma.roomType.findFirst({
        where: { id: request.params.id, tenantId: request.user.tenantId },
        include: { _count: { select: { rooms: true } } },
      });
      if (!existing) return reply.code(404).send({ error: "Room type not found" });
      if (existing._count.rooms > 0) {
        return reply.code(409).send({ error: "Cannot delete a room type that still has rooms assigned to it" });
      }

      await fastify.prisma.roomType.delete({ where: { id: existing.id } });

      await recordAudit(fastify.prisma, {
        tenantId: request.user.tenantId,
        userId: request.user.id,
        action: "roomtype.delete",
        entityType: "RoomType",
        entityId: existing.id,
      });

      return reply.code(204).send();
    }
  );
}
