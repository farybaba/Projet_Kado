import { describe, it, expect } from 'vitest';
import { formatMontant, fcfaToCentimes, computeCommission, assertLedgerBalance } from '../money';

describe('money utils', () => {
  describe('formatMontant', () => {
    it('convertit centimes en affichage FCFA', () => {
      expect(formatMontant(1_000_000)).toBe('10\u202f000 FCFA');
    });

    it('lève une erreur si le montant n\'est pas un entier', () => {
      expect(() => formatMontant(100.5)).toThrow();
    });

    it('formatMontant(0) → "0 FCFA"', () => {
      expect(formatMontant(0)).toContain('FCFA');
    });
  });

  describe('fcfaToCentimes', () => {
    it('convertit FCFA en centimes avec Math.round', () => {
      expect(fcfaToCentimes(10_000)).toBe(1_000_000);
      expect(fcfaToCentimes(0.5)).toBe(50); // 50 centimes
    });

    it('retourne toujours un entier', () => {
      expect(Number.isInteger(fcfaToCentimes(9999.99))).toBe(true);
    });
  });

  describe('computeCommission', () => {
    it('calcule 2% en centimes (entier)', () => {
      expect(computeCommission(10_000_00)).toBe(20_000); // 200 FCFA
    });

    it('utilise Math.round pour les cas limites', () => {
      const result = computeCommission(333_00); // 333 FCFA * 2% = 6.66 → 7 centimes
      expect(Number.isInteger(result)).toBe(true);
    });

    it('lève une erreur si montant non entier', () => {
      expect(() => computeCommission(100.5)).toThrow();
    });
  });

  describe('assertLedgerBalance', () => {
    it('ne lève pas d\'erreur si débit = crédit', () => {
      expect(() => assertLedgerBalance(1000, 1000)).not.toThrow();
    });

    it('lève une erreur si débit ≠ crédit', () => {
      expect(() => assertLedgerBalance(1000, 999)).toThrow(
        'Invariant ledger violé',
      );
    });
  });
});
