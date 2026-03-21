'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BrowserQRCodeReader, IScannerControls } from '@zxing/browser';
import { formatMontant } from '@kado/shared';

const API = process.env.NEXT_PUBLIC_API_URL ?? '';

// ─── Types ────────────────────────────────────────────────────────────────────

interface QrPayload {
  code: string;
  sig: string;
  companyId?: string;
}

interface VoucherPreview {
  qrData: string; // contenu brut JSON du QR
  remainingValue: number;
  nominalValue: number;
  type: string;
  expiresAt: string;
  beneficiaryFirstName: string | null;
}

type State =
  | { kind: 'scanning' }
  | { kind: 'loading' }
  | { kind: 'preview'; voucher: VoucherPreview }
  | { kind: 'error'; message: string; recoverable: boolean };

const TYPE_LABELS: Record<string, string> = {
  GIFT_VOUCHER: 'Bon cadeau',
  MEAL_TICKET: 'Ticket repas',
  TRANSPORT: 'Transport',
  BONUS: 'Bonus',
};

const ERROR_MESSAGES: Record<string, string> = {
  VOUCHER_NOT_FOUND: 'Bon introuvable.',
  VOUCHER_ALREADY_USED: 'Ce bon a déjà été utilisé.',
  VOUCHER_EXPIRED: 'Ce bon est expiré.',
  QR_INVALID: 'QR code invalide ou falsifié.',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PosScanPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const processingRef = useRef(false); // verrou pour ignorer les scans multiples
  const [state, setState] = useState<State>({ kind: 'scanning' });

  // ─── Guard auth — redirige vers /pos/login si pas de token ───────────────────
  useEffect(() => {
    const token = localStorage.getItem('merchant_token');
    if (!token) {
      router.replace('/pos/login');
    }
  }, [router]);

  // ─── Démarrage caméra ────────────────────────────────────────────────────────
  // Lancée une seule fois au montage — sans dépendance sur `state`
  // pour ne pas redémarrer la caméra inutilement.
  const startCamera = useCallback(async () => {
    if (!videoRef.current) return;

    const reader = new BrowserQRCodeReader();

    try {
      controlsRef.current = await reader.decodeFromVideoDevice(
        undefined, // caméra par défaut (arrière sur mobile)
        videoRef.current,
        (result, err) => {
          // Ignorer si un scan est déjà en cours de traitement
          if (processingRef.current) return;
          if (!result) return;
          if (err) return;

          const text = result.getText();
          processingRef.current = true;
          handleQrScanned(text);
        },
      );
    } catch {
      setState({
        kind: 'error',
        message: 'Impossible d\'accéder à la caméra. Vérifiez les permissions.',
        recoverable: false,
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    startCamera();
    return () => {
      controlsRef.current?.stop();
    };
  }, [startCamera]);

  // ─── Traitement du QR scanné ─────────────────────────────────────────────────

  async function handleQrScanned(text: string) {
    // 1. Parser le JSON
    let payload: QrPayload;
    try {
      payload = JSON.parse(text);
    } catch {
      setState({ kind: 'error', message: 'QR code illisible. Réessayez.', recoverable: true });
      processingRef.current = false;
      return;
    }

    if (!payload.code || !payload.sig) {
      setState({ kind: 'error', message: 'QR code invalide.', recoverable: true });
      processingRef.current = false;
      return;
    }

    // 2. Appel API lookup (sans débit)
    setState({ kind: 'loading' });

    const token = localStorage.getItem('merchant_token');

    try {
      const res = await fetch(`${API}/api/v1/vouchers/lookup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ qrData: text }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const knownCode = data?.code as string | undefined;
        const message = ERROR_MESSAGES[knownCode ?? ''] ?? data?.message ?? 'Erreur lors de la lecture du bon.';
        setState({ kind: 'error', message, recoverable: true });
        processingRef.current = false;
        return;
      }

      // 3. Afficher le preview
      setState({
        kind: 'preview',
        voucher: {
          qrData: text,
          remainingValue: data.remainingValue,
          nominalValue: data.nominalValue,
          type: data.type,
          expiresAt: data.expiresAt,
          beneficiaryFirstName: data.beneficiaryFirstName,
        },
      });
    } catch {
      setState({ kind: 'error', message: 'Erreur réseau. Vérifiez votre connexion.', recoverable: true });
      processingRef.current = false;
    }
  }

  // ─── Continuer vers la saisie du montant ─────────────────────────────────────

  function handleContinue() {
    if (state.kind !== 'preview') return;

    // Stocker les données pour les pages suivantes
    sessionStorage.setItem('pos_qr', JSON.stringify({
      qrData: state.voucher.qrData,
      remainingValue: state.voucher.remainingValue,
      nominalValue: state.voucher.nominalValue,
      type: state.voucher.type,
      beneficiaryFirstName: state.voucher.beneficiaryFirstName,
      merchantId: localStorage.getItem('merchant_id') ?? '',
    }));

    router.push('/pos/amount');
  }

  // ─── Rescanner (reset) ───────────────────────────────────────────────────────

  function handleRescan() {
    processingRef.current = false;
    setState({ kind: 'scanning' });
  }

  // ─── Rendu ───────────────────────────────────────────────────────────────────

  const isScanning = state.kind === 'scanning';
  const isLoading = state.kind === 'loading';
  const isPreview = state.kind === 'preview';
  const isError = state.kind === 'error';

  return (
    <main style={s.page}>

      {/* ── Vidéo caméra — toujours montée pour garder le flux actif ── */}
      <div style={{ ...s.videoWrap, opacity: isPreview || isLoading ? 0 : 1 }}>
        <video ref={videoRef} style={s.video} playsInline muted autoPlay />

        {/* Viseur animé */}
        {isScanning && (
          <>
            <div style={s.overlay} />
            <div style={s.finder}>
              <Corner pos="tl" />
              <Corner pos="tr" />
              <Corner pos="bl" />
              <Corner pos="br" />
            </div>
            <div style={s.scanLine} />
          </>
        )}
      </div>

      {/* ── Texte d'instruction + lien dashboard ── */}
      {isScanning && (
        <div style={s.hint}>
          <p style={s.hintText}>Pointez la caméra sur le QR code du bon</p>
          <Link href="/pos/dashboard" style={s.dashboardLink}>
            Tableau de bord →
          </Link>
        </div>
      )}

      {/* ── Chargement ── */}
      {isLoading && (
        <div style={s.centerBox}>
          <div style={s.spinner} />
          <p style={s.loadingText}>Lecture du bon…</p>
        </div>
      )}

      {/* ── Preview du bon ── */}
      {isPreview && state.kind === 'preview' && (
        <div style={s.previewBox}>
          {/* En-tête bénéficiaire */}
          <div style={s.previewHeader}>
            <div style={s.avatar}>
              {state.voucher.beneficiaryFirstName?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div>
              <p style={s.beneficiaryName}>
                {state.voucher.beneficiaryFirstName ?? 'Bénéficiaire'}
              </p>
              <p style={s.typeBadge}>
                {TYPE_LABELS[state.voucher.type] ?? state.voucher.type}
              </p>
            </div>
          </div>

          {/* Solde */}
          <div style={s.balanceRow}>
            <span style={s.balanceLabel}>Solde disponible</span>
            <span style={s.balanceValue}>
              {formatMontant(state.voucher.remainingValue)}
            </span>
          </div>

          {/* Valeur initiale si partielle */}
          {state.voucher.remainingValue !== state.voucher.nominalValue && (
            <p style={s.nominalHint}>
              Valeur initiale : {formatMontant(state.voucher.nominalValue)}
            </p>
          )}

          {/* Expiration */}
          <p style={s.expiryHint}>
            Expire le{' '}
            {new Date(state.voucher.expiresAt).toLocaleDateString('fr-SN', {
              day: 'numeric', month: 'long', year: 'numeric',
            })}
          </p>

          {/* Actions */}
          <button onClick={handleContinue} style={s.btnPrimary}>
            Saisir le montant →
          </button>
          <button onClick={handleRescan} style={s.btnSecondary}>
            Scanner un autre bon
          </button>
        </div>
      )}

      {/* ── Erreur ── */}
      {isError && state.kind === 'error' && (
        <div style={s.centerBox}>
          <div style={s.errorIcon}>✕</div>
          <p style={s.errorText}>{state.message}</p>
          {state.recoverable && (
            <button onClick={handleRescan} style={s.btnPrimary}>
              Réessayer
            </button>
          )}
        </div>
      )}

    </main>
  );
}

// ─── Coins du viseur ──────────────────────────────────────────────────────────

function Corner({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  const size = 22;
  const thickness = 3;
  const color = '#534AB7';
  const radius = 4;
  const style: React.CSSProperties = {
    position: 'absolute',
    width: size,
    height: size,
    borderColor: color,
    borderStyle: 'solid',
    borderWidth: 0,
    ...(pos === 'tl' && {
      top: 0, left: 0,
      borderTopWidth: thickness, borderLeftWidth: thickness,
      borderTopLeftRadius: radius,
    }),
    ...(pos === 'tr' && {
      top: 0, right: 0,
      borderTopWidth: thickness, borderRightWidth: thickness,
      borderTopRightRadius: radius,
    }),
    ...(pos === 'bl' && {
      bottom: 0, left: 0,
      borderBottomWidth: thickness, borderLeftWidth: thickness,
      borderBottomLeftRadius: radius,
    }),
    ...(pos === 'br' && {
      bottom: 0, right: 0,
      borderBottomWidth: thickness, borderRightWidth: thickness,
      borderBottomRightRadius: radius,
    }),
  };
  return <div style={style} />;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100dvh',
    background: '#000',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },

  // Caméra
  videoWrap: {
    position: 'absolute',
    inset: 0,
    transition: 'opacity 0.2s',
  },
  video: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },

  // Fond semi-transparent autour du viseur
  overlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(0,0,0,0.45)',
    // Découpe le viseur via clip-path
    clipPath: `polygon(
      0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%,
      20% 20%, 20% 80%, 80% 80%, 80% 20%, 20% 20%
    )`,
  },

  // Cadre viseur
  finder: {
    position: 'absolute',
    top: '20%', left: '20%',
    width: '60%', height: '60%',
  },

  // Ligne de scan animée
  scanLine: {
    position: 'absolute',
    left: '20%',
    width: '60%',
    height: 2,
    background: 'linear-gradient(90deg, transparent, #534AB7, transparent)',
    top: '20%',
    animation: 'scanMove 2s ease-in-out infinite',
  },

  hint: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    zIndex: 10,
  },
  hintText: {
    color: '#fff',
    fontSize: 15,
    background: 'rgba(0,0,0,0.5)',
    padding: '8px 20px',
    borderRadius: 20,
    margin: 0,
  },
  dashboardLink: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: 500,
    textDecoration: 'none',
    background: 'rgba(0,0,0,0.35)',
    padding: '6px 16px',
    borderRadius: 16,
  },

  // Loading
  centerBox: {
    position: 'relative',
    zIndex: 10,
    background: '#fff',
    borderRadius: 20,
    padding: '40px 32px',
    width: 'calc(100% - 48px)',
    maxWidth: 360,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
  },
  spinner: {
    width: 40,
    height: 40,
    border: '3px solid #E5E7EB',
    borderTopColor: '#534AB7',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  loadingText: {
    fontSize: 15,
    color: '#6B7280',
    margin: 0,
  },

  // Preview
  previewBox: {
    position: 'relative',
    zIndex: 10,
    background: '#fff',
    borderRadius: 20,
    padding: '28px 24px 24px',
    width: 'calc(100% - 48px)',
    maxWidth: 360,
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
  },
  previewHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    marginBottom: 24,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: '50%',
    background: '#F5F4FF',
    color: '#534AB7',
    fontSize: 20,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  beneficiaryName: {
    fontSize: 17,
    fontWeight: 700,
    color: '#111827',
    margin: '0 0 2px',
  },
  typeBadge: {
    fontSize: 12,
    color: '#534AB7',
    background: '#F5F4FF',
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 4,
    margin: 0,
    fontWeight: 500,
  },
  balanceRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    background: '#F9FAFB',
    borderRadius: 12,
    padding: '14px 16px',
    marginBottom: 8,
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
  nominalHint: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'right',
    margin: '0 0 8px',
  },
  expiryHint: {
    fontSize: 12,
    color: '#9CA3AF',
    margin: '0 0 20px',
  },

  // Erreur
  errorIcon: {
    width: 52,
    height: 52,
    borderRadius: '50%',
    background: '#FEF2F2',
    color: '#EF4444',
    fontSize: 22,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 15,
    color: '#374151',
    textAlign: 'center',
    margin: 0,
  },

  // Boutons
  btnPrimary: {
    width: '100%',
    background: '#534AB7',
    color: '#fff',
    border: 'none',
    borderRadius: 12,
    padding: '15px',
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    marginBottom: 10,
  },
  btnSecondary: {
    width: '100%',
    background: 'transparent',
    color: '#6B7280',
    border: '1px solid #E5E7EB',
    borderRadius: 12,
    padding: '13px',
    fontSize: 15,
    cursor: 'pointer',
  },
};
