# Kado — Contexte projet pour Claude Code

## Identité du projet
**Kado** est une plateforme PWA de chèques cadeaux digitaux pour le Sénégal et l'UEMOA.
- **Tagline** : Le cadeau, digitalisé.
- **Domaines** : kado.sn · kado.app · kado.africa
- **Stack** : NestJS 10 (API) + Next.js 15 (Web) + PostgreSQL 16 + Redis 7 + Prisma 5
- **Casse officielle** : KaDo (K et D majuscules — toujours)

---

## Architecture monorepo

```
kado/
├── apps/
│   ├── web/                        # Next.js 15 — App Router
│   │   ├── app/(beneficiary)/      # /app — bénéficiaire
│   │   ├── app/(company)/          # /dashboard — RH entreprise
│   │   └── app/(merchant)/         # /pos — terminal commerçant
│   └── api/                        # NestJS
│       └── src/modules/
│           ├── auth/               # OTP · JWT RS256 · Guards
│           ├── vouchers/           # Cycle de vie des bons
│           ├── ledger/             # Double-entry · immuable
│           ├── payments/           # Wave · OM · webhooks
│           ├── merchants/          # Commerçants · POS · multi-vendeurs
│           ├── companies/          # Entreprises · dashboard RH
│           ├── users/              # Bénéficiaires · profils
│           └── notifications/      # SMS Nexah · email · queues Bull
├── packages/
│   └── shared/                     # Types TS · DTOs · validateurs communs
├── prisma/
│   ├── schema.prisma               # Schéma DB complet
│   └── migrations/                 # Migrations versionnées
└── docker-compose.yml              # PostgreSQL 16 + Redis 7 en local
```

---

## RÈGLES ABSOLUES — ne jamais violer

1. **Montants TOUJOURS en centimes FCFA (Int)** — JAMAIS de Float, jamais de Number JS pour les montants. 10 000 FCFA = 1_000_000 centimes.
2. **LedgerModule : INSERT ONLY** — aucun UPDATE ni DELETE sur les entrées du ledger après création.
3. **Validation QR : transaction Prisma atomique avec SELECT FOR UPDATE** — zéro race condition tolérée.
4. **Instructions de paiement EME via queue Bull asynchrone** — jamais d'appel synchrone à l'API Wave ou OM.
5. **Secrets : 100% en variables d'environnement** — zéro hardcode dans le code source ou les commits.
6. **QR offline : Service Worker met en cache les QR des bons actifs** — MUST HAVE, non optionnel.
7. **Pour toute opération ledger : SUM(débit) = SUM(crédit)** — invariant absolu.
8. **TypeScript strict** — `"strict": true` dans tsconfig. Zéro `any` implicite.
9. **Tests unitaires obligatoires pour toute logique financière** — avant de merger.
10. **Affichage des montants** : toujours `amount / 100` pour convertir centimes → FCFA affiché.

---

## Schéma Prisma — modèles principaux

### Enums
```prisma
enum UserRole { BENEFICIARY MERCHANT COMPANY_ADMIN COMPANY_VIEWER ADMIN }
enum VoucherStatus { PENDING ISSUED PARTIAL USED EXPIRED CANCELLED }
enum VoucherType { GIFT_VOUCHER MEAL_TICKET TRANSPORT BONUS }
enum CompanyStatus { PENDING_KYB ACTIVE SUSPENDED }
enum MerchantStatus { PENDING ACTIVE SUSPENDED }
enum MerchantCategory { GENERAL FOOD MOBILITY HEALTH RETAIL EDUCATION }
enum SaaSPlan { STANDARD PREMIUM }
enum InvitationStatus { PENDING ACCEPTED EXPIRED }
enum LedgerEntryType { ISSUE REDEEM PARTIAL_REDEEM EXPIRE CANCEL SETTLE SAAS_REVENUE PROVISION }
```

### User
```prisma
model User {
  id           String    @id @default(uuid())
  phone        String?   @unique
  email        String?   @unique
  passwordHash String?
  firstName    String?
  lastName     String?
  role         UserRole
  companyId    String?
  merchantId   String?
  isActive     Boolean   @default(true)
  lastLoginAt  DateTime?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
}
```

