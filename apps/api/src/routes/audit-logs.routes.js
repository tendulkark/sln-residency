import { requirePermission } from "#src/lib/permissions.js";

// A real calendar date in YYYY-MM-DD form (rejects 2026-99-01 or 02-31).
function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

function localDay(iso, endExclusive = false) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d + (endExclusive ? 1 : 0), 0, 0, 0, 0);
}

function parsePage(query) {
  return {
    page: Math.max(1, Number(query.page) || 1),
    pageSize: Math.min(200, Math.max(1, Number(query.pageSize) || 50)),
  };
}

function roomGuest(booking) {
  if (!booking) return null;
  return [booking.room?.roomNumber && `Room ${booking.room.roomNumber}`, booking.guest?.name].filter(Boolean).join(" · ");
}

// A readable name for the record each row is about ("INV-2026-00011",
// "Room 1003 · Ravi Kumar", "Manager"), looked up in one query per entity
// type for just the page being shown. A record deleted since keeps its raw
// id — the row's own metadata usually still says what it was.
async function entityLabels(prisma, tenantId, rows) {
  const idsByType = new Map();
  for (const r of rows) {
    if (!idsByType.has(r.entityType)) idsByType.set(r.entityType, new Set());
    idsByType.get(r.entityType).add(r.entityId);
  }
  const ids = (type) => [...(idsByType.get(type) ?? [])];
  const bookingInclude = { room: { select: { roomNumber: true } }, guest: { select: { name: true } } };

  const lookups = {
    Booking: () =>
      prisma.booking.findMany({ where: { tenantId, id: { in: ids("Booking") } }, include: bookingInclude }).then((xs) => xs.map((b) => [b.id, roomGuest(b)])),
    Invoice: () =>
      prisma.invoice.findMany({ where: { tenantId, id: { in: ids("Invoice") } }, select: { id: true, invoiceNumber: true } }).then((xs) => xs.map((i) => [i.id, i.invoiceNumber])),
    Payment: () =>
      prisma.payment
        .findMany({ where: { tenantId, id: { in: ids("Payment") } }, include: { booking: { include: bookingInclude } } })
        .then((xs) => xs.map((p) => [p.id, roomGuest(p.booking)])),
    BookingCharge: () =>
      prisma.bookingCharge
        .findMany({ where: { tenantId, id: { in: ids("BookingCharge") } }, include: { booking: { include: bookingInclude } } })
        .then((xs) => xs.map((c) => [c.id, [c.description, roomGuest(c.booking)].filter(Boolean).join(" · ")])),
    Room: () =>
      prisma.room.findMany({ where: { tenantId, id: { in: ids("Room") } }, select: { id: true, roomNumber: true } }).then((xs) => xs.map((r) => [r.id, `Room ${r.roomNumber}`])),
    RoomClosure: () =>
      prisma.roomClosure
        .findMany({ where: { tenantId, id: { in: ids("RoomClosure") } }, include: { room: { select: { roomNumber: true } } } })
        .then((xs) => xs.map((c) => [c.id, `Room ${c.room.roomNumber} closure`])),
    RoomType: () =>
      prisma.roomType.findMany({ where: { tenantId, id: { in: ids("RoomType") } }, select: { id: true, name: true } }).then((xs) => xs.map((t) => [t.id, t.name])),
    Guest: () =>
      prisma.guest.findMany({ where: { tenantId, id: { in: ids("Guest") } }, select: { id: true, name: true } }).then((xs) => xs.map((g) => [g.id, g.name])),
    User: () =>
      prisma.user.findMany({ where: { tenantId, id: { in: ids("User") } }, select: { id: true, name: true } }).then((xs) => xs.map((u) => [u.id, u.name])),
    Role: () =>
      prisma.role.findMany({ where: { tenantId, id: { in: ids("Role") } }, select: { id: true, name: true } }).then((xs) => xs.map((r) => [r.id, r.name])),
    PaymentMethod: () =>
      prisma.paymentMethod.findMany({ where: { tenantId, id: { in: ids("PaymentMethod") } }, select: { id: true, name: true } }).then((xs) => xs.map((m) => [m.id, m.name])),
    TaxRule: () =>
      prisma.taxRule.findMany({ where: { tenantId, id: { in: ids("TaxRule") } }, select: { id: true, name: true } }).then((xs) => xs.map((t) => [t.id, t.name])),
    // A status edit points at the Status row; a reorder at the whole domain.
    Status: () =>
      prisma.status
        .findMany({ where: { tenantId, id: { in: ids("Status") } }, select: { id: true, domain: true, label: true } })
        .then((xs) => [
          ...xs.map((s) => [s.id, `${s.label} (${s.domain})`]),
          ...ids("Status").filter((id) => ["room", "booking", "payment"].includes(id)).map((d) => [d, `All ${d} statuses`]),
        ]),
    Tenant: async () => ids("Tenant").map((id) => [id, "Hotel profile"]),
    InvoiceTemplate: async () => ids("InvoiceTemplate").map((id) => [id, "Invoice design"]),
  };

  const labels = new Map();
  await Promise.all(
    [...idsByType.keys()]
      .filter((type) => lookups[type])
      .map(async (type) => {
        for (const [id, label] of await lookups[type]()) labels.set(`${type}:${id}`, label);
      })
  );
  return labels;
}

