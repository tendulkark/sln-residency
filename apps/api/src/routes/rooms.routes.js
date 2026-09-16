import { requirePermission } from "../lib/permissions.js";

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

      return rooms.map((room) => ({
        id: room.id,
        roomNumber: room.roomNumber,
        floor: room.floor,
        roomType: { id: room.roomType.id, name: room.roomType.name, basePrice: room.roomType.basePrice },
        status: { id: room.status.id, code: room.status.code, label: room.status.label, color: room.status.color },
      }));
    }
  );
}
