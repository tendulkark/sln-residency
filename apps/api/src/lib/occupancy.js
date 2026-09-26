import { isVoidStatus, nightsBetween } from "#src/lib/billing.js";
import { addDays, eachDayLabel, round2 } from "#src/lib/reports.js";

// Rooms Reports > Occupancy. The rules, agreed with the hotel 2026-09-26:
//
// - A room is occupied on date D if a guest is in it at the *night audit*
//   instant — midnight at the end of D. A stay that starts and ends on the
//   same calendar day (a day-use) counts for that day instead. So a room
//   vacated at 11am and left empty that night is not occupied that day.
// - Dates whose night audit has already passed are *actual*: only stays
//   that really happened count, timed by their actual check-in/check-out.
//   Later dates are *on the books*: in-house guests plus arrivals still
//   expected, timed by their booked dates. Averages are reported for the
//   two separately, so future days never drag the actual figure down.
// - A room under a closure (maintenance/renovation block) at the audit
//   instant isn't available, so it's left out of that date's denominator.
// - Cancelled/no-show bookings never occupy a room.
//
// Room revenue for ADR/RevPAR is the room tariff net of GST and of the
// stay's discount, spread evenly over the stay's billed nights; a night
// only counts toward a date range if it falls inside it.

// When a booking actually occupies (or, for a future date, is expected to
// occupy) its room — null if it never will.
function stayWindow(booking, now) {
  if (isVoidStatus(booking.status)) return null;
  const arrived = booking.actualCheckIn != null || booking.status.isTerminal;
  if (arrived) {
    const start = booking.actualCheckIn ?? booking.checkIn;
    // Still in house past the booked checkout (an overdue departure):
    // occupied until now, and — for the forecast — until they leave.
    const end = booking.actualCheckOut ?? new Date(Math.max(booking.checkOut.getTime(), now.getTime()));
    return { start, end, actual: true };
  }
  return { start: booking.checkIn, end: booking.checkOut, actual: false };
}

function occupiesDate(window, dayStart) {
  const audit = addDays(dayStart, 1);
  if (window.start <= audit && window.end > audit) return true;
  // Day-use: in and out within this one calendar day.
  return window.start >= dayStart && window.end <= audit && window.end > window.start;
}

// The GST rate a booking's room tariff carries: the finalized invoice's own
// snapshot rate when there is one, otherwise whichever active tax rule's
// slab its nightly rate falls in (the same lookup billing uses).
function rateFor(booking, invoiceRate, rules) {
  if (invoiceRate != null) return invoiceRate;
  const amount = Number(booking.ratePerNight);
  const rule = rules.find(
    (r) =>
      (r.appliesAboveAmount == null || amount >= Number(r.appliesAboveAmount)) &&
      (r.appliesBelowAmount == null || amount <= Number(r.appliesBelowAmount))
  );
  return rule ? Number(rule.ratePercent) : 0;
}

