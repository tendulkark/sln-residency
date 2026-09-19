-- Invoice cancel + reissue: a wrong invoice is never edited or hard-deleted
-- (AI_RULES.md #4), it's cancelled (kept, number never reused) and a new
-- invoice is generated in its place. Replaces the old "exactly one invoice
-- per booking, ever" constraint with "at most one *active* invoice per
-- booking", enforced by a partial unique index (not expressible in
-- schema.prisma's DSL, so it lives only here).

-- DropIndex
DROP INDEX "Invoice_bookingId_key";

-- AlterTable
ALTER TABLE "Invoice"
  ADD COLUMN "isCancelled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancelledById" TEXT,
  ADD COLUMN "cancellationReason" TEXT,
  ADD COLUMN "supersedesInvoiceId" TEXT;

-- CreateIndex
CREATE INDEX "Invoice_bookingId_idx" ON "Invoice"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_bookingId_active_key" ON "Invoice"("bookingId") WHERE "isCancelled" = false;

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_supersedesInvoiceId_key" ON "Invoice"("supersedesInvoiceId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_supersedesInvoiceId_fkey" FOREIGN KEY ("supersedesInvoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
