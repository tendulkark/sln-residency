import fp from "fastify-plugin";
import { PrismaClient } from "@prisma/client";

export default fp(async function prismaPlugin(fastify) {
  const prisma = new PrismaClient();
  await prisma.$connect();

  fastify.decorate("prisma", prisma);

  fastify.addHook("onClose", async (instance) => {
    await instance.prisma.$disconnect();
  });
});
