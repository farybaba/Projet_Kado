-- CreateEnum
CREATE TYPE "WebhookProvider" AS ENUM ('WAVE', 'ORANGE_MONEY');

-- CreateEnum
CREATE TYPE "WebhookStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'FAILED');

-- CreateTable
CREATE TABLE "webhook_logs" (
    "id" TEXT NOT NULL,
    "provider" "WebhookProvider" NOT NULL,
    "reference" TEXT NOT NULL,
    "rawBody" TEXT NOT NULL,
    "status" "WebhookStatus" NOT NULL DEFAULT 'RECEIVED',
    "amount" INTEGER,
    "merchantId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "webhook_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "webhook_logs_reference_key" ON "webhook_logs"("reference");

-- CreateIndex
CREATE INDEX "webhook_logs_status_receivedAt_idx" ON "webhook_logs"("status", "receivedAt");

-- CreateIndex
CREATE INDEX "webhook_logs_provider_receivedAt_idx" ON "webhook_logs"("provider", "receivedAt");

-- AddForeignKey
ALTER TABLE "webhook_logs" ADD CONSTRAINT "webhook_logs_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
