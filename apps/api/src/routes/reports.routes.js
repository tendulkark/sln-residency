import { requirePermission } from "../lib/permissions.js";
import { startOfDay, endOfDayExclusive, addDays, localDateLabel, buildBookingReportRows, summarizeBookingRows, rowsToCsv } from "../lib/reports.js";

function parseBookingsQuery(query) {
  return {
    from: query.from,
    to: query.to,
    statusCode: query.status || undefined,
    search: query.search || undefined,
    checkoutBasis: query.checkoutBasis === "true",
  };
}

export default async function reportsRoutes(fastify) {
  fastify.get(
    "/reports/bookings",
    { preHandler: [fastify.authenticate, requirePermission("reports.view")] },
    async (request) => {
      const tenantId = request.user.tenantId;
      const filters = parseBookingsQuery(request.query);
      const page = Math.max(1, Number(request.query.page) || 1);
      const pageSize = Math.min(200, Math.max(1, Number(request.query.pageSize) || 50));

      const rows = await buildBookingReportRows(fastify.prisma, tenantId, filters);
      const { counts, byStatus, byRoomType } = summarizeBookingRows(rows);

      const start = (page - 1) * pageSize;
      const pageRows = rows.slice(start, start + pageSize);

      return { counts, byStatus, byRoomType, rows: pageRows, total: rows.length, page, pageSize };
    }
  );

  fastify.get(
    "/reports/bookings.csv",
    { preHandler: [fastify.authenticate, requirePermission("reports.view")] },
    async (request, reply) => {
      const tenantId = request.user.tenantId;
      const filters = parseBookingsQuery(request.query);
      const rows = await buildBookingReportRows(fastify.prisma, tenantId, filters);
      const csv = rowsToCsv(rows);

      reply.header("Content-Type", "text/csv; charset=utf-8");
      reply.header("Content-Disposition", `attachment; filename="room-bookings-report.csv"`);
      return reply.send(csv);
    }
  );

  fastify.get(
    "/reports/revenue",
    { preHandler: [fastify.authenticate, requirePermission("reports.view")] },
    async (request) => {
      const tenantId = request.user.tenantId;
      const { from, to } = request.query;
      const fromDate = startOfDay(from);
      const toDate = endOfDayExclusive(to);

      const payments = await fastify.prisma.payment.findMany({
        where: { tenantId, recordedAt: { gte: fromDate, lt: toDate } },
        include: { method: true },
      });

      const byMethod = new Map();
      const byDay = new Map();
      let total = 0;
      for (const p of payments) {
        const amount = Number(p.amount);
        total += amount;
        byMethod.set(p.method.name, (byMethod.get(p.method.name) ?? 0) + amount);
        const day = localDateLabel(p.recordedAt);
        byDay.set(day, (byDay.get(day) ?? 0) + amount);
      }

      return {
        total,
        byMethod: [...byMethod.entries()].map(([name, amount]) => ({ name, amount })),
        daily: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, amount]) => ({ date, amount })),
      };
    }
  );

  fastify.get(
    "/reports/occupancy",
    { preHandler: [fastify.authenticate, requirePermission("reports.view")] },
    async (request) => {
      const tenantId = request.user.tenantId;
      const { from, to } = request.query;
      const fromDate = startOfDay(from);
      const toDate = endOfDayExclusive(to);

      const [totalRooms, bookings] = await Promise.all([
        fastify.prisma.room.count({ where: { tenantId } }),
        fastify.prisma.booking.findMany({
          where: { tenantId, status: { isTerminal: false }, checkIn: { lt: toDate }, checkOut: { gt: fromDate } },
          select: { roomId: true, checkIn: true, checkOut: true },
        }),
      ]);

      const daily = [];
      for (let day = new Date(fromDate); day < toDate; day = addDays(day, 1)) {
        const dayEnd = addDays(day, 1);
        const occupiedRooms = new Set(
          bookings.filter((b) => new Date(b.checkIn) < dayEnd && new Date(b.checkOut) > day).map((b) => b.roomId)
        ).size;
        daily.push({
          date: localDateLabel(day),
          occupiedRooms,
          totalRooms,
          occupancyPercent: totalRooms ? Math.round((occupiedRooms / totalRooms) * 100) : 0,
        });
      }

      const avgOccupancyPercent = daily.length ? Math.round(daily.reduce((s, d) => s + d.occupancyPercent, 0) / daily.length) : 0;

      return { totalRooms, avgOccupancyPercent, daily };
    }
  );

  fastify.get(
    "/reports/gst",
    { preHandler: [fastify.authenticate, requirePermission("reports.view")] },
    async (request) => {
      const tenantId = request.user.tenantId;
      const { from, to } = request.query;
      const fromDate = startOfDay(from);
      const toDate = endOfDayExclusive(to);

      const invoices = await fastify.prisma.invoice.findMany({
        where: { tenantId, generatedAt: { gte: fromDate, lt: toDate } },
        include: { booking: { include: { guest: true, room: true } } },
        orderBy: { generatedAt: "asc" },
      });

      let totalTaxable = 0;
      let totalCGST = 0;
      let totalSGST = 0;
      const byRate = new Map();

      const rows = invoices.map((inv) => {
        const taxable = Number(inv.subtotal);
        const tax = Number(inv.taxAmount);
        const half = Math.round((tax / 2) * 100) / 100;
        const sgst = Math.round((tax - half) * 100) / 100;

        totalTaxable += taxable;
        totalCGST += half;
        totalSGST += sgst;

        const rateKey = Number(inv.taxRateSnapshot);
        if (!byRate.has(rateKey)) byRate.set(rateKey, { ratePercent: rateKey, taxable: 0, cgst: 0, sgst: 0, count: 0 });
        const agg = byRate.get(rateKey);
        agg.taxable += taxable;
        agg.cgst += half;
        agg.sgst += sgst;
        agg.count += 1;

        return {
          invoiceNumber: inv.invoiceNumber,
          date: inv.generatedAt,
          guestName: inv.booking.guest.name,
          room: inv.booking.room.roomNumber,
          taxable,
          cgst: half,
          sgst,
          total: Number(inv.total),
        };
      });

      return {
        totalTaxable: Math.round(totalTaxable * 100) / 100,
        totalCGST: Math.round(totalCGST * 100) / 100,
        totalSGST: Math.round(totalSGST * 100) / 100,
        byRate: [...byRate.values()],
        rows,
      };
    }
  );
}