export async function buildOccupancyReport(prisma, tenantId, fromDate, toDate, now = new Date()) {
  const [rooms, bookings, closures, rules] = await Promise.all([
    prisma.room.findMany({ where: { tenantId }, select: { id: true, roomType: { select: { name: true } } } }),
    prisma.booking.findMany({
      where: {
        tenantId,
        // Generous window: an overdue guest's stay runs past its booked
        // checkOut, so anyone still in house is fetched too.
        checkIn: { lt: addDays(toDate, 1) },
        OR: [{ checkOut: { gt: fromDate } }, { actualCheckOut: { gt: fromDate } }, { actualCheckIn: { not: null }, actualCheckOut: null }],
      },
      select: {
        id: true,
        roomId: true,
        groupCode: true,
        checkIn: true,
        checkOut: true,
        actualCheckIn: true,
        actualCheckOut: true,
        ratePerNight: true,
        totalAmount: true,
        status: { select: { code: true, isTerminal: true } },
      },
    }),
    prisma.roomClosure.findMany({
      where: { tenantId, startDate: { lt: addDays(toDate, 1) }, endDate: { gt: fromDate } },
      select: { roomId: true, startDate: true, endDate: true },
    }),
    prisma.taxRule.findMany({ where: { tenantId, isActive: true, effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }] } }),
  ]);

  const roomTypeOf = new Map(rooms.map((r) => [r.id, r.roomType.name]));

  // Nightly net room revenue per booking. The discount is a stay-level
  // concession (a group shares one), so it's spread over the stay's rooms
  // by their share of the room total.
  const bookingIds = bookings.map((b) => b.id);
  const groupKeys = [...new Set(bookings.map((b) => b.groupCode).filter(Boolean))];
  const [discounts, invoices, groupSiblings] = await Promise.all([
    prisma.bookingCharge.findMany({
      where: { type: "discount", booking: { tenantId, OR: [{ id: { in: bookingIds } }, { groupCode: { in: groupKeys } }] } },
      select: { amount: true, booking: { select: { id: true, groupCode: true } } },
    }),
    prisma.invoice.findMany({
      where: { tenantId, isCancelled: false, isFinalized: true, booking: { OR: [{ id: { in: bookingIds } }, { groupCode: { in: groupKeys } }] } },
      select: { taxRateSnapshot: true, snapshot: true, booking: { select: { id: true, groupCode: true } } },
    }),
    prisma.booking.findMany({
      where: { tenantId, groupCode: { in: groupKeys } },
      select: { groupCode: true, totalAmount: true, status: { select: { code: true, isTerminal: true } } },
    }),
  ]);

  const stayKey = (b) => b.groupCode ?? b.id;
  const discountByStay = new Map();
  for (const d of discounts) discountByStay.set(stayKey(d.booking), (discountByStay.get(stayKey(d.booking)) ?? 0) + Number(d.amount));
  const invoiceRateByStay = new Map(
    invoices.map((i) => [stayKey(i.booking), Number(i.snapshot?.summary?.taxRatePercent ?? i.taxRateSnapshot)])
  );
  const roomsTotalByStay = new Map();
  for (const b of [...bookings.filter((x) => !x.groupCode), ...groupSiblings]) {
    if (isVoidStatus(b.status)) continue;
    const key = b.groupCode ?? b.id;
    roomsTotalByStay.set(key, (roomsTotalByStay.get(key) ?? 0) + Number(b.totalAmount));
  }

  const stays = [];
  for (const b of bookings) {
    const window = stayWindow(b, now);
    if (!window) continue;
    const key = stayKey(b);
    const inclTax = Number(b.totalAmount);
    const stayRooms = roomsTotalByStay.get(key) || inclTax;
    const discountShare = stayRooms ? Math.min((discountByStay.get(key) ?? 0) * (inclTax / stayRooms), inclTax) : 0;
    const rate = rateFor(b, invoiceRateByStay.get(key), rules);
    const nights = nightsBetween(b.checkIn, b.checkOut);
    stays.push({
      roomId: b.roomId,
      window,
      nightlyNet: (inclTax - discountShare) / (1 + rate / 100) / nights,
      nights,
      arrivedInRange: window.actual && window.start >= fromDate && window.start < toDate,
    });
  }

  const daily = [];
  const byType = new Map();
  for (const name of new Set(roomTypeOf.values())) {
    byType.set(name, { name, rooms: 0, availableNights: 0, soldNights: 0, revenue: 0 });
  }
  for (const r of rooms) byType.get(r.roomType.name).rooms += 1;

  const totals = { actual: { available: 0, sold: 0, revenue: 0, days: 0 }, onBooks: { available: 0, sold: 0, days: 0 } };

  for (const label of eachDayLabel(fromDate, toDate)) {
    const dayStart = new Date(`${label}T00:00:00`);
    const audit = addDays(dayStart, 1);
    const isActual = audit <= now;

    const closed = new Set(closures.filter((c) => c.startDate <= audit && c.endDate > audit).map((c) => c.roomId));
    const occupied = new Map(); // roomId -> nightly revenue
    for (const s of stays) {
      if (closed.has(s.roomId)) continue;
      // A past date counts only stays that really happened; a future one
      // counts guests still in house plus arrivals still expected.
      if (isActual && !s.window.actual) continue;
      if (occupiesDate(s.window, dayStart) && !occupied.has(s.roomId)) occupied.set(s.roomId, s.nightlyNet);
    }

    const available = rooms.length - closed.size;
    const sold = occupied.size;
    const revenue = [...occupied.values()].reduce((a, v) => a + v, 0);
    daily.push({
      date: label,
      actual: isActual,
      availableRooms: available,
      occupiedRooms: sold,
      occupancyPercent: available ? Math.round((sold / available) * 100) : 0,
    });

    if (isActual) {
      totals.actual.available += available;
      totals.actual.sold += sold;
      totals.actual.revenue += revenue;
      totals.actual.days += 1;
      for (const r of rooms) {
        if (closed.has(r.id)) continue;
        const t = byType.get(r.roomType.name);
        t.availableNights += 1;
        if (occupied.has(r.id)) {
          t.soldNights += 1;
          t.revenue += occupied.get(r.id);
        }
      }
    } else {
      totals.onBooks.available += available;
      totals.onBooks.sold += sold;
      totals.onBooks.days += 1;
    }
  }

  const pct = (sold, available) => (available ? Math.round((sold / available) * 1000) / 10 : 0);
  const arrivals = stays.filter((s) => s.arrivedInRange);

  return {
    totalRooms: rooms.length,
    actual: {
      days: totals.actual.days,
      occupancyPercent: pct(totals.actual.sold, totals.actual.available),
      roomNightsSold: totals.actual.sold,
      roomNightsAvailable: totals.actual.available,
      roomRevenue: round2(totals.actual.revenue),
      adr: totals.actual.sold ? round2(totals.actual.revenue / totals.actual.sold) : 0,
      revpar: totals.actual.available ? round2(totals.actual.revenue / totals.actual.available) : 0,
      avgStayNights: arrivals.length ? Math.round((arrivals.reduce((a, s) => a + s.nights, 0) / arrivals.length) * 10) / 10 : 0,
    },
    onTheBooks: {
      days: totals.onBooks.days,
      occupancyPercent: pct(totals.onBooks.sold, totals.onBooks.available),
      roomNightsSold: totals.onBooks.sold,
      roomNightsAvailable: totals.onBooks.available,
    },
    byRoomType: [...byType.values()]
      .map((t) => ({
        name: t.name,
        rooms: t.rooms,
        roomNightsSold: t.soldNights,
        roomNightsAvailable: t.availableNights,
        occupancyPercent: pct(t.soldNights, t.availableNights),
        roomRevenue: round2(t.revenue),
        adr: t.soldNights ? round2(t.revenue / t.soldNights) : 0,
      }))
      .sort((a, b) => b.roomRevenue - a.roomRevenue || a.name.localeCompare(b.name)),
    daily,
  };
}
