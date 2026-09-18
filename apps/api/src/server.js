import "dotenv/config";
import { buildApp } from "#src/app.js";
import { env } from "#src/config/env.js";

const fastify = await buildApp();

try {
  await fastify.listen({ port: env.port, host: "0.0.0.0" });
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
