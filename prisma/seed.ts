import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

const NOMINAL_VALUE = 2_500_000; // 25 000 FCFA en centimes

function buildQrData(code: string, companyId: string, secret: string): string {
  const ts = Date.now();
  // innerPayload = chaîne signée — DOIT correspondre exactement à ce que verifyQrSignature recompute
  const innerPayload = JSON.stringify({ code, companyId, ts });
  const sig = crypto.createHmac('sha256', secret).update(innerPayload).digest('hex');
  // qrData stocké en DB et affiché dans le QR — contient toutes les données + sig
  return JSON.stringify({ code, companyId, ts, sig });
}

async function main() {
  console.log('Seeding Kado...\n');

  const hmacSecret =
    process.env.HMAC_VOUCHER_SECRET ?? 'dev_secret_32bytes_change_me_00000';

  // ─── 1. Entreprise ─────────────────────────────────────────────────────────
  const company = await prisma.company.upsert({
    where: { siren: 'SN-SONATEL-001' },
    update: { name: 'Sonatel SA', status: 'ACTIVE' },
    create: {
      name: 'Sonatel SA',
      siren: 'SN-SONATEL-001',
      status: 'ACTIVE',
      plan: 'PREMIUM',
      email: 'rh@sonatel.sn',
      phone: '+221338390000',
      provisionBalance: 500_000_000,
    },
  });
  console.log(`  Entreprise   : ${company.name} (${company.id})`);

  // ─── 2. Commerçant ─────────────────────────────────────────────────────────
  const merchant = await prisma.merchant.upsert({
    where: { phone: '+221770000001' },
    update: { name: 'Superette Chez Moussa', status: 'ACTIVE' },
    create: {
      name: 'Superette Chez Moussa',
      phone: '+221770000001',
      category: 'GENERAL',
      status: 'ACTIVE',
      address: 'Dakar, Plateau',
      wavePhone: '+221770000001',
    },
  });
  console.log(`  Commerçant   : ${merchant.name} (${merchant.id})`);

  // ─── 3. Utilisateur marchand (+221770000001) ───────────────────────────────
  // Compte de test pour le POS — se connecte via OTP
  const merchantUser = await prisma.user.upsert({
    where: { phone: '+221770000001' },
    update: { merchantId: merchant.id, firstName: 'Aminata', lastName: 'Ndiaye' },
    create: {
      phone: '+221770000001',
      firstName: 'Aminata',
      lastName: 'Ndiaye',
      role: 'MERCHANT',
      merchantId: merchant.id,
    },
  });
  console.log(`  Utilisateur marchand : ${merchantUser.phone} → merchantId=${merchant.id}`);

  // ─── 4. Utilisateur RH Sonatel (+221760000001) ────────────────────────────
  const hrUser = await prisma.user.upsert({
    where: { phone: '+221760000001' },
    update: { companyId: company.id, firstName: 'Fatou', lastName: 'Sarr' },
    create: {
      phone: '+221760000001',
      firstName: 'Fatou',
      lastName: 'Sarr',
      role: 'COMPANY_ADMIN',
      companyId: company.id,
    },
  });
  console.log(`  Utilisateur RH       : ${hrUser.phone} → companyId=${company.id}`);

  // ─── 5b. Administrateur Kado (+221700000000) ──────────────────────────────
  const adminUser = await prisma.user.upsert({
    where: { phone: '+221700000000' },
    update: { firstName: 'Admin', lastName: 'Kado', role: 'ADMIN' },
    create: {
      phone: '+221700000000',
      firstName: 'Admin',
      lastName: 'Kado',
      role: 'ADMIN',
    },
  });
  console.log(`  Administrateur       : ${adminUser.phone} — role ADMIN`);

  // ─── 6. Bénéficiaire ───────────────────────────────────────────────────────
  const beneficiary = await prisma.user.upsert({
    where: { phone: '+221771234567' },
    update: { firstName: 'Moussa', lastName: 'Diop' },
    create: {
      phone: '+221771234567',
      firstName: 'Moussa',
      lastName: 'Diop',
      role: 'BENEFICIARY',
    },
  });
  console.log(`  Bénéficiaire : ${beneficiary.firstName} ${beneficiary.lastName} — ${beneficiary.phone}`);

  // ─── 5. Bon 25 000 FCFA en statut ISSUED ──────────────────────────────────
  const existingVoucher = await prisma.voucher.findFirst({
    where: { beneficiaryPhone: '+221771234567', companyId: company.id, status: 'ISSUED' },
  });

  if (existingVoucher) {
    // Regénère le qrData avec le bon secret (format corrigé)
    const qrData = buildQrData(existingVoucher.code, company.id, hmacSecret);
    await prisma.voucher.update({
      where: { id: existingVoucher.id },
      data: { qrData },
    });
    console.log(`  Bon          : qrData régénéré (${existingVoucher.id})`);
  } else {
    const code = crypto.randomUUID();
    const qrData = buildQrData(code, company.id, hmacSecret);

    const voucher = await prisma.voucher.create({
      data: {
        code,
        qrData,
        nominalValue: NOMINAL_VALUE,
        remainingValue: NOMINAL_VALUE,
        status: 'ISSUED',
        type: 'GIFT_VOUCHER',
        companyId: company.id,
        beneficiaryPhone: '+221771234567',
        beneficiaryId: beneficiary.id,
        expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
        emeConfirmedAt: new Date(),
        note: 'Bon cadeau Sonatel — Bienvenue',
      },
    });

    await prisma.ledgerEntry.create({
      data: {
        type: 'ISSUE',
        debitAccount: `PROVISION_COMPANY:${company.id}`,
        creditAccount: `VOUCHER_LIABILITY:${voucher.id}`,
        amount: NOMINAL_VALUE,
        voucherId: voucher.id,
        companyId: company.id,
        reference: crypto.randomUUID(),
      },
    });

    console.log(`  Bon          : 25 000 FCFA — statut ISSUED (${voucher.id})`);
  }

  // ─── Résumé ────────────────────────────────────────────────────────────────
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  COMPTES DE TEST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Bénéficiaire
    URL    : http://localhost:3000/app/login
    Numéro : +221771234567

  Marchand (POS)
    URL    : http://localhost:3000/pos/login
    Numéro : +221770000001

  RH Entreprise (Dashboard)
    URL    : http://localhost:3000/dashboard
    Numéro : +221760000001

  Administrateur Kado
    URL    : http://localhost:3000/admin
    Numéro : +221700000000
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
