import { taxRuleSchema, taxRuleUpdateSchema } from "@sln/shared-schemas";
import { requirePermission } from "#src/lib/permissions.js";
import { recordAudit } from "#src/lib/audit.js";

// GST slabs for the room tariff (AI_RULES.md #1/#4 — rates live here, never
// in code). lib/tax.js picks the rule for a stay; this is where an Admin
// maintains them. Two guarantees this file keeps:
//   1. At most one active rule can match any tariff on any date — slabs
//      that overlap in both amount and dates are refused, so which rule
//      bills a stay is never a coin toss.
//   2. A rule that has billed a finalized invoice keeps its rate, slab and
//      start date forever (product decision 2026-09-26). The invoice itself
//      snapshots its figures regardless; this keeps the rule record honest
//      about what it charged. A new rate means end-dating this rule and
//      adding a new one.

const LOCKED_WHEN_USED = ["ratePercent", "appliesAboveAmount", "appliesBelowAmount", "effectiveFrom"];

// Whole days in the hotel's timezone (the server runs in it — see the
// deployment notes on TZ): a rule starts at the first instant of its start
// date and runs through the last instant of its end date.
function startOfDay(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}
function endOfDay(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999);
}

function toData(input) {
  const data = { ...input };
  if ("effectiveFrom" in input) data.effectiveFrom = startOfDay(input.effectiveFrom);
  if ("effectiveTo" in input) data.effectiveTo = input.effectiveTo ? endOfDay(input.effectiveTo) : null;
  return data;
}

const num = (v) => (v == null ? null : Number(v));

// Do two rules both match some tariff on some date? Slabs are half-open
// (above, upTo]; a missing bound is open-ended.
function rulesOverlap(a, b) {
  const aTo = a.effectiveTo?.getTime() ?? Infinity;
  const bTo = b.effectiveTo?.getTime() ?? Infinity;
  const datesOverlap = a.effectiveFrom.getTime() <= bTo && b.effectiveFrom.getTime() <= aTo;
  if (!datesOverlap) return false;
  const lo = Math.max(num(a.appliesAboveAmount) ?? -Infinity, num(b.appliesAboveAmount) ?? -Infinity);
  const hi = Math.min(num(a.appliesBelowAmount) ?? Infinity, num(b.appliesBelowAmount) ?? Infinity);
  return lo < hi;
}

async function findOverlap(prisma, tenantId, candidate, excludeId) {
  if (candidate.isActive === false) return null;
  const others = await prisma.taxRule.findMany({ where: { tenantId, isActive: true, ...(excludeId ? { id: { not: excludeId } } : {}) } });
  return others.find((other) => rulesOverlap(candidate, other)) ?? null;
}

function overlapError(other) {
  return `This overlaps “${other.name}” — two active rules can't cover the same tariff on the same dates. End-date or narrow one of them first.`;
}

async function usageFor(prisma, tenantId, ruleIds) {
  const [finalized, all, lastUse] = await Promise.all([
    prisma.invoice.groupBy({ by: ["taxRuleId"], where: { tenantId, taxRuleId: { in: ruleIds }, isFinalized: true }, _count: { _all: true } }),
    prisma.invoice.groupBy({ by: ["taxRuleId"], where: { tenantId, taxRuleId: { in: ruleIds } }, _count: { _all: true } }),
    prisma.invoice.groupBy({ by: ["taxRuleId"], where: { tenantId, taxRuleId: { in: ruleIds }, isFinalized: true }, _max: { generatedAt: true } }),
  ]);
  const byId = new Map(ruleIds.map((id) => [id, { finalizedCount: 0, invoiceCount: 0, lastFinalizedAt: null }]));
  for (const row of finalized) byId.get(row.taxRuleId).finalizedCount = row._count._all;
  for (const row of all) byId.get(row.taxRuleId).invoiceCount = row._count._all;
  for (const row of lastUse) byId.get(row.taxRuleId).lastFinalizedAt = row._max.generatedAt;
  return byId;
}

function serialize(rule, usage) {
  return {
    ...rule,
    ratePercent: Number(rule.ratePercent),
    appliesAboveAmount: num(rule.appliesAboveAmount),
    appliesBelowAmount: num(rule.appliesBelowAmount),
    ...usage,
    isLocked: usage.finalizedCount > 0,
  };
}

