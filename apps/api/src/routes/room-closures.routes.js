import { roomClosureSchema } from "@sln/shared-schemas";
import { requirePermission } from "../lib/permissions.js";
import { recordAudit } from "../lib/audit.js";
import { findClosureConflict, findBookingConflict } from "../lib/availability.js";

export default async function roomClosuresRoutes(fastify) {
  fastify.get(
    "/room-closures",
    { preHandler: [fastify.authenticate, requirePermission("rooms.view")] },
    async (request) => {
      const { roomId, from, to } = request.query;
      return fastify.prisma.roomClosure.findMany({
        where: {
          tenantId: request.user.tenantId,
          ...(roomId ? { roomId } : {}),
          ...(from ? { endDate: { gt: new Date(from) } } : {}),
          ...(to ? { startDate: { lt: new Date(to) } } : {}),
        },
        include: { room: { select: { id: true, roomNumber: true, floor: true } } },
        orderBy: { startDate: "asc" },
      });
    }
  );

  fastify.post(
    "/room-closures",
    { preHandler: [fastify.authenticate, requirePermission("roomclosures.manage")] },
    async (request, reply) => {
      const parsed = roomClosureSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
      }
      const { roomId, startDate, endDate, reason } = parsed.data;

      const room = await fastify.prisma.room.findFirst({
        where: { id: roomId, tenantId: request.user.tenantId },
      });
      if (!room) return reply.code(400).send({ error: "Unknown room" });

      const bookingConflict = await findBookingConflict(fastify.prisma, {
        tenantId: request.user.tenantId,
        roomId,
        checkIn: startDate,
        checkOut: endDate,
      });
      if (bookingConflict) {
        return reply.code(409).send({ error: "Room has an active booking in that date range" });
      }

      const closureConflict = await findClosureConflict(fastify.prisma, {
        tenantId: request.user.tenantId,
        roomId,
        startDate,
        endDate,
      });
      if (closureConflict) {
        return reply.code(409).send({ error: "Room already has a closure overlapping that date range" });
      }

      const closure = await fastify.prisma.roomClosure.create({
        data: { tenantId: request.user.tenantId, createdById: request.user.id, roomId, startDate, endDate, reason },
        include: { room: { select: { id: true, roomNumber: true, floor: true } } },
      });

      await recordAudit(fastify.prisma, {
        tenantId: request.user.tenantId,
        userId: request.user.id,
        action: "roomclosure.create",
        entityType: "RoomClosure",
        entityId: closure.id,
        metadata: { roomId, startDate, endDate },
      });

      return reply.code(201).send(closure);
    }
  );

  fastify.delete(
    "/room-closures/:id",
    { preHandler: [fastify.authenticate, requirePermission("roomclosures.manage")] },
    async (request, reply) => {
      const existing = await fastify.prisma.roomClosure.findFirst({
        where: { id: request.params.id, tenantId: request.user.tenantId },
      });
      if (!existing) return reply.code(404).send({ error: "Closure not found" });

      await fastify.prisma.roomClosure.delete({ where: { id: existing.id } });

      await recordAudit(fastify.prisma, {
        tenantId: request.user.tenantId,
        userId: request.user.id,
        action: "roomclosure.delete",
        entityType: "RoomClosure",
        entityId: existing.id,
      });

      return reply.code(204).send();
    }
  );
}
