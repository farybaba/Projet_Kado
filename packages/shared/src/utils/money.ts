// Utilitaires monétaires — RÈGLE ABSOLUE : montants en centimes FCFA (Int)
// Affichage TOUJOURS via formatMontant() — jamais de division manuelle

/**
 * Convertit des centimes FCFA en chaîne affichable.
 * Ex: 1_000_000 → "10 000 FCFA"
 */
export function formatMontant(centimes: number): string {
  if (!Number.isInteger(centimes)) {
    throw new Error(`formatMontant: ${centimes} n'est pas un entier. Montants en centimes FCFA obligatoires.`);
  }
  return (centimes / 100).toLocaleString('fr-SN') + ' FCFA';
}

/**
 * Convertit un montant FCFA saisi par l'utilisateur en centimes.
 * Arrondi avec Math.round — jamais de float en DB.
 */
export function fcfaToCentimes(fcfa: number): number {
  return Math.round(fcfa * 100);
}

/**
 * Calcule la commission Kado (2%) sur un montant en centimes.
 * Utilise Math.round — jamais de float.
 */
export function computeCommission(amountCentimes: number, rate = 0.02): number {
  if (!Number.isInteger(amountCentimes)) {
    throw new Error('computeCommission: montant doit être en centimes (Int)');
  }
  return Math.round(amountCentimes * rate);
}

/**
 * Vérifie l'invariant comptable : SUM(débit) = SUM(crédit)
 */
export function assertLedgerBalance(debit: number, credit: number): void {
  if (debit !== credit) {
    throw new Error(
      `Invariant ledger violé : débit=${debit} ≠ crédit=${credit}`,
    );
  }
}