export default async function taxRulesRoutes(fastify) {
  const guard = { preHandler: [fastify.authenticate, requirePermission("taxrules.manage")] };

  fastify.get("/tax-rules", guard, async (request) => {
    const tenantId = request.user.tenantId;
    const rules = await fastify.prisma.taxRule.findMany({
      where: { tenantId },
      orderBy: [{ effectiveFrom: "desc" }, { appliesAboveAmount: { sort: "asc", nulls: "first" } }],
    });
    const usage = await usageFor(fastify.prisma, tenantId, rules.map((r) => r.id));
    return rules.map((r) => serialize(r, usage.get(r.id)));
  });

  fastify.post("/tax-rules", guard, async (request, reply) => {
    const parsed = taxRuleSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
    const tenantId = request.user.tenantId;
    const data = toData(parsed.data);

    const overlap = await findOverlap(fastify.prisma, tenantId, { isActive: true, ...data });
    if (overlap) return reply.code(409).send({ error: overlapError(overlap) });

    const rule = await fastify.prisma.taxRule.create({ data: { tenantId, ...data } });

    await recordAudit(fastify.prisma, {
      tenantId,
      userId: request.user.id,
      action: "taxrule.create",
      entityType: "TaxRule",
      entityId: rule.id,
      metadata: parsed.data,
    });

    return reply.code(201).send(serialize(rule, { finalizedCount: 0, invoiceCount: 0, lastFinalizedAt: null }));
  });

  fastify.patch("/tax-rules/:id", guard, async (request, reply) => {
    const parsed = taxRuleUpdateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
    const tenantId = request.user.tenantId;

    const existing = await fastify.prisma.taxRule.findFirst({ where: { id: request.params.id, tenantId } });
    if (!existing) return reply.code(404).send({ error: "Tax rule not found" });
    const usage = (await usageFor(fastify.prisma, tenantId, [existing.id])).get(existing.id);
    const data = toData(parsed.data);
    // A form re-sends every field; leave a date that names the same day
    // untouched rather than shifting it to a different instant of that day.
    for (const key of ["effectiveFrom", "effectiveTo"]) {
      if (data[key] && existing[key] && data[key].toDateString() === existing[key].toDateString()) delete data[key];
    }

    if (usage.finalizedCount > 0) {
      const changed = LOCKED_WHEN_USED.filter((key) => {
        if (!(key in data)) return false;
        const before = existing[key];
        const after = data[key];
        // Compared as calendar days: rules seeded before this screen existed
        // may start at some other instant of their start date.
        if (before instanceof Date) return before.toDateString() !== after.toDateString();
        return num(after) !== num(before);
      });
      if (changed.length > 0) {
        return reply.code(409).send({
          error: `This rule has billed ${usage.finalizedCount} finalized invoice(s), so its rate, slab and start date are locked. End-date it and add a new rule for the new rate.`,
        });
      }
      // It can't be made to end before an invoice it already billed.
      if (data.effectiveTo && usage.lastFinalizedAt && data.effectiveTo < usage.lastFinalizedAt) {
        return reply.code(409).send({
          error: `This rule billed an invoice on ${usage.lastFinalizedAt.toLocaleDateString("en-IN", { dateStyle: "medium" })}, so it can't end before that date.`,
        });
      }
    }

    const merged = { ...existing, ...data };
    if (merged.effectiveTo && merged.effectiveTo < merged.effectiveFrom) {
      return reply.code(400).send({ error: "End date can't be before the start date" });
    }
    if (merged.appliesAboveAmount != null && merged.appliesBelowAmount != null && num(merged.appliesBelowAmount) <= num(merged.appliesAboveAmount)) {
      return reply.code(400).send({ error: "“Up to” must be more than “above”" });
    }
    const overlap = await findOverlap(fastify.prisma, tenantId, merged, existing.id);
    if (overlap) return reply.code(409).send({ error: overlapError(overlap) });

    const rule = await fastify.prisma.taxRule.update({ where: { id: existing.id }, data });

    await recordAudit(fastify.prisma, {
      tenantId,
      userId: request.user.id,
      action: "taxrule.update",
      entityType: "TaxRule",
      entityId: rule.id,
      metadata: {
        before: {
          name: existing.name,
          ratePercent: Number(existing.ratePercent),
          hsnSacCode: existing.hsnSacCode,
          appliesAboveAmount: num(existing.appliesAboveAmount),
          appliesBelowAmount: num(existing.appliesBelowAmount),
          effectiveFrom: existing.effectiveFrom,
          effectiveTo: existing.effectiveTo,
          isActive: existing.isActive,
        },
        after: parsed.data,
      },
    });

    return serialize(rule, usage);
  });

  // Only a rule no invoice (not even a reserved one) points at can be
  // deleted — a typo caught straight away. Anything else is end-dated or
  // switched off, so the history of which rule billed what stays intact.
  fastify.delete("/tax-rules/:id", guard, async (request, reply) => {
    const tenantId = request.user.tenantId;
    const existing = await fastify.prisma.taxRule.findFirst({ where: { id: request.params.id, tenantId } });
    if (!existing) return reply.code(404).send({ error: "Tax rule not found" });

    const invoiceCount = await fastify.prisma.invoice.count({ where: { tenantId, taxRuleId: existing.id } });
    if (invoiceCount > 0) {
      return reply.code(409).send({ error: "Invoices already use this rule — end-date it or switch it off instead" });
    }

    await fastify.prisma.taxRule.delete({ where: { id: existing.id } });

    await recordAudit(fastify.prisma, {
      tenantId,
      userId: request.user.id,
      action: "taxrule.delete",
      entityType: "TaxRule",
      entityId: existing.id,
      metadata: { name: existing.name, ratePercent: Number(existing.ratePercent) },
    });

    return { ok: true };
  });
}
