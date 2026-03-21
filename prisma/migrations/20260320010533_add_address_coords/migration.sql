-- AlterTable
ALTER TABLE "flash_offers" ADD COLUMN     "address" TEXT;

-- AlterTable
ALTER TABLE "merchants" ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;