### Voucher
```prisma
model Voucher {
  id               String        @id @default(uuid())
  code             String        @unique  // UUID QR — différent de id
  qrData           String        // JSON signé HMAC-SHA256
  nominalValue     Int           // centimes FCFA — JAMAIS Float
  remainingValue   Int           // centimes FCFA
  status           VoucherStatus
  type             VoucherType   @default(GIFT_VOUCHER)
  companyId        String
  beneficiaryPhone String
  beneficiaryId    String?
  expiresAt        DateTime      // défaut J+180
  scheduledAt      DateTime?     // émission programmée à date
  emeConfirmedAt   DateTime?     // null = PENDING, renseigné = ISSUED actif
  note             String?       // message RH max 200 car.
  issuedAt         DateTime      @default(now())
  lastUsedAt       DateTime?
  createdAt        DateTime      @default(now())
}
```

### LedgerEntry — INSERT ONLY
```prisma
model LedgerEntry {
  id            String          @id @default(uuid())
  type          LedgerEntryType
  debitAccount  String          // ex: PROVISION_COMPANY:uuid
  creditAccount String          // ex: VOUCHER_LIABILITY:uuid
  amount        Int             // centimes FCFA — toujours positif
  voucherId     String?
  merchantId    String?
  companyId     String?
  userId        String?
  reference     String          @unique  // clé d'idempotence UUID
  metadata      Json?
  createdAt     DateTime        @default(now())
  // PAS de updatedAt — INSERT ONLY
}
```

### Invitation (onboarding collaborateur)
```prisma
model Invitation {
  id          String           @id @default(uuid())
  token       String           @unique  // UUID signé, TTL 7 jours
  phone       String?
  email       String?
  firstName   String?
  lastName    String?
  poste       String?
  departement String?
  companyId   String
  status      InvitationStatus @default(PENDING)
  expiresAt   DateTime         // @default(now() + 7 days)
  acceptedAt  DateTime?
  createdAt   DateTime         @default(now())
}
```

---

## Plan comptable Kado

| Compte | Type | Description |
|--------|------|-------------|
| `PROVISION_COMPANY:{id}` | Passif | Fonds prépayés par l'entreprise |
| `VOUCHER_LIABILITY:{id}` | Passif | Engagement envers le bénéficiaire |
| `MERCHANT_PAYABLE:{id}` | Passif | Montant dû au commerçant |
| `REVENUE_COMMISSION` | Produit | Commissions Kado (2%) |
| `REVENUE_SAAS` | Produit | Abonnements SaaS |
| `MERCHANT_SETTLED:{id}` | Actif | Montant versé au commerçant |
| `EXPIRED_FORFEIT` | Produit | Solde bons expirés |

### Écritures types
- **Émission** : PROVISION_COMPANY:{cId} → VOUCHER_LIABILITY:{vId}
- **Validation QR** : VOUCHER_LIABILITY:{vId} → MERCHANT_PAYABLE:{mId} (net) + REVENUE_COMMISSION (2%)
- **Expiration** : VOUCHER_LIABILITY:{vId} → EXPIRED_FORFEIT
- **Annulation** : VOUCHER_LIABILITY:{vId} → PROVISION_COMPANY:{cId}
- **Reversement** : MERCHANT_PAYABLE:{mId} → MERCHANT_SETTLED:{mId}

---

## AuthModule — règles d'implémentation

```typescript
// OTP : code 6 chiffres, Redis TTL 5 min, max 3 envois/heure/numéro
const key = `otp:${phone}`;
const tries = `otp_tries:${phone}`;
// Blocage 30 min après 3 échecs : `otp_blocked:${phone}`

// JWT RS256
// Access token : TTL 15 min, payload: { sub, role, phone?, companyId? }
// Refresh token : TTL 30 jours, stocké hashé SHA-256 en DB
// Rotation stricte : famille de tokens pour détecter la réutilisation

// Guards globaux (APP_GUARD)
// 1. JwtAuthGuard — vérifie blacklist Redis
// 2. RolesGuard — RBAC + vérification ressource (companyId match)
// 3. ThrottlerGuard — 100 req/min IP global, 30/min sur /auth/otp
```

---

## VoucherModule — règle critique SELECT FOR UPDATE

