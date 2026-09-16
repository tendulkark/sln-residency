const VALID_DOMAINS = new Set(["room", "booking", "payment"]);

export default async function statusesRoutes(fastify) {
  // Read-only lookup used to populate status dropdowns/badges. Any
  // authenticated staff member may read these; only statuses.manage can
  // create/edit/delete them (added in a later phase).
  fastify.get("/statuses", { preHandler: fastify.authenticate }, async (request, reply) => {
    const { domain } = request.query;
    if (domain && !VALID_DOMAINS.has(domain)) {
      return reply.code(400).send({ error: `domain must be one of ${[...VALID_DOMAINS].join(", ")}` });
    }

    return fastify.prisma.status.findMany({
      where: { tenantId: request.user.tenantId, ...(domain ? { domain } : {}) },
      orderBy: [{ domain: "asc" }, { sortOrder: "asc" }],
    });
  });
}
