import { requirePermission } from "#src/lib/permissions.js";
import {
  startOfDay,
  endOfDayExclusive,
  addDays,
  localDateLabel,
  round2,
  buildBookingReportRows,
  summarizeBookingsInRange,
  rowsToCsv,
  BOOKINGS_REPORT_SORT_KEYS,
} from "#src/lib/reports.js";

// An invoice's GST, rate by rate — from the lines frozen in its snapshot
// (room tariff and each charge at its own slab), or for an invoice issued
// before those existed, its single stored rate with the tax split evenly.
function taxLinesOf(invoice) {
  const lines = invoice.snapshot?.summary?.taxLines;
  if (Array.isArray(lines) && lines.length) {
    return lines.map((l) => ({ ratePercent: Number(l.ratePercent), taxable: Number(l.taxable), cgst: Number(l.cgst), sgst: Number(l.sgst) }));
  }
  const tax = Number(invoice.taxAmount);
  const half = round2(tax / 2);
  return [{ ratePercent: Number(invoice.taxRateSnapshot), taxable: Number(invoice.subtotal), cgst: half, sgst: round2(tax - half) }];
}

function parsePage(query) {
  return {
    page: Math.max(1, Number(query.page) || 1),
    pageSize: Math.min(200, Math.max(1, Number(query.pageSize) || 50)),
  };
}

function parseBookingsQuery(query) {
  return {
    from: query.from,
    to: query.to,
    statusCode: query.status || undefined,
    search: query.search || undefined,
    checkoutBasis: query.checkoutBasis === "true",
  };
}

// Never trust a raw client sortBy as a Prisma field/relation path — only a
// value from the known column list is allowed through.
function parseSort(query, allowedKeys) {
  return {
    sortBy: allowedKeys.includes(query.sortBy) ? query.sortBy : undefined,
    sortDir: query.sortDir === "desc" ? "desc" : query.sortDir === "asc" ? "asc" : undefined,
  };
}

export default async function reportsRoutes(fastify) {
  fastify.get(
    "/reports/bookings",
    { preHandler: [fastify.authenticate, requirePermission("reports.view")] },
    async (request) => {
      const tenantId = request.user.tenantId;
      const filters = parseBookingsQuery(request.query);
      const { page, pageSize } = parsePage(request.query);
      const { sortBy, sortDir } = parseSort(request.query, BOOKINGS_REPORT_SORT_KEYS);

      // Two passes on purpose: the summary needs every matching booking to
      // get accurate counts, but only a lean select (no charges/payments/
      // invoice/audit-trail joins) — the expensive enrichment in
      // buildBookingReportRows only ever runs for this one page's rows now,
      // not the whole filtered range (see reports.js for why that matters
      // on a busy tenant) — unless sortBy is one of the computed columns
      // (invoiceNumber/taxableValue/discount/total), which reports.js
      // documents and handles by necessarily enriching the whole filtered
      // range before it can sort and paginate.
      const [summary, rows] = await Promise.all([
        summarizeBookingsInRange(fastify.prisma, tenantId, filters),
        buildBookingReportRows(fastify.prisma, tenantId, filters, { skip: (page - 1) * pageSize, take: pageSize, sortBy, sortDir }),
      ]);

      return { ...summary, rows, total: summary.counts.totalRooms, page, pageSize };
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
        where: { tenantId, recordedAt: { gte: fromDate, lt: toDate }, status: { code: { notIn: ["failed", "refunded"] } } },
        include: { method: true },
      });

      // Net collections: refunds (a cancelled stay's advance, an
      // overpayment handed back) come off the day and method they were paid
      // out on, and are also reported on their own.
      const byMethod = new Map();
      const byDay = new Map();
      let collected = 0;
      let refunds = 0;
      for (const p of payments) {
        const amount = Number(p.amount);
        const signed = p.type === "refund" ? -amount : amount;
        if (p.type === "refund") refunds += amount;
        else collected += amount;
        const m = byMethod.get(p.method.name) ?? { name: p.method.name, amount: 0, refunded: 0 };
        m.amount += signed;
        if (p.type === "refund") m.refunded += amount;
        byMethod.set(p.method.name, m);
        const day = localDateLabel(p.recordedAt);
        byDay.set(day, (byDay.get(day) ?? 0) + signed);
      }

      return {
        total: round2(collected - refunds),
        collected: round2(collected),
        refunds: round2(refunds),
        byMethod: [...byMethod.values()].map((m) => ({ name: m.name, amount: round2(m.amount), refunded: round2(m.refunded) })),
        daily: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, amount]) => ({ date, amount: round2(amount) })),
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
      const { page, pageSize } = parsePage(request.query);

      // Cancelled invoices never collected GST that's still owed — a
      // cancel+reissue's replacement carries the real, current figures. A
      // merely-reserved (pre-checkout) invoice hasn't collected anything
      // yet either, so it's excluded until it's finalized.
      const where = { tenantId, isCancelled: false, isFinalized: true, generatedAt: { gte: fromDate, lt: toDate } };

      // Totals/by-rate must reflect every matching invoice, not just the
      // page on screen — but that only needs four numeric columns, so this
      // stays cheap (no guest/room join) even on a "This Year" range with
      // thousands of invoices. The guest/room-joined detail rows below are
      // fetched for just the current page.
      const allInvoices = await fastify.prisma.invoice.findMany({
        where,
        select: { subtotal: true, taxAmount: true, taxRateSnapshot: true, snapshot: true },
      });

      let totalTaxable = 0;
      let totalCGST = 0;
      let totalSGST = 0;
      const byRate = new Map();

      for (const inv of allInvoices) {
        const lines = taxLinesOf(inv);
        for (const line of lines) {
          totalTaxable += line.taxable;
          totalCGST += line.cgst;
          totalSGST += line.sgst;
          if (!byRate.has(line.ratePercent)) byRate.set(line.ratePercent, { ratePercent: line.ratePercent, taxable: 0, cgst: 0, sgst: 0, count: 0 });
          const agg = byRate.get(line.ratePercent);
          agg.taxable += line.taxable;
          agg.cgst += line.cgst;
          agg.sgst += line.sgst;
          agg.count += 1;
        }
      }

      const pageInvoices = await fastify.prisma.invoice.findMany({
        where,
        include: { booking: { include: { guest: true, room: true } } },
        orderBy: [{ generatedAt: "asc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      });

      const rows = pageInvoices.map((inv) => {
        const lines = taxLinesOf(inv);
        return {
          invoiceNumber: inv.invoiceNumber,
          date: inv.generatedAt,
          guestName: inv.guestSnapshot?.name ?? inv.booking.guest.name,
          room: inv.booking.room.roomNumber,
          rates: lines.filter((l) => l.ratePercent > 0).map((l) => l.ratePercent),
          taxable: round2(lines.reduce((sum, l) => sum + l.taxable, 0)),
          cgst: round2(lines.reduce((sum, l) => sum + l.cgst, 0)),
          sgst: round2(lines.reduce((sum, l) => sum + l.sgst, 0)),
          total: Number(inv.total),
        };
      });

      return {
        totalTaxable: round2(totalTaxable),
        totalCGST: round2(totalCGST),
        totalSGST: round2(totalSGST),
        byRate: [...byRate.values()]
          .sort((a, b) => a.ratePercent - b.ratePercent)
          .map((r) => ({ ...r, taxable: round2(r.taxable), cgst: round2(r.cgst), sgst: round2(r.sgst) })),
        rows,
        total: allInvoices.length,
        page,
        pageSize,
      };
    }
  );
}