```typescript
// VouchersService.validate() — TOUJOURS dans une transaction Prisma
async validate(dto: ValidateVoucherDto) {
  return this.prisma.$transaction(async (tx) => {
    // SELECT FOR UPDATE — verrouille la ligne
    const voucher = await tx.$queryRaw<Voucher[]>`
      SELECT * FROM "Voucher" WHERE id = ${voucherId} FOR UPDATE
    `;
    // Vérifications dans l'ordre :
    // 1. Signature HMAC-SHA256 du QR (timingSafeEqual)
    // 2. Statut ISSUED ou PARTIAL
    // 3. expiresAt > NOW()
    // 4. remainingValue >= dto.amount
    // 5. Type bon compatible avec catégorie commerçant
    // 6. Mise à jour + écriture ledger dans la même transaction
  }, { timeout: 5000 });
}
```

---

## Statuts Voucher — transitions autorisées

```
PENDING → ISSUED (après emeConfirmedAt renseigné par webhook)
ISSUED → PARTIAL (paiement partiel)
ISSUED → USED (paiement total)
ISSUED → EXPIRED (cron 00h01 UTC)
ISSUED → CANCELLED (annulation RH — remboursement provision)
PARTIAL → USED (solde = 0)
PARTIAL → EXPIRED (cron)
USED, EXPIRED, CANCELLED → terminal (aucune transition)
```

---

## PaymentModule — règles Wave et Orange Money

```typescript
// Reversement T+1 — cron à 23h00 UTC
// Job Bull avec attempts: 3, backoff: { type: 'exponential', delay: 60000 }
// Référence idempotence : `SETTLE-${merchantId}-${format(new Date(),'yyyyMMdd')}`
// Contrainte UNIQUE sur MerchantSettlement.reference

// Webhooks — AVANT tout parsing JSON
// Vérifier HMAC-SHA256 : x-wave-signature header vs body
// timingSafeEqual obligatoire (pas de === pour comparer les signatures)
// Rejeter + loguer sans traitement si signature invalide

// Commission Kado : 2% sur le montant validé
// const commission = Math.round(amount * 0.02); // Math.round — jamais de float
// const net = amount - commission;
```

---

## Frontend Next.js 15 — conventions

### Routes App Router
- `/app/wallet` — portefeuille bénéficiaire
- `/app/wallet/[voucherId]` — QR code plein écran
- `/dashboard` — dashboard RH entreprise
- `/pos/scan` — scanner QR commerçant
- `/pos/amount` — saisie montant
- `/pos/confirm` — confirmation transaction

### Règles composants
```typescript
// Affichage montants — TOUJOURS diviser par 100
const display = (centimes: number) =>
  (centimes / 100).toLocaleString('fr-SN') + ' FCFA';

// Screen Wake Lock — QR code bénéficiaire
navigator.wakeLock?.request('screen');

// Scanner QR — POS commerçant
import { BrowserQRCodeReader } from '@zxing/browser';
// Caméra active IMMÉDIATEMENT à l'ouverture du /pos — pas de menu intermédiaire

// Feedback transaction confirmée
navigator.vibrate([200]); // vibration 200ms
// + son de validation + fond vert 2 secondes
```

### PWA — manifest.json
```json
{
  "name": "Kado",
  "short_name": "Kado",
  "theme_color": "#534AB7",
  "background_color": "#ffffff",
  "display": "standalone",
  "start_url": "/app/wallet"
}
```

### Service Worker — stratégies de cache
- `/api/vouchers/me` → NetworkFirst (cache 24h)
- QR codes des bons actifs → CacheFirst
- Assets statiques → CacheFirst

---

## Variables d'environnement requises

```bash
# Base de données
DATABASE_URL=postgresql://user:pwd@host:5432/kado
REDIS_URL=redis://localhost:6379

# Auth JWT RS256
JWT_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----..."
JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----..."
HMAC_VOUCHER_SECRET=<32 octets hex — openssl rand -hex 32>

# SMS
NEXAH_API_KEY=nxh_live_...
TWILIO_ACCOUNT_SID=AC...  # fallback
TWILIO_AUTH_TOKEN=...
SMS_FROM_NUMBER=+221XXXXXXXXX

# Paiements
WAVE_API_KEY=wave_live_...
WAVE_WEBHOOK_SECRET=<openssl rand -hex 32>
OM_API_KEY=...
OM_WEBHOOK_SECRET=<openssl rand -hex 32>

# EME partenaire
EME_PARTNER_API_URL=https://api.partenaire-eme.sn/v1
EME_PARTNER_API_KEY=...

# App
NEXT_PUBLIC_API_URL=https://api.kado.sn
ALLOWED_ORIGINS=https://kado.sn,https://staging.kado.sn
SENTRY_DSN=https://...@sentry.io/...
APP_ENV=development
COMMISSION_RATE=0.02
```

