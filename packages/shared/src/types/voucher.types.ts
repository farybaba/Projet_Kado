// Types partagés — API + Web + validateurs

export type VoucherStatus = 'PENDING' | 'ISSUED' | 'PARTIAL' | 'USED' | 'EXPIRED' | 'CANCELLED';
export type VoucherType = 'GIFT_VOUCHER' | 'MEAL_TICKET' | 'TRANSPORT' | 'BONUS';
export type UserRole = 'BENEFICIARY' | 'MERCHANT' | 'COMPANY_ADMIN' | 'COMPANY_VIEWER' | 'ADMIN';
export type MerchantCategory = 'GENERAL' | 'FOOD' | 'MOBILITY' | 'HEALTH' | 'RETAIL' | 'EDUCATION';
export type LedgerEntryType = 'ISSUE' | 'REDEEM' | 'PARTIAL_REDEEM' | 'EXPIRE' | 'CANCEL' | 'SETTLE' | 'SAAS_REVENUE' | 'PROVISION';

// Transitions autorisées
export const VOUCHER_TRANSITIONS: Record<VoucherStatus, VoucherStatus[]> = {
  PENDING: ['ISSUED'],
  ISSUED: ['PARTIAL', 'USED', 'EXPIRED', 'CANCELLED'],
  PARTIAL: ['USED', 'EXPIRED'],
  USED: [],
  EXPIRED: [],
  CANCELLED: [],
};

export interface VoucherDto {
  id: string;
  code: string;
  qrData: string;
  nominalValue: number;   // centimes FCFA
  remainingValue: number; // centimes FCFA
  status: VoucherStatus;
  type: VoucherType;
  companyId: string;
  beneficiaryPhone: string;
  expiresAt: string;      // ISO 8601
  note?: string;
}

export interface ValidateVoucherDto {
  code: string;
  amountCentimes: number; // centimes FCFA — Int
  merchantId: string;
  qrSignature: string;
}

export interface LedgerEntryDto {
  id: string;
  type: LedgerEntryType;
  debitAccount: string;
  creditAccount: string;
  amount: number;         // centimes FCFA — toujours positif
  reference: string;
  createdAt: string;
}

// Types compatibilité commerçant
export const MERCHANT_VOUCHER_COMPATIBILITY: Record<MerchantCategory, VoucherType[]> = {
  GENERAL: ['GIFT_VOUCHER', 'BONUS'],
  FOOD: ['MEAL_TICKET', 'GIFT_VOUCHER', 'BONUS'],
  MOBILITY: ['TRANSPORT', 'GIFT_VOUCHER'],
  HEALTH: ['GIFT_VOUCHER', 'BONUS'],
  RETAIL: ['GIFT_VOUCHER', 'BONUS'],
  EDUCATION: ['GIFT_VOUCHER', 'BONUS'],
};
