import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";
import {
  PERMISSIONS,
  DEFAULT_ADMIN_PERMISSION_CODES,
  DEFAULT_MANAGER_PERMISSION_CODES,
  DEFAULT_EMPLOYEE_PERMISSION_CODES,
  WORKFLOW_STATUS_CODES,
} from "@sln/shared-schemas";

const prisma = new PrismaClient();

const ROOM_STATUSES = [
  { code: "available", label: "Available", color: "#16a34a", isDefault: true, sortOrder: 1 },
  { code: "occupied", label: "Occupied", color: "#dc2626", sortOrder: 2 },
  { code: "dirty", label: "Dirty", color: "#db2777", sortOrder: 3 },
  { code: "cleaning", label: "Under Cleaning", color: "#f59e0b", sortOrder: 4 },
  { code: "maintenance", label: "Maintenance", color: "#6b7280", sortOrder: 5 },
];

const BOOKING_STATUSES = [
  { code: "pending", label: "Pending", color: "#f59e0b", isDefault: true, sortOrder: 1 },
  { code: "confirmed", label: "Confirmed", color: "#2563eb", sortOrder: 2 },
  { code: "checked_in", label: "Checked-in", color: "#16a34a", sortOrder: 3 },
  { code: "checked_out", label: "Checked-out", color: "#6b7280", sortOrder: 4, isTerminal: true },
  { code: "no_show", label: "No-show", color: "#dc2626", sortOrder: 5, isTerminal: true },
  { code: "cancelled", label: "Cancelled", color: "#dc2626", sortOrder: 6, isTerminal: true },
];

const PAYMENT_STATUSES = [
  { code: "pending", label: "Pending", color: "#f59e0b", isDefault: true, sortOrder: 1 },
  { code: "partial", label: "Partially Paid", color: "#f59e0b", sortOrder: 2 },
  { code: "paid", label: "Paid", color: "#16a34a", sortOrder: 3, isTerminal: true },
  { code: "refunded", label: "Refunded", color: "#6b7280", sortOrder: 4, isTerminal: true },
  { code: "failed", label: "Failed", color: "#dc2626", sortOrder: 5, isTerminal: true },
];

const PAYMENT_METHODS = [
  { code: "cash", name: "Cash" },
  { code: "upi", name: "UPI" },
  { code: "card", name: "Card" },
  { code: "bank_transfer", name: "Bank Transfer" },
  { code: "other", name: "Other" },
];

// basePrice is back-derived so that base + 5% GST lands on a clean nightly
// rate (e.g. 1524 * 1.05 = 1600.20 -> displayed nightly rate 1600).
const ROOM_TYPES = [
  { name: "Single Bed", basePrice: 1524, capacity: 2, amenities: ["WiFi", "TV", "AC"] },
  { name: "Double Bed", basePrice: 2286, capacity: 3, amenities: ["AC", "WiFi", "TV"] },
  { name: "Family Suite", basePrice: 2857, capacity: 5, amenities: ["AC", "WiFi", "TV", "Mini Fridge"] },
];

// [roomNumber, roomTypeName, floor]
const ROOMS = [
  ...["1001", "1002", "1003", "1004", "1005"].map((n) => [n, "Single Bed", "1"]),
  ...["1006", "1007", "1008", "1009", "1010"].map((n) => [n, "Double Bed", "1"]),
  ["1111", "Family Suite", "1"],
  ...["2001", "2002", "2003", "2004", "2005"].map((n) => [n, "Single Bed", "2"]),
  ...["2006", "2007", "2008", "2009", "2010"].map((n) => [n, "Double Bed", "2"]),
  ["2222", "Family Suite", "2"],
];

const SAMPLE_GUESTS = [
  { name: "R Pandiyan", phone: "9840000001" },
  { name: "Mr Harsha Yuvaraj", phone: "9840000002" },
  { name: "Mr Selvakumar S", phone: "9840000003" },
  { name: "Mr Karthick Mohan", phone: "9840000004" },
  { name: "Mr Elango G", phone: "9840000005" },
  { name: "Mr Niranjan", phone: "9840000006" },
  { name: "Mr Prakash", phone: "9840000007" },
  { name: "Mrs Ramya Perumal", phone: "9840000008" },
  { name: "Mr S Pavithra Lakshmi", phone: "9840000009" },
];

function daysFromNow(days) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

