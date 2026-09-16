-- CreateTable
CREATE TABLE "RoomClosure" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomClosure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoomClosure_tenantId_idx" ON "RoomClosure"("tenantId");

-- CreateIndex
CREATE INDEX "RoomClosure_roomId_idx" ON "RoomClosure"("roomId");

-- AddForeignKey
ALTER TABLE "RoomClosure" ADD CONSTRAINT "RoomClosure_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomClosure" ADD CONSTRAINT "RoomClosure_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomClosure" ADD CONSTRAINT "RoomClosure_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
