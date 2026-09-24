-- CreateTable
CREATE TABLE "InvoiceTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceTemplate_tenantId_key" ON "InvoiceTemplate"("tenantId");

-- AddForeignKey
ALTER TABLE "InvoiceTemplate" ADD CONSTRAINT "InvoiceTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Register the new permission and grant it to every existing tenant's
-- built-in Admin role. prisma/seed.js only reaches the seed tenant, so
-- without this every other tenant's Admin would never get the code.
INSERT INTO "Permission" ("id", "code", "description")
VALUES (gen_random_uuid()::text, 'invoices.customize', 'Change the printed invoice''s layout, colors, visible fields, and footer wording')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("id", "roleId", "permissionId")
SELECT gen_random_uuid()::text, r."id", p."id"
FROM "Role" r
CROSS JOIN "Permission" p
WHERE r."isSystemRole" = true AND p."code" = 'invoices.customize'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
