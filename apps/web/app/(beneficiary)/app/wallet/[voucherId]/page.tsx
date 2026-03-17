'use client';

import { useEffect, useState, use, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';
import { formatMontant } from '@kado/shared';

interface Voucher {
  id: string;
  code: string;
  qrData: string;
  nominalValue: number;
  remainingValue: number;
  status: string;
  expiresAt: string;
  note?: string;
}

// ─── Logo Kado généré en SVG data-URL ─────────────────────────────────────────
// Carré violet #534AB7 avec texte blanc "Kado" — aucun fichier image requis.
// Généré dynamiquement pour s'adapter à la taille du QR.
function makeLogoDataUrl(size: number): string {
  const radius = Math.round(size * 0.2);
  const fontSize = Math.round(size * 0.32);
  const cy = Math.round(size * 0.63); // centrage vertical optique du texte
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`,
    `<rect width="${size}" height="${size}" rx="${radius}" fill="#534AB7"/>`,
    `<text x="${size / 2}" y="${cy}" font-family="-apple-system,BlinkMacSystemFont,sans-serif"`,
    ` font-size="${fontSize}" font-weight="800" fill="white" text-anchor="middle">Kado</text>`,
    `</svg>`,
  ].join('');
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

export default function VoucherQrPage({
  params,
}: {
  params: Promise<{ voucherId: string }>;
}) {
  const { voucherId } = use(params);
  const router = useRouter();
  const [voucher, setVoucher] = useState<Voucher | null>(null);
  const [loading, setLoading] = useState(true);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [qrSize, setQrSize] = useState(280);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // ─── Calcul taille QR après montage (évite hydration mismatch) ─────────────
  useEffect(() => {
    setQrSize(Math.min(Math.floor(window.innerWidth * 0.78), 320));
  }, []);

  // ─── Fetch du bon ──────────────────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) { router.replace('/app/login'); return; }

    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/vouchers/${voucherId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (r.status === 401) { router.replace('/app/login'); return null; }
        return r.json();
      })
      .then((data) => { if (data) setVoucher(data); })
      .finally(() => setLoading(false));
  }, [voucherId, router]);

  // ─── Screen Wake Lock ──────────────────────────────────────────────────────
  // Acquis dès le bon chargé, réacquis si la page redevient visible,
  // libéré au démontage.
  useEffect(() => {
    if (!voucher) return;

    async function acquire() {
      try {
        wakeLockRef.current = await navigator.wakeLock?.request('screen') ?? null;
        if (wakeLockRef.current) setWakeLockActive(true);
      } catch { /* batterie critique — non bloquant */ }
    }

    function onVisibility() {
      if (document.visibilityState === 'visible' && !wakeLockRef.current) acquire();
    }

    acquire();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      wakeLockRef.current?.release();
      wakeLockRef.current = null;
      setWakeLockActive(false);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [voucher]);

  // ─── Logo : taille ~22% du QR ──────────────────────────────────────────────
  // level="H" (30% error correction) permet de couvrir jusqu'à ~28% du QR
  // avec un logo opaque sans dégrader la lisibilité.
  const logoSize = Math.floor(qrSize * 0.22);
  const logoSrc = makeLogoDataUrl(logoSize);

  // ─── Chargement ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={s.page}>
        <div style={s.skeletonQr} />
        <div style={s.skeletonBar} />
      </div>
    );
  }

  if (!voucher) {
    return (
      <div style={{ ...s.page, justifyContent: 'center', gap: 16 }}>
        <p style={{ color: '#6B7280' }}>Bon introuvable.</p>
        <button onClick={() => router.back()} style={s.backBtn}>← Retour</button>
      </div>
    );
  }

  const isPartial = voucher.status === 'PARTIAL';
  const expireDate = new Date(voucher.expiresAt).toLocaleDateString('fr-SN', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <main style={s.page}>

      {/* ── Bouton retour ── */}
      <button
        onClick={() => router.back()}
        style={s.backBtn}
        aria-label="Retour au portefeuille"
      >
        ←
      </button>

      {/* ── Pastille Wake Lock ── */}
      {wakeLockActive && (
        <div style={s.badge} aria-label="Écran maintenu allumé">
          <span style={s.dot} />
          Écran actif
        </div>
      )}

      {/* ── QR code ── */}
      <div style={s.qrZone}>
        <div style={s.qrFrame}>
          <QRCodeSVG
            value={voucher.qrData}
            size={qrSize}
            bgColor="#ffffff"
            fgColor="#111827"
            level="H"
            imageSettings={{
              src: logoSrc,
              width: logoSize,
              height: logoSize,
              excavate: true,
            }}
          />
        </div>
        <p style={s.hint}>Présentez ce code au commerçant</p>
      </div>

      {/* ── Bandeau montant ── */}
      <div style={s.bar}>
        <div style={s.barTop}>
          <span style={s.barLabel}>
            {isPartial ? 'Solde restant' : 'Montant'}
          </span>
          <span style={s.barAmount}>
            {formatMontant(voucher.remainingValue)}
          </span>
        </div>

        {isPartial && (
          <span style={s.barSub}>
            Valeur initiale : {formatMontant(voucher.nominalValue)}
          </span>
        )}

        {voucher.note && (
          <p style={s.barNote}>{voucher.note}</p>
        )}

        <p style={s.barExpiry}>Expire le {expireDate}</p>

        <Link href={`/app/wallet/${voucherId}/history`} style={s.historyLink}>
          Voir l&apos;historique →
        </Link>
      </div>

    </main>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100dvh',
    background: '#ffffff',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'relative',
    overflow: 'hidden',
  },

  backBtn: {
    position: 'absolute',
    top: 16,
    left: 16,
    background: 'none',
    border: 'none',
    fontSize: 24,
    color: '#9CA3AF',
    cursor: 'pointer',
    padding: '4px 8px',
    zIndex: 10,
    lineHeight: 1,
  },

  badge: {
    position: 'absolute',
    top: 22,
    right: 16,
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 11,
    color: '#9CA3AF',
    zIndex: 10,
  },

  dot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: '#22C55E',
    display: 'inline-block',
    flexShrink: 0,
  },

  qrZone: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '64px 24px 24px',
    gap: 20,
  },

  qrFrame: {
    padding: 20,
    background: '#ffffff',
    borderRadius: 20,
    boxShadow: '0 2px 40px rgba(0,0,0,0.08)',
    border: '1px solid #F3F4F6',
  },

  hint: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    margin: 0,
  },

  // ── Bandeau bas ──
  bar: {
    width: '100%',
    background: '#534AB7',
    borderRadius: '24px 24px 0 0',
    padding: '24px 28px 36px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },

  barTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },

  barLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.65)',
    fontWeight: 500,
  },

  barAmount: {
    fontSize: 30,
    fontWeight: 800,
    color: '#ffffff',
    letterSpacing: '-0.5px',
  },

  barSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'right',
  },

  barNote: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    margin: '4px 0 0',
  },

  barExpiry: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    margin: '4px 0 0',
  },

  historyLink: {
    display: 'block',
    marginTop: 16,
    paddingTop: 14,
    borderTop: '1px solid rgba(255,255,255,0.15)',
    fontSize: 13,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.7)',
    textDecoration: 'none',
    textAlign: 'center',
    letterSpacing: '0.1px',
  },

  // ── Skeletons ──
  skeletonQr: {
    width: 280,
    height: 280,
    background: '#F3F4F6',
    borderRadius: 20,
    marginTop: 120,
  },

  skeletonBar: {
    width: '100%',
    height: 150,
    background: '#E5E7EB',
    borderRadius: '24px 24px 0 0',
    marginTop: 'auto',
  },
};
