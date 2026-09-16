import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import { env } from "./config/env.js";
import prismaPlugin from "./plugins/prisma.js";
import authPlugin from "./plugins/auth.js";
import authRoutes from "./routes/auth.routes.js";
import roomsRoutes from "./routes/rooms.routes.js";
import statusesRoutes from "./routes/statuses.routes.js";

export async function buildApp() {
  const fastify = Fastify({ logger: true });

  await fastify.register(cors, { origin: env.webOrigin, credentials: true });
  await fastify.register(cookie);
  await fastify.register(prismaPlugin);
  await fastify.register(authPlugin);

  await fastify.register(authRoutes);
  await fastify.register(roomsRoutes);
  await fastify.register(statusesRoutes);

  fastify.get("/health", async () => ({ ok: true }));

  return fastify;
}
