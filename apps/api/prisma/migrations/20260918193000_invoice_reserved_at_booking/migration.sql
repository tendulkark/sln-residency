-- Invoice numbers are now reserved at booking creation, not checkout.
-- isFinalized distinguishes a reserved-but-not-yet-final invoice from a
-- real, legally final one. Every invoice that exists before this migration
-- was created the old way (at checkout, with final figures already
-- computed), so it's backfilled to isFinalized = true; the column default
-- of false only applies going forward, to freshly reserved invoices.

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "isFinalized" BOOLEAN NOT NULL DEFAULT false;

-- Backfill existing rows
UPDATE "Invoice" SET "isFinalized" = true;
