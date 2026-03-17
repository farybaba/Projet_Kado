'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL ?? '';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardData {
  today: {
    gross: number;
    commission: number;
    net: number;
    count: number;
  };
  transactions: Array<{
    id: string;
    beneficiaryMasked: string;
    amount: number;
    createdAt: string;
  }>;
  settlements: Array<{
    id: string;
    amount: number;
    settledAt: string;
    waveRef: string | null;
    omRef: string | null;
  }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(centimes: number): string {
  return (centimes / 100).toLocaleString('fr-SN') + ' FCFA';
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-SN', { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-SN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PosDashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const token = localStorage.getItem('merchant_token');
    if (!token) { router.replace('/pos/login'); return; }

    setLoading(true);
    setError('');

    try {
      const url = `${API}/api/v1/merchants/me/dashboard`;
      console.log('[pos/dashboard] GET', url);

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      console.log('[pos/dashboard] status HTTP:', res.status);

      if (res.status === 401) { router.replace('/pos/login'); return; }

      const json = await res.json().catch((e: unknown) => {
        console.error('[pos/dashboard] Impossible de parser la réponse JSON:', e);
        return null;
      });

      console.log('[pos/dashboard] réponse brute:', JSON.stringify(json, null, 2));

      if (!res.ok) {
        setError(json?.message ?? 'Impossible de charger le tableau de bord.');
        return;
      }

      // Validation du shape — évite un crash si l'API retourne un format inattendu
      if (!json || typeof json.today !== 'object' || !Array.isArray(json.transactions) || !Array.isArray(json.settlements)) {
        console.error('[pos/dashboard] Shape de réponse inattendu:', json);
        setError('Réponse API invalide. Consultez la console.');
        return;
      }

      setData(json);
    } catch (err: unknown) {
      console.error('[pos/dashboard] Erreur réseau ou rendu:', err);
      setError('Erreur réseau. Vérifiez votre connexion.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  // ─── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <main style={s.page}>
        <div style={s.header}>
          <div style={{ height: 20, width: 160, background: '#E5E7EB', borderRadius: 4 }} />
        </div>
        <div style={s.content}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ height: 90, background: '#F3F4F6', borderRadius: 14, marginBottom: 12 }} />
          ))}
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main style={s.page}>
        <div style={s.header}>
          <button onClick={() => router.back()} style={s.backBtn}>←</button>
          <span style={s.headerTitle}>Tableau de bord</span>
        </div>
        <div style={{ padding: '48px 24px', textAlign: 'center' }}>
          <p style={{ color: '#EF4444', fontSize: 14, marginBottom: 16 }}>{error}</p>
          <button onClick={load} style={s.scanBtn}>Réessayer</button>
        </div>
      </main>
    );
  }

  // À ce stade loading=false, error='', mais data peut théoriquement être null
  // si une branche de code ne l'a pas setté — on redirige plutôt que de crasher
  if (!data) {
    router.replace('/pos/login');
    return null;
  }

  const d = data;

  // ─── Rendu principal ───────────────────────────────────────────────────────

  return (
    <main style={s.page}>

      {/* ── En-tête ── */}
      <div style={s.header}>
        <button onClick={() => router.back()} style={s.backBtn} aria-label="Retour">←</button>
        <span style={s.headerTitle}>Tableau de bord</span>
        <button onClick={load} style={s.refreshBtn} aria-label="Actualiser">↻</button>
      </div>

      <div style={s.content}>

        {/* ── Résumé du jour ── */}
        <section style={s.summaryCard}>
          <p style={s.sectionLabel}>Aujourd&apos;hui · {d.today.count} transaction{d.today.count !== 1 ? 's' : ''}</p>

          <div style={s.bigStat}>
            <span style={s.bigStatLabel}>Total validé</span>
            <span style={s.bigStatValue}>{fmt(d.today.gross)}</span>
          </div>

          <div style={s.statRow}>
            <div style={s.statItem}>
              <span style={s.statLabel}>Commission Kado (2%)</span>
              <span style={{ ...s.statValue, color: '#EF4444' }}>−{fmt(d.today.commission)}</span>
            </div>
            <div style={s.divider} />
            <div style={s.statItem}>
              <span style={s.statLabel}>À recevoir demain T+1</span>
              <span style={{ ...s.statValue, color: '#22C55E' }}>{fmt(d.today.net)}</span>
            </div>
          </div>
        </section>

        {/* ── Bouton Scanner ── */}
        <button onClick={() => router.push('/pos/scan')} style={s.scanBtn}>
          📷 Scanner un bon
        </button>

        {/* ── Transactions du jour ── */}
        <section>
          <p style={s.sectionTitle}>Transactions du jour</p>

          {d.transactions.length === 0 ? (
            <div style={s.emptyBox}>
              <p style={s.emptyText}>Aucune transaction aujourd&apos;hui.</p>
            </div>
          ) : (
            <div style={s.listCard}>
              {d.transactions.map((tx, i) => (
                <div
                  key={tx.id}
                  style={{
                    ...s.txRow,
                    borderBottom: i < d.transactions.length - 1 ? '1px solid #F3F4F6' : 'none',
                  }}
                >
                  <div style={s.txAvatar}>
                    {(tx.beneficiaryMasked?.[0] ?? '?').toUpperCase()}
                  </div>
                  <div style={s.txBody}>
                    <p style={s.txName}>{tx.beneficiaryMasked}</p>
                    <p style={s.txTime}>{fmtTime(tx.createdAt)}</p>
                  </div>
                  <p style={s.txAmount}>{fmt(tx.amount)}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Règlements reçus ── */}
        <section style={{ marginBottom: 32 }}>
          <p style={s.sectionTitle}>Règlements reçus</p>

          {d.settlements.length === 0 ? (
            <div style={s.emptyBox}>
              <p style={s.emptyText}>Aucun règlement enregistré.</p>
            </div>
          ) : (
            <div style={s.listCard}>
              {d.settlements.map((st, i) => {
                const via = st.waveRef ? 'Wave' : st.omRef ? 'Orange Money' : 'Virement';
                return (
                  <div
                    key={st.id}
                    style={{
                      ...s.stRow,
                      borderBottom: i < d.settlements.length - 1 ? '1px solid #F3F4F6' : 'none',
                    }}
                  >
                    <div style={s.stLeft}>
                      <p style={s.stVia}>{via}</p>
                      <p style={s.stDate}>{fmtDate(st.settledAt)}</p>
                    </div>
                    <p style={s.stAmount}>{fmt(st.amount)}</p>
                  </div>
                );
              })}
            </div>
          )}
        </section>

      </div>
    </main>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100dvh',
    background: '#F9FAFB',
  },

  header: {
    background: '#fff',
    borderBottom: '1px solid #F3F4F6',
    padding: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    position: 'sticky',
    top: 0,
    zIndex: 10,
  },

  backBtn: {
    background: 'none',
    border: 'none',
    fontSize: 22,
    color: '#6B7280',
    cursor: 'pointer',
    padding: '2px 6px',
    lineHeight: 1,
    flexShrink: 0,
  },

  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: 700,
    color: '#111827',
  },

  refreshBtn: {
    background: 'none',
    border: 'none',
    fontSize: 20,
    color: '#9CA3AF',
    cursor: 'pointer',
    padding: '2px 6px',
    lineHeight: 1,
  },

  content: {
    maxWidth: 480,
    margin: '0 auto',
    padding: '16px 16px 0',
  },

  // ── Résumé ──
  summaryCard: {
    background: '#534AB7',
    borderRadius: 18,
    padding: '22px 20px',
    marginBottom: 14,
  },

  sectionLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    margin: '0 0 14px',
  },

  bigStat: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 16,
    paddingBottom: 16,
    borderBottom: '1px solid rgba(255,255,255,0.15)',
  },

  bigStatLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
  },

  bigStatValue: {
    fontSize: 26,
    fontWeight: 800,
    color: '#fff',
    letterSpacing: '-0.5px',
  },

  statRow: {
    display: 'flex',
    gap: 0,
    alignItems: 'stretch',
  },

  statItem: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
  },

  divider: {
    width: 1,
    background: 'rgba(255,255,255,0.15)',
    margin: '0 16px',
    flexShrink: 0,
  },

  statLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.55)',
    lineHeight: 1.3,
  },

  statValue: {
    fontSize: 16,
    fontWeight: 700,
  },

  // ── Bouton scanner ──
  scanBtn: {
    width: '100%',
    background: '#111827',
    color: '#fff',
    border: 'none',
    borderRadius: 14,
    padding: '16px',
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    marginBottom: 24,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },

  // ── Listes ──
  sectionTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: '#111827',
    margin: '0 0 10px',
  },

  listCard: {
    background: '#fff',
    borderRadius: 14,
    border: '1px solid #E5E7EB',
    overflow: 'hidden',
    marginBottom: 24,
  },

  // Transactions
  txRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '14px 16px',
  },

  txAvatar: {
    width: 38,
    height: 38,
    borderRadius: '50%',
    background: '#F5F4FF',
    color: '#534AB7',
    fontSize: 15,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  txBody: {
    flex: 1,
    minWidth: 0,
  },

  txName: {
    fontSize: 14,
    fontWeight: 600,
    color: '#111827',
    margin: 0,
    fontFamily: 'monospace',
    letterSpacing: '0.5px',
  },

  txTime: {
    fontSize: 12,
    color: '#9CA3AF',
    margin: '2px 0 0',
  },

  txAmount: {
    fontSize: 15,
    fontWeight: 700,
    color: '#111827',
    margin: 0,
    flexShrink: 0,
  },

  // Règlements
  stRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 16px',
  },

  stLeft: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
  },

  stVia: {
    fontSize: 14,
    fontWeight: 600,
    color: '#111827',
    margin: 0,
  },

  stDate: {
    fontSize: 12,
    color: '#9CA3AF',
    margin: 0,
  },

  stAmount: {
    fontSize: 15,
    fontWeight: 700,
    color: '#22C55E',
    margin: 0,
  },

  emptyBox: {
    background: '#fff',
    border: '1px dashed #E5E7EB',
    borderRadius: 14,
    padding: '24px 16px',
    textAlign: 'center',
    marginBottom: 24,
  },

  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
    margin: 0,
  },
};
