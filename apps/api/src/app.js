import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import { env } from "#src/config/env.js";
import prismaPlugin from "#src/plugins/prisma.js";
import authPlugin from "#src/plugins/auth.js";
import authRoutes from "#src/routes/auth.routes.js";
import roomsRoutes from "#src/routes/rooms.routes.js";
import roomTypesRoutes from "#src/routes/roomtypes.routes.js";
import roomClosuresRoutes from "#src/routes/room-closures.routes.js";
import statusesRoutes from "#src/routes/statuses.routes.js";
import guestsRoutes from "#src/routes/guests.routes.js";
import bookingsRoutes from "#src/routes/bookings.routes.js";
import paymentsRoutes from "#src/routes/payments.routes.js";
import dashboardRoutes from "#src/routes/dashboard.routes.js";
import invoicesRoutes from "#src/routes/invoices.routes.js";
import tenantRoutes from "#src/routes/tenant.routes.js";
import reportsRoutes from "#src/routes/reports.routes.js";
import usersRoutes from "#src/routes/users.routes.js";
import rolesRoutes from "#src/routes/roles.routes.js";
import invoiceTemplateRoutes from "#src/routes/invoice-template.routes.js";
import paymentMethodsRoutes from "#src/routes/payment-methods.routes.js";
import taxRulesRoutes from "#src/routes/tax-rules.routes.js";
import auditLogsRoutes from "#src/routes/audit-logs.routes.js";

export async function buildApp() {
  const fastify = Fastify({ logger: true });

  await fastify.register(cors, { origin: env.webOrigin, credentials: true });
  await fastify.register(cookie);
  await fastify.register(prismaPlugin);
  await fastify.register(authPlugin);

  await fastify.register(authRoutes);
  await fastify.register(roomsRoutes);
  await fastify.register(roomTypesRoutes);
  await fastify.register(roomClosuresRoutes);
  await fastify.register(statusesRoutes);
  await fastify.register(guestsRoutes);
  await fastify.register(bookingsRoutes);
  await fastify.register(paymentsRoutes);
  await fastify.register(dashboardRoutes);
  await fastify.register(invoicesRoutes);
  await fastify.register(tenantRoutes);
  await fastify.register(reportsRoutes);
  await fastify.register(usersRoutes);
  await fastify.register(rolesRoutes);
  await fastify.register(invoiceTemplateRoutes);
  await fastify.register(paymentMethodsRoutes);
  await fastify.register(taxRulesRoutes);
  await fastify.register(auditLogsRoutes);

  fastify.get("/health", async () => ({ ok: true }));

  return fastify;
}
