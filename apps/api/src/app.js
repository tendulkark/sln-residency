import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import { env } from "./config/env.js";
import prismaPlugin from "./plugins/prisma.js";
import authPlugin from "./plugins/auth.js";
import authRoutes from "./routes/auth.routes.js";
import roomsRoutes from "./routes/rooms.routes.js";
import roomTypesRoutes from "./routes/roomtypes.routes.js";
import roomClosuresRoutes from "./routes/room-closures.routes.js";
import statusesRoutes from "./routes/statuses.routes.js";
import guestsRoutes from "./routes/guests.routes.js";
import bookingsRoutes from "./routes/bookings.routes.js";
import paymentsRoutes from "./routes/payments.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";

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

  fastify.get("/health", async () => ({ ok: true }));

  return fastify;
}
