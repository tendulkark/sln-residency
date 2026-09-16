// Writes an AuditLog row. Call this from any route that creates, edits, or
// changes the status of business data (AI_RULES.md #9).
export async function recordAudit(prisma, { tenantId, userId, action, entityType, entityId, metadata }) {
  await prisma.auditLog.create({
    data: { tenantId, userId, action, entityType, entityId, metadata },
  });
}