// The Audit Log (auditlog.view): who did what, when (AI_RULES.md #9) —
// read-only, newest first, one page at a time straight from the database.
export default async function auditLogsRoutes(fastify) {
  const guard = { preHandler: [fastify.authenticate, requirePermission("auditlog.view")] };

  fastify.get("/audit-logs", guard, async (request, reply) => {
    const tenantId = request.user.tenantId;
    const { from, to, userId, entityType, action, entityId } = request.query;
    if ((from && !isIsoDate(from)) || (to && !isIsoDate(to))) {
      return reply.code(400).send({ error: "from/to must be YYYY-MM-DD dates" });
    }
    const { page, pageSize } = parsePage(request.query);

    const where = {
      tenantId,
      ...(from || to ? { createdAt: { ...(from ? { gte: localDay(from) } : {}), ...(to ? { lt: localDay(to, true) } : {}) } } : {}),
      ...(userId ? { userId } : {}),
      ...(entityType ? { entityType } : {}),
      ...(action ? { action } : {}),
      ...(entityId ? { entityId } : {}),
    };

    const [total, logs] = await Promise.all([
      fastify.prisma.auditLog.count({ where }),
      fastify.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: { select: { id: true, name: true } } },
      }),
    ]);

    const labels = await entityLabels(fastify.prisma, tenantId, logs);
    return {
      rows: logs.map((l) => ({
        id: l.id,
        createdAt: l.createdAt,
        action: l.action,
        entityType: l.entityType,
        entityId: l.entityId,
        entityLabel: labels.get(`${l.entityType}:${l.entityId}`) ?? null,
        metadata: l.metadata,
        user: l.user,
      })),
      total,
      page,
      pageSize,
    };
  });

  // What the filters can offer: only the people, record types and actions
  // this hotel's log actually contains.
  fastify.get("/audit-logs/facets", guard, async (request) => {
    const tenantId = request.user.tenantId;
    const [actions, userIds] = await Promise.all([
      fastify.prisma.auditLog.groupBy({ by: ["entityType", "action"], where: { tenantId }, orderBy: [{ entityType: "asc" }, { action: "asc" }] }),
      fastify.prisma.auditLog.groupBy({ by: ["userId"], where: { tenantId, userId: { not: null } } }),
    ]);
    const users = await fastify.prisma.user.findMany({
      where: { tenantId, id: { in: userIds.map((u) => u.userId) } },
      select: { id: true, name: true, isActive: true },
      orderBy: { name: "asc" },
    });
    return {
      entityTypes: [...new Set(actions.map((a) => a.entityType))],
      actions: actions.map((a) => ({ entityType: a.entityType, action: a.action })),
      users,
    };
  });
}
