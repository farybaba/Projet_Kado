'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL ?? '';

const ERROR_LABELS: Record<string, string> = {
  VOUCHER_ALREADY_USED: 'Ce bon a déjà été entièrement utilisé.',
  VOUCHER_EXPIRED: 'Ce bon est expiré.',
  INSUFFICIENT_BALANCE: 'Solde insuffisant sur ce bon.',
  QR_INVALID: 'QR code invalide. Rescannez le bon.',
  VOUCHER_NOT_FOUND: 'Bon introuvable.',
  DUPLICATE_TRANSACTION: 'Transaction déjà enregistrée.',
  TYPE_NOT_ALLOWED: 'Ce bon n\'est pas accepté dans cette boutique.',
};

interface PosQr {
  code: string;
  sig: string;
  remainingValue: number;
  beneficiaryFirstName: string | null;
  merchantId: string;
}

type Step = 'confirm' | 'loading' | 'success' | 'error';

// ─── Son de validation — deux bips courts via Web Audio API ───────────────────
function playSuccessSound() {
  try {
    const ctx = new AudioContext();
    [[880, 0, 0.12], [1320, 0.14, 0.28]].forEach(([freq, start, end]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq as number;
      gain.gain.setValueAtTime(0.25, ctx.currentTime + (start as number));
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (end as number));
      osc.start(ctx.currentTime + (start as number));
      osc.stop(ctx.currentTime + (end as number));
    });
  } catch { /* AudioContext non disponible — silencieux */ }
}

function formatFcfa(centimes: number): string {
  return (centimes / 100).toLocaleString('fr-SN') + ' FCFA';
}

