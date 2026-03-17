'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';

interface Transaction {
  id: string;
  merchantName: string;
  amount: number;
  remainingValueAfter: number;
  createdAt: string;
}

function fmt(centimes: number): string {
  return (centimes / 100).toLocaleString('fr-SN') + ' FCFA';
}

function fmtDate(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString('fr-SN', { day: 'numeric', month: 'long', year: 'numeric' }),
    time: d.toLocaleTimeString('fr-SN', { hour: '2-digit', minute: '2-digit' }),
  };
}

export default function VoucherHistoryPage({
  params,
}: {
  params: Promise<{ voucherId: string }>;
}) {
  const { voucherId } = use(params);
  const router = useRouter();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) { router.replace('/app/login'); return; }

    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/vouchers/${voucherId}/transactions`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (r.status === 401) { router.replace('/app/login'); return null; }
        if (!r.ok) { setError('Impossible de charger l\'historique.'); return null; }
        return r.json();
      })
      .then((data) => {
        if (data) {
          // Afficher du plus récent au plus ancien
          setTransactions([...data].reverse());
        }
      })
      .catch(() => setError('Erreur réseau. Vérifiez votre connexion.'))
      .finally(() => setLoading(false));
  }, [voucherId, router]);

  return (
    <main style={s.page}>

      {/* ── En-tête ── */}
      <div style={s.header}>
        <button onClick={() => router.back()} style={s.backBtn} aria-label="Retour">
          ←
        </button>
        <h1 style={s.title}>Historique des utilisations</h1>
      </div>

      {/* ── Contenu ── */}
      {loading && (
        <div style={s.list}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={s.skeleton} />
          ))}
        </div>
      )}

      {!loading && error && (
        <div style={s.emptyBox}>
          <p style={{ color: '#EF4444', fontSize: 14 }}>{error}</p>
        </div>
      )}

      {!loading && !error && transactions.length === 0 && (
        <div style={s.emptyBox}>
          <p style={s.emptyIcon}>🧾</p>
          <p style={s.emptyText}>Aucune utilisation pour ce bon.</p>
        </div>
      )}

      {!loading && !error && transactions.length > 0 && (
        <div style={s.list}>
          {transactions.map((tx, i) => {
            const { date, time } = fmtDate(tx.createdAt);
            const isLast = i === transactions.length - 1;
            return (
              <div key={tx.id} style={{ ...s.row, borderBottom: isLast ? 'none' : '1px solid #F3F4F6' }}>

                {/* Icône */}
                <div style={s.iconWrap}>
                  <span style={s.icon}>🏪</span>
                </div>

                {/* Infos principales */}
                <div style={s.rowBody}>
                  <p style={s.merchant}>{tx.merchantName}</p>
                  <p style={s.datetime}>{date} · {time}</p>
                </div>

                {/* Montants */}
                <div style={s.amounts}>
                  <p style={s.debit}>−{fmt(tx.amount)}</p>
                  <p style={s.remaining}>Solde : {fmt(tx.remainingValueAfter)}</p>
                </div>

              </div>
            );
          })}
        </div>
      )}

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

  title: {
    fontSize: 17,
    fontWeight: 700,
    color: '#111827',
    margin: 0,
  },

  list: {
    maxWidth: 480,
    margin: '16px auto',
    background: '#fff',
    borderRadius: 16,
    border: '1px solid #E5E7EB',
    overflow: 'hidden',
    padding: '0 4px',
  },

  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '16px 16px',
  },

  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    background: '#F5F4FF',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  icon: {
    fontSize: 20,
    lineHeight: 1,
  },

  rowBody: {
    flex: 1,
    minWidth: 0,
  },

  merchant: {
    fontSize: 15,
    fontWeight: 600,
    color: '#111827',
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  datetime: {
    fontSize: 12,
    color: '#9CA3AF',
    margin: '3px 0 0',
  },

  amounts: {
    textAlign: 'right',
    flexShrink: 0,
  },

  debit: {
    fontSize: 16,
    fontWeight: 700,
    color: '#EF4444',
    margin: 0,
  },

  remaining: {
    fontSize: 11,
    color: '#9CA3AF',
    margin: '3px 0 0',
  },

  skeleton: {
    height: 76,
    background: '#F3F4F6',
    borderRadius: 0,
    borderBottom: '1px solid #fff',
  },

  emptyBox: {
    maxWidth: 480,
    margin: '64px auto',
    textAlign: 'center',
    padding: '0 24px',
  },

  emptyIcon: {
    fontSize: 48,
    margin: '0 0 12px',
  },

  emptyText: {
    fontSize: 15,
    color: '#6B7280',
    margin: 0,
  },
};
