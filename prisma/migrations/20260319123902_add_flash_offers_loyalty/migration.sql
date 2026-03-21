-- CreateTable
CREATE TABLE "flash_offers" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "discountPct" INTEGER NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "radius" INTEGER NOT NULL DEFAULT 5000,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flash_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_cards" (
    "id" TEXT NOT NULL,
    "beneficiaryId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "totalSpent" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loyalty_cards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "flash_offers_isActive_validUntil_idx" ON "flash_offers"("isActive", "validUntil");

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_cards_beneficiaryId_merchantId_key" ON "loyalty_cards"("beneficiaryId", "merchantId");

-- AddForeignKey
ALTER TABLE "flash_offers" ADD CONSTRAINT "flash_offers_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_cards" ADD CONSTRAINT "loyalty_cards_beneficiaryId_fkey" FOREIGN KEY ("beneficiaryId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_cards" ADD CONSTRAINT "loyalty_cards_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
