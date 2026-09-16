import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";
import {
  PERMISSIONS,
  DEFAULT_ADMIN_PERMISSION_CODES,
  DEFAULT_EMPLOYEE_PERMISSION_CODES,
} from "@sln/shared-schemas";

const prisma = new PrismaClient();

const ROOM_STATUSES = [
  { code: "available", label: "Available", color: "#16a34a", isDefault: true, sortOrder: 1 },
  { code: "occupied", label: "Occupied", color: "#dc2626", sortOrder: 2 },
  { code: "cleaning", label: "Under Cleaning", color: "#f59e0b", sortOrder: 3 },
  { code: "maintenance", label: "Maintenance", color: "#6b7280", sortOrder: 4, isTerminal: false },
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
  await ensureRole("Employee", false, DEFAULT_EMPLOYEE_PERMISSION_CODES);
  console.log("Roles ready: Admin, Employee");

  await prisma.user.upsert({
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

  async function ensureStatuses(domain, statuses) {
    for (const status of statuses) {
      await prisma.status.upsert({
        where: { tenantId_domain_code: { tenantId: tenant.id, domain, code: status.code } },
        update: {},
        create: { tenantId: tenant.id, domain, ...status },
      });
    }
  }
  await ensureStatuses("room", ROOM_STATUSES);
  await ensureStatuses("booking", BOOKING_STATUSES);
  await ensureStatuses("payment", PAYMENT_STATUSES);
  console.log("Default statuses ready: room, booking, payment");

  for (const method of PAYMENT_METHODS) {
    await prisma.paymentMethod.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: method.code } },
      update: {},
      create: { tenantId: tenant.id, ...method },
    });
  }
  console.log("Default payment methods ready");

  const roomType = await prisma.roomType.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: "Standard" } },
    update: {},
    create: { tenantId: tenant.id, name: "Standard", basePrice: 1500, capacity: 2 },
  });

  const availableStatus = await prisma.status.findUniqueOrThrow({
    where: { tenantId_domain_code: { tenantId: tenant.id, domain: "room", code: "available" } },
  });

  const sampleRoomNumbers = ["101", "102", "103", "104"];
  for (const roomNumber of sampleRoomNumbers) {
    await prisma.room.upsert({
      where: { tenantId_roomNumber: { tenantId: tenant.id, roomNumber } },
      update: {},
      create: {
        tenantId: tenant.id,
        roomTypeId: roomType.id,
        statusId: availableStatus.id,
        roomNumber,
        floor: "1",
      },
    });
  }
  console.log(`Sample rooms ready: ${sampleRoomNumbers.join(", ")}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
