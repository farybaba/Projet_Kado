'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const TYPE_LABELS: Record<string, string> = {
  GIFT_VOUCHER: 'Bon cadeau',
  MEAL_TICKET: 'Ticket repas',
  TRANSPORT: 'Transport',
  BONUS: 'Bonus',
};

interface PosQr {
  code: string;
  sig: string;
  remainingValue: number;
  nominalValue: number;
  type: string;
  beneficiaryFirstName: string | null;
  merchantId: string;
}

export default function PosAmountPage() {
  const router = useRouter();
  const [posQr, setPosQr] = useState<PosQr | null>(null);
  const [digits, setDigits] = useState(''); // montant saisi en FCFA (entier)

  useEffect(() => {
    const raw = sessionStorage.getItem('pos_qr');
    if (!raw) { router.replace('/pos/scan'); return; }
    setPosQr(JSON.parse(raw));
  }, [router]);

  const maxFcfa = posQr ? Math.floor(posQr.remainingValue / 100) : 0;
  const enteredFcfa = parseInt(digits || '0', 10);
  const overLimit = enteredFcfa > maxFcfa;
  const canSubmit = enteredFcfa > 0 && !overLimit;

  // ─── Pavé numérique ───────────────────────────────────────────────────────────

  function pressDigit(d: string) {
    setDigits((prev) => {
      const next = prev + d;
      // bloquer à 7 chiffres (max 9 999 999 FCFA) et si déjà > max ne pas continuer
      if (next.length > 7) return prev;
      return next;
    });
  }

  function pressDelete() {
    setDigits((prev) => prev.slice(0, -1));
  }

  function pressMax() {
    setDigits(String(maxFcfa));
  }

  function handleConfirm() {
    if (!canSubmit) return;
    const amountCentimes = enteredFcfa * 100;
    sessionStorage.setItem('pos_amount', String(amountCentimes));
    router.push('/pos/confirm');
  }

  // ─── Affichage ────────────────────────────────────────────────────────────────

  const displayAmount = enteredFcfa === 0
    ? '0'
    : enteredFcfa.toLocaleString('fr-SN');

  const displayBalance = maxFcfa.toLocaleString('fr-SN');

  if (!posQr) return null;

  return (
    <main style={s.page}>

      {/* ── En-tête bénéficiaire ── */}
      <div style={s.header}>
        <div style={s.avatar}>
          {posQr.beneficiaryFirstName?.[0]?.toUpperCase() ?? '?'}
        </div>
        <div>
          <p style={s.beneficiaryName}>
            {posQr.beneficiaryFirstName ?? 'Bénéficiaire'}
          </p>
          <span style={s.typeBadge}>
            {TYPE_LABELS[posQr.type] ?? posQr.type}
          </span>
        </div>
      </div>

      {/* ── Solde disponible ── */}
      <div style={s.balanceBlock}>
        <span style={s.balanceLabel}>Solde disponible</span>
        <span style={s.balanceValue}>{displayBalance} <span style={s.currency}>FCFA</span></span>
      </div>

      {/* ── Affichage montant saisi ── */}
      <div style={{ ...s.amountDisplay, borderColor: overLimit ? '#EF4444' : '#534AB7' }}>
        <span style={{ ...s.amountValue, color: overLimit ? '#EF4444' : '#111827' }}>
          {displayAmount}
        </span>
        <span style={s.amountCurrency}>FCFA</span>
      </div>
      {overLimit && (
        <p style={s.errorHint}>Maximum : {displayBalance} FCFA</p>
      )}

      {/* ── Pavé numérique ── */}
      <div style={s.pad}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
          <button key={d} style={s.padKey} onClick={() => pressDigit(String(d))}>
            {d}
          </button>
        ))}
        {/* Ligne basse : Débit total | 0 | ⌫ */}
        <button style={{ ...s.padKey, ...s.padKeyMax }} onClick={pressMax}>
          MAX
        </button>
        <button style={s.padKey} onClick={() => pressDigit('0')}>
          0
        </button>
        <button style={{ ...s.padKey, ...s.padKeyDel }} onClick={pressDelete}>
          ⌫
        </button>
      </div>

      {/* ── Bouton confirmer ── */}
      <button
        onClick={handleConfirm}
        disabled={!canSubmit}
        style={{ ...s.confirmBtn, opacity: canSubmit ? 1 : 0.4 }}
      >
        Continuer →
      </button>

    </main>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100dvh',
    background: '#F9FAFB',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    padding: '20px 16px 24px',
    maxWidth: 420,
    margin: '0 auto',
    gap: 0,
  },

  // En-tête
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: '50%',
    background: '#F5F4FF',
    color: '#534AB7',
    fontSize: 18,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  beneficiaryName: {
    fontSize: 16,
    fontWeight: 700,
    color: '#111827',
    margin: '0 0 3px',
  },
  typeBadge: {
    fontSize: 11,
    color: '#534AB7',
    background: '#F5F4FF',
    padding: '2px 8px',
    borderRadius: 4,
    fontWeight: 500,
  },

  // Solde
  balanceBlock: {
    background: '#fff',
    borderRadius: 14,
    padding: '14px 18px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 16,
    border: '1px solid #E5E7EB',
  },
  balanceLabel: {
    fontSize: 13,
    color: '#6B7280',
  },
  balanceValue: {
    fontSize: 22,
    fontWeight: 800,
    color: '#111827',
  },
  currency: {
    fontSize: 14,
    fontWeight: 500,
    color: '#6B7280',
  },

  // Affichage montant
  amountDisplay: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'flex-end',
    gap: 8,
    background: '#fff',
    borderRadius: 14,
    padding: '16px 20px',
    border: '2px solid #534AB7',
    marginBottom: 4,
  },
  amountValue: {
    fontSize: 42,
    fontWeight: 800,
    letterSpacing: '-1px',
    lineHeight: 1,
  },
  amountCurrency: {
    fontSize: 16,
    color: '#6B7280',
    fontWeight: 500,
  },
  errorHint: {
    fontSize: 13,
    color: '#EF4444',
    textAlign: 'right',
    marginBottom: 8,
    marginTop: 2,
  },

  // Pavé numérique
  pad: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 10,
    marginTop: 16,
    marginBottom: 16,
  },
  padKey: {
    height: 64,
    fontSize: 24,
    fontWeight: 600,
    color: '#111827',
    background: '#fff',
    border: '1px solid #E5E7EB',
    borderRadius: 14,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    WebkitTapHighlightColor: 'transparent',
    userSelect: 'none',
  } as React.CSSProperties,
  padKeyMax: {
    fontSize: 13,
    fontWeight: 700,
    color: '#534AB7',
    background: '#F5F4FF',
    border: '1px solid #DDD9F5',
    letterSpacing: '0.5px',
  },
  padKeyDel: {
    color: '#6B7280',
    fontSize: 20,
  },

  // Bouton confirmer
  confirmBtn: {
    width: '100%',
    background: '#534AB7',
    color: '#fff',
    border: 'none',
    borderRadius: 14,
    padding: '17px',
    fontSize: 17,
    fontWeight: 700,
    cursor: 'pointer',
    letterSpacing: '0.2px',
  },
};
