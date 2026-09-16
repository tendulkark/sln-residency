import { roomSchema, updateRoomSchema, updateRoomStatusSchema } from "@sln/shared-schemas";
import { requirePermission } from "../lib/permissions.js";
import { recordAudit } from "../lib/audit.js";
import { getApplicableTaxRule, splitTax } from "../lib/tax.js";

async function serializeRoom(fastify, tenantId, room) {
  const basePrice = Number(room.roomType.basePrice);
  const taxRule = await getApplicableTaxRule(fastify.prisma, tenantId, basePrice);
  const pricing = taxRule
    ? splitTax(basePrice, taxRule.ratePercent)
    : { cgst: 0, sgst: 0, taxAmount: 0, total: basePrice };

  return {
    id: room.id,
    roomNumber: room.roomNumber,
    floor: room.floor,
    roomType: {
      id: room.roomType.id,
      name: room.roomType.name,
      basePrice,
      capacity: room.roomType.capacity,
      amenities: room.roomType.amenities ?? [],
    },
    status: { id: room.status.id, code: room.status.code, label: room.status.label, color: room.status.color },
    pricing: { basePrice, ...pricing },
  };
}

export default async function roomsRoutes(fastify) {
  fastify.get(
    "/rooms",
    { preHandler: [fastify.authenticate, requirePermission("rooms.view")] },
    async (request) => {
      const rooms = await fastify.prisma.room.findMany({
        where: { tenantId: request.user.tenantId },
        include: { roomType: true, status: true },
        orderBy: [{ floor: "asc" }, { roomNumber: "asc" }],
      });

      return Promise.all(rooms.map((room) => serializeRoom(fastify, request.user.tenantId, room)));
    }
  );

  fastify.post(
    "/rooms",
    { preHandler: [fastify.authenticate, requirePermission("rooms.edit")] },
    async (request, reply) => {
      const parsed = roomSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
      }

      const roomType = await fastify.prisma.roomType.findFirst({
        where: { id: parsed.data.roomTypeId, tenantId: request.user.tenantId },
      });
      if (!roomType) return reply.code(400).send({ error: "Unknown room type" });

      const defaultStatus = await fastify.prisma.status.findFirst({
        where: { tenantId: request.user.tenantId, domain: "room", isDefault: true },
      });
      if (!defaultStatus) return reply.code(500).send({ error: "No default room status configured" });

      const room = await fastify.prisma.room.create({
        data: { tenantId: request.user.tenantId, statusId: defaultStatus.id, ...parsed.data },
        include: { roomType: true, status: true },
      });

      await recordAudit(fastify.prisma, {
        tenantId: request.user.tenantId,
        userId: request.user.id,
        action: "room.create",
        entityType: "Room",
        entityId: room.id,
        metadata: parsed.data,
      });

      return reply.code(201).send(await serializeRoom(fastify, request.user.tenantId, room));
    }
  );

  fastify.patch(
    "/rooms/:id",
    { preHandler: [fastify.authenticate, requirePermission("rooms.edit")] },
    async (request, reply) => {
      const parsed = updateRoomSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
      }

      const existing = await fastify.prisma.room.findFirst({
        where: { id: request.params.id, tenantId: request.user.tenantId },
      });
      if (!existing) return reply.code(404).send({ error: "Room not found" });

      if (parsed.data.roomTypeId) {
        const roomType = await fastify.prisma.roomType.findFirst({
          where: { id: parsed.data.roomTypeId, tenantId: request.user.tenantId },
        });
        if (!roomType) return reply.code(400).send({ error: "Unknown room type" });
      }

      const room = await fastify.prisma.room.update({
        where: { id: existing.id },
        data: parsed.data,
        include: { roomType: true, status: true },
      });

      await recordAudit(fastify.prisma, {
        tenantId: request.user.tenantId,
        userId: request.user.id,
        action: "room.update",
        entityType: "Room",
        entityId: room.id,
        metadata: parsed.data,
      });

      return serializeRoom(fastify, request.user.tenantId, room);
    }
  );

  fastify.patch(
    "/rooms/:id/status",
    { preHandler: [fastify.authenticate, requirePermission("rooms.housekeeping")] },
    async (request, reply) => {
      const parsed = updateRoomStatusSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
      }

      const existing = await fastify.prisma.room.findFirst({
        where: { id: request.params.id, tenantId: request.user.tenantId },
      });
      if (!existing) return reply.code(404).send({ error: "Room not found" });

      const status = await fastify.prisma.status.findFirst({
        where: { id: parsed.data.statusId, tenantId: request.user.tenantId, domain: "room" },
      });
      if (!status) return reply.code(400).send({ error: "Unknown room status" });

      const room = await fastify.prisma.room.update({
        where: { id: existing.id },
        data: { statusId: status.id },
        include: { roomType: true, status: true },
      });

      await recordAudit(fastify.prisma, {
        tenantId: request.user.tenantId,
        userId: request.user.id,
        action: "room.status_change",
        entityType: "Room",
        entityId: room.id,
        metadata: { statusCode: status.code },
      });

      return serializeRoom(fastify, request.user.tenantId, room);
    }
  );

  fastify.delete(
    "/rooms/:id",
    { preHandler: [fastify.authenticate, requirePermission("rooms.edit")] },
    async (request, reply) => {
      const existing = await fastify.prisma.room.findFirst({
        where: { id: request.params.id, tenantId: request.user.tenantId },
      });
      if (!existing) return reply.code(404).send({ error: "Room not found" });

      const activeBooking = await fastify.prisma.booking.findFirst({
        where: { roomId: existing.id, status: { isTerminal: false } },
      });
      if (activeBooking) {
        return reply.code(409).send({ error: "Cannot delete a room with an active or upcoming booking" });
      }

      await fastify.prisma.room.delete({ where: { id: existing.id } });

      await recordAudit(fastify.prisma, {
        tenantId: request.user.tenantId,
        userId: request.user.id,
        action: "room.delete",
        entityType: "Room",
        entityId: existing.id,
      });

      return reply.code(204).send();
    }
  );
}
