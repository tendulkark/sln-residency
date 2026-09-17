import { roomSchema, updateRoomSchema, updateRoomStatusSchema } from "@sln/shared-schemas";
import { requirePermission } from "../lib/permissions.js";
import { recordAudit } from "../lib/audit.js";
import { priceRoom } from "../lib/tax.js";
import { findBookingConflict, findClosureConflict } from "../lib/availability.js";

async function serializeRoom(fastify, tenantId, room) {
  const pricing = await priceRoom(fastify.prisma, tenantId, room.roomType.basePrice);

  return {
    id: room.id,
    roomNumber: room.roomNumber,
    floor: room.floor,
    roomType: {
      id: room.roomType.id,
      name: room.roomType.name,
      basePrice: pricing.basePrice,
      capacity: room.roomType.capacity,
      amenities: room.roomType.amenities ?? [],
    },
    status: { id: room.status.id, code: room.status.code, label: room.status.label, color: room.status.color },
    pricing,
  };
}

export default async function roomsRoutes(fastify) {
  fastify.get(
    "/rooms",
    { preHandler: [fastify.authenticate, requirePermission("rooms.view")] },
    async (request) => {
      const tenantId = request.user.tenantId;
      const { checkIn, checkOut } = request.query;
      const rooms = await fastify.prisma.room.findMany({
        where: { tenantId },
        include: { roomType: true, status: true },
        orderBy: [{ floor: "asc" }, { roomNumber: "asc" }],
      });

      // When a stay window is given, drop rooms that are already booked or
      // closed for any part of it — availability is judged against the
      // exact check-in/check-out timestamps, not just the room's current
      // live status, so a room freeing up later today still shows correctly.
      let available = rooms;
      if (checkIn && checkOut) {
        const checkInDate = new Date(checkIn);
        const checkOutDate = new Date(checkOut);
        const conflicts = await Promise.all(
          rooms.map(async (room) => {
            const bookingConflict = await findBookingConflict(fastify.prisma, { tenantId, roomId: room.id, checkIn: checkInDate, checkOut: checkOutDate });
            if (bookingConflict) return true;
            const closureConflict = await findClosureConflict(fastify.prisma, { tenantId, roomId: room.id, startDate: checkInDate, endDate: checkOutDate });
            return Boolean(closureConflict);
          })
        );
        available = rooms.filter((_, i) => !conflicts[i]);
      }

      return Promise.all(available.map((room) => serializeRoom(fastify, tenantId, room)));
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
