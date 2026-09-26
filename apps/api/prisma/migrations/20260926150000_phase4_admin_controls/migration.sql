-- Phase 4 admin controls: status editor, payment-method editor, audit log.

-- AlterTable
ALTER TABLE "Status" ADD COLUMN "isSystem" BOOLEAN NOT NULL DEFAULT false;

-- The statuses every tenant was seeded with are the ones the app's workflow
-- looks up by code (WORKFLOW_STATUS_CODES in packages/shared-schemas/src/
-- status.js) — lock them so the new editor can't rename or delete them.
UPDATE "Status" SET "isSystem" = true
WHERE ("domain", "code") IN (
  ('room', 'available'), ('room', 'occupied'), ('room', 'dirty'), ('room', 'cleaning'), ('room', 'maintenance'),
  ('booking', 'pending'), ('booking', 'confirmed'), ('booking', 'checked_in'), ('booking', 'checked_out'),
  ('booking', 'no_show'), ('booking', 'cancelled'),
  ('payment', 'pending'), ('payment', 'partial'), ('payment', 'paid'), ('payment', 'refunded'), ('payment', 'failed')
);

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");

-- New catalog permission for the Payment methods editor. Granted up front to
-- every role that can already manage the hotel's settings, so nobody who
-- could reach hotel configuration before this migration loses a screen.
INSERT INTO "Permission" ("id", "code", "description")
VALUES (gen_random_uuid()::text, 'paymentmethods.manage', 'Add, rename and switch off payment methods')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("id", "roleId", "permissionId")
SELECT gen_random_uuid()::text, holders."roleId", p."id"
FROM (
  SELECT DISTINCT rp."roleId"
  FROM "RolePermission" rp
  JOIN "Permission" sp ON sp."id" = rp."permissionId" AND sp."code" = 'settings.manage'
) holders
CROSS JOIN "Permission" p
WHERE p."code" = 'paymentmethods.manage'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- The built-in Admin role always holds every permission (enforced at
-- runtime in lib/permissions.js); keep its rows complete too so the data
-- never disagrees with what the app does.
INSERT INTO "RolePermission" ("id", "roleId", "permissionId")
SELECT gen_random_uuid()::text, r."id", p."id"
FROM "Role" r
CROSS JOIN "Permission" p
WHERE r."isSystemRole" = true
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