export default function PosConfirmPage() {
  const router = useRouter();
  const [posQr, setPosQr] = useState<PosQr | null>(null);
  const [amountCentimes, setAmountCentimes] = useState(0);
  const [step, setStep] = useState<Step>('confirm');
  const [remainingAfter, setRemainingAfter] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [countdown, setCountdown] = useState(3);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const rawQr = sessionStorage.getItem('pos_qr');
    const rawAmount = sessionStorage.getItem('pos_amount');
    if (!rawQr || !rawAmount) { router.replace('/pos/scan'); return; }
    setPosQr(JSON.parse(rawQr));
    setAmountCentimes(parseInt(rawAmount, 10));
  }, [router]);

  // ─── Compte à rebours retour scan après succès ────────────────────────────────
  useEffect(() => {
    if (step !== 'success') return;
    timerRef.current = setInterval(() => {
      setCountdown((n) => {
        if (n <= 1) {
          clearInterval(timerRef.current!);
          sessionStorage.removeItem('pos_qr');
          sessionStorage.removeItem('pos_amount');
          router.replace('/pos/scan');
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current!);
  }, [step, router]);

  async function handleConfirm() {
    if (!posQr || step === 'loading') return;
    setStep('loading');

    try {
      const res = await fetch(`${API}/api/v1/vouchers/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('merchant_token')}`,
        },
        body: JSON.stringify({
          code: posQr.code,
          amountCentimes,
          merchantId: posQr.merchantId,
          qrSignature: posQr.sig,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const knownCode = data?.code as string | undefined;
        setErrorMsg(ERROR_LABELS[knownCode ?? ''] ?? data?.message ?? 'Erreur lors de la validation.');
        setStep('error');
        return;
      }

      setRemainingAfter(data.remainingValue);
      setStep('success');
      navigator.vibrate?.([200]);
      playSuccessSound();
    } catch {
      setErrorMsg('Erreur réseau. Vérifiez votre connexion.');
      setStep('error');
    }
  }

  // ─── Succès — fond vert plein écran ───────────────────────────────────────────
  if (step === 'success') {
    return (
      <main style={s.successPage}>
        <div style={s.checkCircle}>
          <span style={s.checkMark}>✓</span>
        </div>
        <p style={s.successTitle}>Paiement validé</p>
        <p style={s.successAmount}>{formatFcfa(amountCentimes)}</p>
        {remainingAfter > 0 && (
          <p style={s.successRemaining}>
            Solde restant : {formatFcfa(remainingAfter)}
          </p>
        )}
        {remainingAfter === 0 && (
          <p style={s.successRemaining}>Bon entièrement utilisé</p>
        )}
        <p style={s.successCountdown}>Retour dans {countdown}s…</p>
      </main>
    );
  }

  // ─── Erreur — fond orange plein écran ─────────────────────────────────────────
  if (step === 'error') {
    return (
      <main style={s.errorPage}>
        <div style={s.errorCircle}>
          <span style={s.errorX}>✕</span>
        </div>
        <p style={s.errorTitle}>Paiement refusé</p>
        <p style={s.errorMessage}>{errorMsg}</p>
        <button
          style={s.errorBtn}
          onClick={() => router.replace('/pos/scan')}
        >
          Scanner un autre bon
        </button>
        <button
          style={s.errorBtnSecondary}
          onClick={() => router.back()}
        >
          Modifier le montant
        </button>
      </main>
    );
  }

  // ─── Confirmation ─────────────────────────────────────────────────────────────
  return (
    <main style={s.page}>

      <button style={s.backBtn} onClick={() => router.back()}>← Retour</button>

      <div style={s.summaryCard}>
        {posQr?.beneficiaryFirstName && (
          <div style={s.beneficiaryRow}>
            <div style={s.avatar}>
              {posQr.beneficiaryFirstName[0].toUpperCase()}
            </div>
            <span style={s.beneficiaryName}>{posQr.beneficiaryFirstName}</span>
          </div>
        )}
        <p style={s.summaryLabel}>Montant à débiter</p>
        <p style={s.summaryAmount}>{formatFcfa(amountCentimes)}</p>
        {posQr && posQr.remainingValue - amountCentimes > 0 && (
          <p style={s.summaryRemaining}>
            Solde après : {formatFcfa(posQr.remainingValue - amountCentimes)}
          </p>
        )}
      </div>

      <button
        onClick={handleConfirm}
        disabled={step === 'loading'}
        style={{ ...s.confirmBtn, opacity: step === 'loading' ? 0.7 : 1 }}
      >
        {step === 'loading' ? <Spinner /> : 'Confirmer le paiement'}
      </button>

      <button
        onClick={() => router.back()}
        disabled={step === 'loading'}
        style={s.cancelBtn}
      >
        Annuler
      </button>

    </main>
  );
}

function Spinner() {
  return (
    <span style={{
      display: 'inline-block',
      width: 20, height: 20,
      border: '2px solid rgba(255,255,255,0.4)',
      borderTopColor: '#fff',
      borderRadius: '50%',
      animation: 'spin 0.7s linear infinite',
    }} />
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
    padding: '16px 16px 32px',
    maxWidth: 420,
    margin: '0 auto',
  },

  backBtn: {
    background: 'none',
    border: 'none',
    color: '#6B7280',
    fontSize: 15,
    cursor: 'pointer',
    padding: '4px 0 20px',
    alignSelf: 'flex-start',
  },

  summaryCard: {
    background: '#fff',
    borderRadius: 20,
    padding: '28px 24px',
    border: '1px solid #E5E7EB',
    marginBottom: 24,
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  beneficiaryRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: '50%',
    background: '#F5F4FF',
    color: '#534AB7',
    fontSize: 16,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  beneficiaryName: {
    fontSize: 15,
    fontWeight: 600,
    color: '#374151',
  },
  summaryLabel: {
    fontSize: 13,
    color: '#9CA3AF',
    margin: 0,
  },
  summaryAmount: {
    fontSize: 44,
    fontWeight: 800,
    color: '#111827',
    letterSpacing: '-1px',
    margin: '4px 0',
  },
  summaryRemaining: {
    fontSize: 13,
    color: '#9CA3AF',
    margin: 0,
  },

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
    marginBottom: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 56,
  },
  cancelBtn: {
    width: '100%',
    background: 'transparent',
    color: '#6B7280',
    border: '1px solid #E5E7EB',
    borderRadius: 14,
    padding: '15px',
    fontSize: 15,
    cursor: 'pointer',
  },

  // ── Succès ──
  successPage: {
    minHeight: '100dvh',
    background: '#22C55E',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '0 32px',
  },
  checkCircle: {
    width: 100,
    height: 100,
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.25)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  checkMark: {
    fontSize: 52,
    color: '#fff',
    lineHeight: 1,
  },
  successTitle: {
    fontSize: 26,
    fontWeight: 800,
    color: '#fff',
    margin: 0,
  },
  successAmount: {
    fontSize: 36,
    fontWeight: 800,
    color: '#fff',
    margin: '4px 0',
    letterSpacing: '-0.5px',
  },
  successRemaining: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.75)',
    margin: 0,
  },
  successCountdown: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 20,
  },

  // ── Erreur ──
  errorPage: {
    minHeight: '100dvh',
    background: '#F97316',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '0 32px',
  },
  errorCircle: {
    width: 90,
    height: 90,
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.25)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  errorX: {
    fontSize: 42,
    color: '#fff',
    lineHeight: 1,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 800,
    color: '#fff',
    margin: 0,
  },
  errorMessage: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    margin: '8px 0 24px',
    lineHeight: 1.5,
  },
  errorBtn: {
    width: '100%',
    maxWidth: 320,
    background: '#fff',
    color: '#F97316',
    border: 'none',
    borderRadius: 14,
    padding: '16px',
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer',
    marginBottom: 10,
  },
  errorBtnSecondary: {
    width: '100%',
    maxWidth: 320,
    background: 'rgba(255,255,255,0.2)',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.4)',
    borderRadius: 14,
    padding: '14px',
    fontSize: 15,
    cursor: 'pointer',
  },
};
