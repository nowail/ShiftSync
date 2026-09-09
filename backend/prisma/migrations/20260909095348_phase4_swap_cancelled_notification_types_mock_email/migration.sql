-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'overtime_warning';
ALTER TYPE "NotificationType" ADD VALUE 'availability_changed';

-- AlterEnum
ALTER TYPE "SwapStage" ADD VALUE 'cancelled';

-- CreateTable
CREATE TABLE "MockEmailOutbox" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MockEmailOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MockEmailOutbox_userId_idx" ON "MockEmailOutbox"("userId");

-- AddForeignKey
ALTER TABLE "MockEmailOutbox" ADD CONSTRAINT "MockEmailOutbox_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
