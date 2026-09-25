-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "snapshot" JSONB;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'payment';