---

## Tests — priorités absolues (P0)

```typescript
// 1. Double-dépense — OBLIGATOIRE avant mise en production
// 2 validations simultanées sur le même bon → 1 seule réussit
test('anti double-dépense', async () => {
  const [r1, r2] = await Promise.all([
    validateVoucher({ voucherId, amount: 5000 }),
    validateVoucher({ voucherId, amount: 5000 }),
  ]);
  expect([r1.success, r2.success]).toContain(false);
});

// 2. Invariant ledger débit = crédit
// 3. OTP TTL 5 min + blocage 30 min après 3 échecs
// 4. Webhook Wave — signature invalide → 401
// 5. Import CSV 500 lignes avec rapport d'erreurs
// 6. Parcours E2E complet (Playwright) : émission → SMS → QR → scan → reversement
// 7. Tests de charge k6 : 100 validations simultanées sur le même bon
```

---

## Commandes utiles

```bash
npm run dev              # API (3001) + Web (3000) en parallèle
npm run test:unit        # Vitest avec coverage
npm run test:e2e         # Playwright
npm run test:load        # k6
npm run lint             # ESLint strict
npm run typecheck        # tsc --noEmit
npx prisma studio        # Interface graphique DB
npx prisma migrate dev   # Nouvelle migration
npx prisma db seed       # Fixtures de test
npm run build            # Build production
docker-compose up -d     # PostgreSQL + Redis local
```

---

## Codes d'erreur Kado — standardisés

| Code | HTTP | Signification |
|------|------|---------------|
| `VOUCHER_EXPIRED` | 409 | Bon expiré |
| `VOUCHER_ALREADY_USED` | 409 | Bon épuisé |
| `INSUFFICIENT_BALANCE` | 409 | Solde insuffisant |
| `INSUFFICIENT_PROVISION` | 409 | Provision entreprise épuisée |
| `QR_INVALID` | 400 | Signature HMAC incorrecte |
| `TYPE_NOT_ALLOWED` | 409 | Type bon incompatible commerçant |
| `LIMIT_EXCEEDED` | 422 | Plafond légal IRPP dépassé |
| `DUPLICATE_TRANSACTION` | 409 | Doublon détecté (idempotence) |
| `RATE_LIMIT_EXCEEDED` | 429 | Trop de requêtes |

---

## Règles anti-cash commerçant — à implémenter dans le POS

1. **Jamais de bouton "Rendu monnaie"** dans l'interface POS
2. **Montant max = solde disponible** — le champ est bloqué au-delà
3. **Solde restant affiché** après chaque transaction mais sans option de retrait
4. **Détection fraude** (backoffice) :
   - 100% des validations au centime exact → alerte
   - Pic volume +300% vs moyenne 4 semaines → alerte
   - Même bénéficiaire > 3 fois/jour chez le même commerçant → blocage auto

---

## Contexte métier — ne jamais oublier

- Kado opère sous **convention de distribution EME** (Wari ou Joni-Joni) — jamais émetteur
- Les fonds sont dans un **Compte de Provision ségrégué** chez l'EME
- **Sénégal uniquement** en V1 — numéros E.164 commençant par +221
- **Android bas de gamme** (Tecno Y4, ~35 000 FCFA) — tester sur ce device
- **Réseau 3G intermittent** au Sénégal — tout doit fonctionner en mode dégradé
- **Fuseau horaire** : Africa/Dakar (UTC+0) — stocker en UTC, afficher en WAT
- **Wolof** : langue principale au Sénégal — messages d'erreur en français simple
- **Wave** est le moyen de paiement préféré — Orange Money en fallback

---
*Kado SAS — Document interne — kado.sn*
