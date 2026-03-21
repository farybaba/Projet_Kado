#!/bin/bash
# Script pour re-seeder la DB Railway avec le bon HMAC_VOUCHER_SECRET
# Usage: DATABASE_URL="..." HMAC_VOUCHER_SECRET="..." ./scripts/reseed-railway.sh

set -e

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL manquant"
  echo "Usage: DATABASE_URL='postgres://...' HMAC_VOUCHER_SECRET='...' ./scripts/reseed-railway.sh"
  exit 1
fi

if [ -z "$HMAC_VOUCHER_SECRET" ]; then
  echo "ERROR: HMAC_VOUCHER_SECRET manquant"
  exit 1
fi

echo "→ Migration Railway..."
npx prisma migrate deploy

echo "→ Seed Railway..."
npx prisma db seed

echo "✓ Done. Vouchers régénérés avec HMAC_VOUCHER_SECRET."