async function main() {
  console.log("Seeding permission catalog...");
  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: permission.code },
      update: { description: permission.description },
      create: permission,
    });
  }

  const tenantName = process.env.SEED_TENANT_NAME ?? "SLN Residency";
  const subdomain = process.env.SEED_TENANT_SUBDOMAIN ?? "sln";
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@sln-residency.test";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";
  const managerEmail = process.env.SEED_MANAGER_EMAIL ?? "manager@sln-residency.test";
  const managerPassword = process.env.SEED_MANAGER_PASSWORD ?? "ChangeMe123!";

  const tenant = await prisma.tenant.upsert({
    where: { subdomain },
    update: {},
    create: { name: tenantName, subdomain },
  });
  console.log(`Tenant ready: ${tenant.name} (${tenant.id})`);

  const allPermissions = await prisma.permission.findMany();
  const permissionIdByCode = new Map(allPermissions.map((p) => [p.code, p.id]));

  async function ensureRole(name, isSystemRole, permissionCodes) {
    const role = await prisma.role.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name } },
      update: {},
      create: { tenantId: tenant.id, name, isSystemRole },
    });

    for (const code of permissionCodes) {
      const permissionId = permissionIdByCode.get(code);
      if (!permissionId) continue;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId } },
        update: {},
        create: { roleId: role.id, permissionId },
      });
    }
    return role;
  }

  const adminRole = await ensureRole("Admin", true, DEFAULT_ADMIN_PERMISSION_CODES);
  const managerRole = await ensureRole("Manager", false, DEFAULT_MANAGER_PERMISSION_CODES);
  await ensureRole("Employee", false, DEFAULT_EMPLOYEE_PERMISSION_CODES);
  console.log("Roles ready: Admin, Manager, Employee");

  const admin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: adminEmail } },
    update: {},
    create: {
      tenantId: tenant.id,
      roleId: adminRole.id,
      name: "Admin",
      email: adminEmail,
      passwordHash: await argon2.hash(adminPassword),
    },
  });
  console.log(`Admin user ready: ${adminEmail} / ${adminPassword} (change this after first login)`);

  // A second login on the Manager role, so the role-based restrictions
  // (e.g. no post-checkout corrections) can be exercised without editing
  // the Admin account.
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: managerEmail } },
    update: {},
    create: {
      tenantId: tenant.id,
      roleId: managerRole.id,
      name: "Manager",
      email: managerEmail,
      passwordHash: await argon2.hash(managerPassword),
    },
  });
  console.log(`Manager user ready: ${managerEmail} / ${managerPassword} (change this after first login)`);

  async function ensureStatuses(domain, statuses) {
    const byCode = new Map();
    for (const status of statuses) {
      const row = await prisma.status.upsert({
        where: { tenantId_domain_code: { tenantId: tenant.id, domain, code: status.code } },
        update: {},
        create: { tenantId: tenant.id, domain, ...status, isSystem: WORKFLOW_STATUS_CODES[domain].includes(status.code) },
      });
      byCode.set(status.code, row);
    }
    return byCode;
  }
  const roomStatuses = await ensureStatuses("room", ROOM_STATUSES);
  const bookingStatuses = await ensureStatuses("booking", BOOKING_STATUSES);
  const paymentStatuses = await ensureStatuses("payment", PAYMENT_STATUSES);
  console.log("Default statuses ready: room, booking, payment");

  const paymentMethods = new Map();
  for (const method of PAYMENT_METHODS) {
    const row = await prisma.paymentMethod.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: method.code } },
      update: {},
      create: { tenantId: tenant.id, ...method },
    });
    paymentMethods.set(method.code, row);
  }
  console.log("Default payment methods ready");

  const existingTaxRule = await prisma.taxRule.findFirst({ where: { tenantId: tenant.id, name: "GST 5%" } });
  if (!existingTaxRule) {
    await prisma.taxRule.create({
      data: { tenantId: tenant.id, name: "GST 5%", ratePercent: 5, effectiveFrom: new Date("2020-01-01") },
    });
  }
  console.log("Default tax rule ready: GST 5%");

  const roomTypeByName = new Map();
  for (const rt of ROOM_TYPES) {
    const row = await prisma.roomType.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: rt.name } },
      update: { basePrice: rt.basePrice, capacity: rt.capacity, amenities: rt.amenities },
      create: { tenantId: tenant.id, ...rt },
    });
    roomTypeByName.set(rt.name, row);
  }
  console.log(`Room types ready: ${ROOM_TYPES.map((r) => r.name).join(", ")}`);

  const roomByNumber = new Map();
  for (const [roomNumber, typeName, floor] of ROOMS) {
    const row = await prisma.room.upsert({
      where: { tenantId_roomNumber: { tenantId: tenant.id, roomNumber } },
      update: {},
      create: {
        tenantId: tenant.id,
        roomTypeId: roomTypeByName.get(typeName).id,
        statusId: roomStatuses.get("available").id,
        roomNumber,
        floor,
      },
    });
    roomByNumber.set(roomNumber, row);
  }
  console.log(`Rooms ready: ${ROOMS.length} rooms across floors 1 and 2`);

  const guestByPhone = new Map();
  for (const g of SAMPLE_GUESTS) {
    const existing = await prisma.guest.findFirst({ where: { tenantId: tenant.id, phone: g.phone } });
    const row = existing ?? (await prisma.guest.create({ data: { tenantId: tenant.id, ...g } }));
    guestByPhone.set(g.phone, row);
  }
  console.log("Sample guests ready");

  // [roomNumber, guestPhone, bookingStatusCode, checkInOffsetDays, nights]
  const SAMPLE_BOOKINGS = [
    ["1001", "9840000002", "checked_in", 0, 1],
    ["1002", "9840000001", "confirmed", 0, 1],
    ["1003", "9840000001", "confirmed", 0, 1],
    ["1004", "9840000002", "confirmed", 0, 1],
    ["1005", "9840000002", "confirmed", 0, 1],
    ["1006", "9840000003", "checked_in", 0, 1],
    ["1007", "9840000004", "checked_in", -1, 3],
    ["1008", "9840000004", "checked_in", 0, 1],
    ["1009", "9840000003", "confirmed", 0, 1],
    ["1010", "9840000005", "checked_in", 0, 1],
    ["1111", "9840000007", "checked_in", 0, 1],
    ["2001", "9840000008", "checked_in", 0, 1],
    ["2002", "9840000008", "checked_in", 0, 1],
    ["2003", "9840000004", "checked_in", 0, 1],
    ["2006", "9840000004", "checked_in", 0, 1],
    ["2007", "9840000004", "checked_in", 0, 1],
    ["2008", "9840000003", "confirmed", 0, 1],
    ["2009", "9840000006", "checked_in", 0, 1],
    ["2010", "9840000009", "checked_in", -1, 3],
    // upcoming reservations layered on top of already-active rooms
    ["1002", "9840000002", "confirmed", 1, 1],
    ["1003", "9840000002", "confirmed", 1, 1],
    ["1004", "9840000002", "confirmed", 1, 1],
    ["1005", "9840000002", "confirmed", 1, 1],
    ["2010", "9840000009", "confirmed", 3, 1],
  ];

  const roomTypeById = new Map([...roomTypeByName.values()].map((rt) => [rt.id, rt]));

  for (const [roomNumber, phone, statusCode, offset, nights] of SAMPLE_BOOKINGS) {
    const room = roomByNumber.get(roomNumber);
    const guest = guestByPhone.get(phone);
    // On a re-run, a room's type may have been reassigned to one created
    // via the UI since — it isn't in this seed's map, so skip the sample
    // booking rather than crash the whole seed at the very last step.
    const roomType = roomTypeById.get(room.roomTypeId);
    if (!roomType) continue;
    const checkIn = daysFromNow(offset);
    const checkOut = daysFromNow(offset + nights);
    const ratePerNight = Number(roomType.basePrice) * 1.05;

    const overlap = await prisma.booking.findFirst({
      where: { tenantId: tenant.id, roomId: room.id, checkIn: { lt: checkOut }, checkOut: { gt: checkIn } },
    });
    if (overlap) continue;

    const booking = await prisma.booking.create({
      data: {
        tenantId: tenant.id,
        roomId: room.id,
        guestId: guest.id,
        statusId: bookingStatuses.get(statusCode).id,
        checkIn,
        checkOut,
        adults: 1,
        children: 0,
        ratePerNight,
        totalAmount: ratePerNight * nights,
        createdById: admin.id,
        ...(statusCode === "checked_in" ? { actualCheckIn: checkIn } : {}),
      },
    });

    if (statusCode === "checked_in") {
      await prisma.room.update({ where: { id: room.id }, data: { statusId: roomStatuses.get("occupied").id } });
      await prisma.payment.create({
        data: {
          tenantId: tenant.id,
          bookingId: booking.id,
          methodId: paymentMethods.get(offset % 2 === 0 ? "cash" : "upi").id,
          statusId: paymentStatuses.get("paid").id,
          amount: ratePerNight,
          recordedById: admin.id,
        },
      });
    }
  }
  console.log("Sample bookings + payments ready");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
