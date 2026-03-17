'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import DocumentsTab from './documents-tab';

const API = process.env.NEXT_PUBLIC_API_URL ?? '';

function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const part = token.split('.')[1];
    return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return {};
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Stats {
  activeCompanies: number;
  activeMerchants: number;
  monthlyVolumeIssuedCentimes: number;
  monthlyVouchersCount: number;
  monthlyTransactionVolumeCentimes: number;
  monthlyCommissionCentimes: number;
  monthlyTransactionsCount: number;
  activeBeneficiaries: number;
}

interface AdminCompany {
  id: string;
  name: string;
  siren: string | null;
  status: string;
  plan: string;
  provisionBalance: number;
  email: string | null;
  phone: string | null;
  address: string | null;
  monthlyVouchersCount: number;
  monthlyVolumeCentimes: number;
  createdAt: string;
}

interface AdminMerchant {
  id: string;
  name: string;
  category: string;
  status: string;
  phone: string | null;
  address: string | null;
  monthlyTransactionsCount: number;
  monthlyVolumeCentimes: number;
  createdAt: string;
}

interface Alerts {
  lowProvisionCompanies: Array<{
    id: string;
    name: string;
    provisionBalance: number;
    siren: string | null;
  }>;
  suspiciousMerchants: Array<{
    id: string;
    name: string;
    category: string;
    phone: string | null;
  }>;
}

interface RecentTx {
  id: string;
  amount: number;
  commission: number;
  netAmount: number;
  merchantName: string;
  merchantCategory: string;
  companyName: string;
  beneficiaryMasked: string;
  createdAt: string;
}

interface LedgerStats {
  current: {
    commissionCentimes: number;
    saasCentimes: number;
    settlementsCentimes: number;
    netCentimes: number;
    voucherFloatCentimes: number;
    totalProvisionCentimes: number;
  };
  monthlyBreakdown: Array<{
    month: string;       // YYYY-MM
    commissionCentimes: number;
    saasCentimes: number;
    settlementsCentimes: number;
    netCentimes: number;
  }>;
}

interface WebhookLog {
  id: string;
  provider: 'WAVE' | 'ORANGE_MONEY';
  reference: string;
  status: 'RECEIVED' | 'PROCESSED' | 'FAILED';
  amount: number | null;
  merchantName: string | null;
  receivedAt: string;
  processedAt: string | null;
  error: string | null;
}

interface WebhookData {
  logs: WebhookLog[];
  monthlyProcessedCount: number;
  pendingOver24hCount: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(centimes: number): string {
  return (centimes / 100).toLocaleString('fr-SN') + ' FCFA';
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-SN', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

const COMPANY_STATUS: Record<string, { label: string; color: string }> = {
  ACTIVE:       { label: 'Actif',           color: '#22C55E' },
  SUSPENDED:    { label: 'Suspendu',        color: '#EF4444' },
  PENDING_KYB:  { label: 'KYB en attente',  color: '#F59E0B' },
};

const MERCHANT_STATUS: Record<string, { label: string; color: string }> = {
  ACTIVE:    { label: 'Actif',      color: '#22C55E' },
  SUSPENDED: { label: 'Suspendu',   color: '#EF4444' },
  PENDING:   { label: 'En attente', color: '#F59E0B' },
};

const CATEGORY_LABELS: Record<string, string> = {
  GENERAL:   'Général',
  FOOD:      'Alimentation',
  MOBILITY:  'Mobilité',
  HEALTH:    'Santé',
  RETAIL:    'Commerce',
  EDUCATION: 'Éducation',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminDashboardPage() {
  const router = useRouter();

  const token = typeof window !== 'undefined'
    ? localStorage.getItem('admin_token') ?? '' : '';

  const [stats, setStats] = useState<Stats | null>(null);
  const [companies, setCompanies] = useState<AdminCompany[]>([]);
  const [merchants, setMerchants] = useState<AdminMerchant[]>([]);
  const [alerts, setAlerts] = useState<Alerts | null>(null);
  const [transactions, setTransactions] = useState<RecentTx[]>([]);

  const [statsLoading, setStatsLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'companies' | 'merchants' | 'alerts' | 'transactions' | 'ledger' | 'webhooks' | 'documents'>('companies');

  const [statusUpdating, setStatusUpdating] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState('');

  // Comptabilité
  const [ledgerStats, setLedgerStats] = useState<LedgerStats | null>(null);

  // Webhooks
  const [webhookData, setWebhookData] = useState<WebhookData | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  // ─── Auth guard ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!token) { router.replace('/admin/login'); return; }
    const payload = decodeJwtPayload(token);
    if (payload.role !== 'ADMIN') { router.replace('/admin/login'); }
  }, [token, router]);

  // ─── Load stats ─────────────────────────────────────────────────────────────

  const loadStats = useCallback(async () => {
    if (!token) return;
    setStatsLoading(true);
    try {
      const res = await fetch(`${API}/api/v1/admin/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401 || res.status === 403) { router.replace('/admin/login'); return; }
      const data = await res.json().catch(() => null);
      if (data) setStats(data);
    } finally {
      setStatsLoading(false);
    }
  }, [token, router]);

  useEffect(() => { loadStats(); }, [loadStats]);

  // ─── Load tab data ───────────────────────────────────────────────────────────

  const loadTabData = useCallback(async (tab: typeof activeTab) => {
    if (!token) return;
    setDataLoading(true);
    try {
      if (tab === 'companies') {
        const res = await fetch(`${API}/api/v1/admin/companies`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => []);
        setCompanies(Array.isArray(data) ? data : []);
      } else if (tab === 'merchants') {
        const res = await fetch(`${API}/api/v1/admin/merchants`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => []);
        setMerchants(Array.isArray(data) ? data : []);
      } else if (tab === 'alerts') {
        const res = await fetch(`${API}/api/v1/admin/alerts`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => null);
        if (data) setAlerts(data);
      } else if (tab === 'transactions') {
        const res = await fetch(`${API}/api/v1/admin/transactions`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => []);
        setTransactions(Array.isArray(data) ? data : []);
      } else if (tab === 'ledger') {
        const res = await fetch(`${API}/api/v1/admin/ledger`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => null);
        if (data) setLedgerStats(data);
      } else if (tab === 'webhooks') {
        const res = await fetch(`${API}/api/v1/admin/webhooks`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => null);
        if (data) setWebhookData(data);
      }
    } finally {
      setDataLoading(false);
    }
  }, [token]);

  useEffect(() => { loadTabData(activeTab); }, [activeTab, loadTabData]);

  // ─── Status updates ─────────────────────────────────────────────────────────

  async function updateCompanyStatus(id: string, status: string) {
    setStatusUpdating(id);
    setStatusMsg('');
    try {
      const res = await fetch(`${API}/api/v1/admin/companies/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setStatusMsg('Statut mis à jour.');
        setCompanies((prev) => prev.map((c) => c.id === id ? { ...c, status } : c));
      }
    } finally {
      setStatusUpdating(null);
      setTimeout(() => setStatusMsg(''), 3000);
    }
  }

  async function updateMerchantStatus(id: string, status: string) {
    setStatusUpdating(id);
    setStatusMsg('');
    try {
      const res = await fetch(`${API}/api/v1/admin/merchants/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setStatusMsg('Statut mis à jour.');
        setMerchants((prev) => prev.map((m) => m.id === id ? { ...m, status } : m));
      }
    } finally {
      setStatusUpdating(null);
      setTimeout(() => setStatusMsg(''), 3000);
    }
  }

  async function handleRetryWebhook(id: string) {
    setRetrying(id);
    try {
      const res = await fetch(`${API}/api/v1/admin/webhooks/${id}/retry`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setWebhookData((prev) =>
          prev ? {
            ...prev,
            logs: prev.logs.map((l) =>
              l.id === id ? { ...l, status: 'RECEIVED', error: null, processedAt: null } : l,
            ),
          } : prev,
        );
      }
    } finally {
      setRetrying(null);
    }
  }

  async function handleExportCsv() {
    const res = await fetch(`${API}/api/v1/admin/ledger/export`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `grand-livre-kado-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ─── Rendu ──────────────────────────────────────────────────────────────────

  if (!token) return null;

  return (
    <main style={s.page}>

      {/* ── En-tête ── */}
      <header style={s.header}>
        <div style={s.headerInner}>
          <div>
            <h1 style={s.title}>Kado Admin</h1>
            <p style={s.subtitle}>Tableau de bord opérationnel</p>
          </div>
          <button
            onClick={() => { localStorage.removeItem('admin_token'); router.replace('/admin/login'); }}
            style={s.logoutBtn}
          >
            Déconnexion
          </button>
        </div>
      </header>

      <div style={s.body}>

        {/* ── KPIs ── */}
        {statusMsg && (
          <div style={s.statusBanner}>{statusMsg}</div>
        )}

        <div style={s.kpiGrid}>
          <KpiCard label="Entreprises actives" value={statsLoading ? '…' : String(stats?.activeCompanies ?? 0)} color="#534AB7" icon="🏢" />
          <KpiCard label="Commerçants actifs" value={statsLoading ? '…' : String(stats?.activeMerchants ?? 0)} color="#22C55E" icon="🏪" />
          <KpiCard label="Bénéficiaires actifs" value={statsLoading ? '…' : String(stats?.activeBeneficiaries ?? 0)} color="#3B82F6" icon="👤" />
          <KpiCard label="Bons émis ce mois" value={statsLoading ? '…' : String(stats?.monthlyVouchersCount ?? 0)} color="#F59E0B" icon="🎁" />
          <KpiCard label="Volume émis ce mois" value={statsLoading ? '…' : fmt(stats?.monthlyVolumeIssuedCentimes ?? 0)} color="#8B5CF6" icon="💰" />
          <KpiCard label="Volume validé ce mois" value={statsLoading ? '…' : fmt(stats?.monthlyTransactionVolumeCentimes ?? 0)} color="#0EA5E9" icon="✅" />
          <KpiCard label="Transactions ce mois" value={statsLoading ? '…' : String(stats?.monthlyTransactionsCount ?? 0)} color="#14B8A6" icon="📊" />
          <KpiCard label="Commission encaissée" value={statsLoading ? '…' : fmt(stats?.monthlyCommissionCentimes ?? 0)} color="#EF4444" icon="💹" />
        </div>

        {/* ── Onglets ── */}
        <div style={s.tabs}>
          {(['companies', 'merchants', 'alerts', 'transactions', 'ledger', 'webhooks', 'documents'] as const).map((tab) => {
            const labels = {
              companies:    'Entreprises',
              merchants:    'Commerçants',
              alerts:       'Alertes',
              transactions: 'Transactions',
              ledger:       'Comptabilité',
              webhooks:     'Webhooks EME',
              documents:    'Documents',
            };
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{ ...s.tab, ...(activeTab === tab ? s.tabActive : {}) }}
              >
                {tab === 'alerts' && alerts && (alerts.lowProvisionCompanies.length + alerts.suspiciousMerchants.length) > 0 && (
                  <span style={s.alertDot} />
                )}
                {tab === 'webhooks' && webhookData && webhookData.pendingOver24hCount > 0 && (
                  <span style={{ ...s.alertDot, background: '#F59E0B' }} />
                )}
                {labels[tab]}
              </button>
            );
          })}
        </div>

        {/* ── Contenu ── */}
        <div style={s.content}>
          {dataLoading && <div style={s.loadingBar} />}

          {/* Entreprises */}
          {activeTab === 'companies' && (
            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Entreprise</th>
                    <th style={s.th}>NINEA</th>
                    <th style={s.th}>Provision</th>
                    <th style={s.th}>Bons ce mois</th>
                    <th style={s.th}>Volume ce mois</th>
                    <th style={s.th}>Plan</th>
                    <th style={s.th}>Statut</th>
                    <th style={s.th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {companies.length === 0 && !dataLoading && (
                    <tr><td colSpan={8} style={s.emptyCell}>Aucune entreprise.</td></tr>
                  )}
                  {companies.map((c) => {
                    const st = COMPANY_STATUS[c.status] ?? { label: c.status, color: '#9CA3AF' };
                    return (
                      <tr key={c.id} style={s.tr}>
                        <td style={s.td}>
                          <p style={s.cellPrimary}>{c.name}</p>
                          {c.email && <p style={s.cellSub}>{c.email}</p>}
                        </td>
                        <td style={s.td}><span style={s.mono}>{c.siren ?? '—'}</span></td>
                        <td style={s.td}>
                          <span style={{ ...s.cellPrimary, color: c.provisionBalance < 1_000_000 ? '#EF4444' : '#111827' }}>
                            {fmt(c.provisionBalance)}
                          </span>
                        </td>
                        <td style={{ ...s.td, textAlign: 'center' }}>{c.monthlyVouchersCount}</td>
                        <td style={s.td}>{fmt(c.monthlyVolumeCentimes)}</td>
                        <td style={s.td}>
                          <span style={{ ...s.badge, background: c.plan === 'PREMIUM' ? '#F5F4FF' : '#F3F4F6', color: c.plan === 'PREMIUM' ? '#534AB7' : '#6B7280' }}>
                            {c.plan}
                          </span>
                        </td>
                        <td style={s.td}>
                          <span style={{ ...s.badge, color: st.color, borderColor: st.color }}>{st.label}</span>
                        </td>
                        <td style={s.td}>
                          <div style={s.actionRow}>
                            {c.status !== 'ACTIVE' && (
                              <button
                                onClick={() => updateCompanyStatus(c.id, 'ACTIVE')}
                                disabled={statusUpdating === c.id}
                                style={{ ...s.actionBtn, ...s.activateBtn }}
                              >
                                Activer
                              </button>
                            )}
                            {c.status !== 'SUSPENDED' && (
                              <button
                                onClick={() => updateCompanyStatus(c.id, 'SUSPENDED')}
                                disabled={statusUpdating === c.id}
                                style={{ ...s.actionBtn, ...s.suspendBtn }}
                              >
                                Suspendre
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Commerçants */}
          {activeTab === 'merchants' && (
            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Commerçant</th>
                    <th style={s.th}>Catégorie</th>
                    <th style={s.th}>Adresse</th>
                    <th style={s.th}>Tx ce mois</th>
                    <th style={s.th}>Volume ce mois</th>
                    <th style={s.th}>Statut</th>
                    <th style={s.th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {merchants.length === 0 && !dataLoading && (
                    <tr><td colSpan={7} style={s.emptyCell}>Aucun commerçant.</td></tr>
                  )}
                  {merchants.map((m) => {
                    const st = MERCHANT_STATUS[m.status] ?? { label: m.status, color: '#9CA3AF' };
                    return (
                      <tr key={m.id} style={s.tr}>
                        <td style={s.td}>
                          <p style={s.cellPrimary}>{m.name}</p>
                          {m.phone && <p style={s.cellSub}>{m.phone}</p>}
                        </td>
                        <td style={s.td}>
                          <span style={s.badge}>{CATEGORY_LABELS[m.category] ?? m.category}</span>
                        </td>
                        <td style={s.td}><span style={s.cellSub}>{m.address ?? '—'}</span></td>
                        <td style={{ ...s.td, textAlign: 'center' }}>{m.monthlyTransactionsCount}</td>
                        <td style={s.td}>{fmt(m.monthlyVolumeCentimes)}</td>
                        <td style={s.td}>
                          <span style={{ ...s.badge, color: st.color, borderColor: st.color }}>{st.label}</span>
                        </td>
                        <td style={s.td}>
                          <div style={s.actionRow}>
                            {m.status !== 'ACTIVE' && (
                              <button
                                onClick={() => updateMerchantStatus(m.id, 'ACTIVE')}
                                disabled={statusUpdating === m.id}
                                style={{ ...s.actionBtn, ...s.activateBtn }}
                              >
                                Activer
                              </button>
                            )}
                            {m.status !== 'SUSPENDED' && (
                              <button
                                onClick={() => updateMerchantStatus(m.id, 'SUSPENDED')}
                                disabled={statusUpdating === m.id}
                                style={{ ...s.actionBtn, ...s.suspendBtn }}
                              >
                                Suspendre
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Alertes */}
          {activeTab === 'alerts' && (
            <div style={s.alertsGrid}>

              {/* Provision faible */}
              <section style={s.alertSection}>
                <h2 style={s.alertTitle}>
                  <span style={s.alertIcon}>⚠️</span>
                  Provision insuffisante
                  <span style={{ ...s.alertCount, background: '#FEF3C7', color: '#92400E' }}>
                    {alerts?.lowProvisionCompanies.length ?? 0}
                  </span>
                </h2>
                {!alerts || alerts.lowProvisionCompanies.length === 0 ? (
                  <div style={s.alertEmpty}>Aucune alerte de provision.</div>
                ) : (
                  <div style={s.alertList}>
                    {alerts.lowProvisionCompanies.map((c) => (
                      <div key={c.id} style={s.alertRow}>
                        <div>
                          <p style={s.alertName}>{c.name}</p>
                          {c.siren && <p style={s.alertSub}>NINEA : {c.siren}</p>}
                        </div>
                        <span style={{ ...s.alertValue, color: '#EF4444' }}>
                          {fmt(c.provisionBalance)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Fraude */}
              <section style={s.alertSection}>
                <h2 style={s.alertTitle}>
                  <span style={s.alertIcon}>🚨</span>
                  Transactions suspectes
                  <span style={{ ...s.alertCount, background: '#FEE2E2', color: '#991B1B' }}>
                    {alerts?.suspiciousMerchants.length ?? 0}
                  </span>
                </h2>
                {!alerts || alerts.suspiciousMerchants.length === 0 ? (
                  <div style={s.alertEmpty}>Aucun commerçant suspect détecté aujourd&apos;hui.</div>
                ) : (
                  <div style={s.alertList}>
                    {alerts.suspiciousMerchants.map((m) => (
                      <div key={m.id} style={s.alertRow}>
                        <div>
                          <p style={s.alertName}>{m.name}</p>
                          <p style={s.alertSub}>{CATEGORY_LABELS[m.category] ?? m.category} · {m.phone ?? '—'}</p>
                        </div>
                        <button
                          onClick={() => updateMerchantStatus(m.id, 'SUSPENDED')}
                          disabled={statusUpdating === m.id}
                          style={{ ...s.actionBtn, ...s.suspendBtn }}
                        >
                          Suspendre
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

            </div>
          )}

          {/* Transactions récentes */}
          {activeTab === 'transactions' && (
            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Date & heure</th>
                    <th style={s.th}>Bénéficiaire</th>
                    <th style={s.th}>Commerçant</th>
                    <th style={s.th}>Entreprise</th>
                    <th style={s.th}>Montant</th>
                    <th style={s.th}>Commission</th>
                    <th style={s.th}>Net</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.length === 0 && !dataLoading && (
                    <tr><td colSpan={7} style={s.emptyCell}>Aucune transaction.</td></tr>
                  )}
                  {transactions.map((tx) => (
                    <tr key={tx.id} style={s.tr}>
                      <td style={s.td}><span style={s.cellSub}>{fmtDateTime(tx.createdAt)}</span></td>
                      <td style={s.td}><span style={s.mono}>{tx.beneficiaryMasked}</span></td>
                      <td style={s.td}>
                        <p style={s.cellPrimary}>{tx.merchantName}</p>
                        <p style={s.cellSub}>{CATEGORY_LABELS[tx.merchantCategory] ?? tx.merchantCategory}</p>
                      </td>
                      <td style={s.td}>{tx.companyName}</td>
                      <td style={s.td}><span style={s.cellPrimary}>{fmt(tx.amount)}</span></td>
                      <td style={s.td}><span style={{ color: '#EF4444' }}>−{fmt(tx.commission)}</span></td>
                      <td style={s.td}><span style={{ color: '#22C55E' }}>{fmt(tx.netAmount)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {/* ── Comptabilité ── */}
          {activeTab === 'ledger' && (
            <div>
              {/* Bouton export */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                <button onClick={handleExportCsv} style={s.exportBtn}>
                  ↓ Exporter le grand livre CSV
                </button>
              </div>

              {/* KPIs comptables */}
              <div style={s.ledgerKpiGrid}>
                <LedgerKpiCard
                  label="Commissions encaissées"
                  sublabel="ce mois (REVENUE_COMMISSION)"
                  value={ledgerStats ? fmt(ledgerStats.current.commissionCentimes) : '…'}
                  color="#22C55E"
                  sign="+"
                />
                <LedgerKpiCard
                  label="Abonnements SaaS"
                  sublabel="ce mois (REVENUE_SAAS)"
                  value={ledgerStats ? fmt(ledgerStats.current.saasCentimes) : '…'}
                  color="#3B82F6"
                  sign="+"
                />
                <LedgerKpiCard
                  label="Reversements commerçants"
                  sublabel="ce mois (MERCHANT_SETTLED)"
                  value={ledgerStats ? fmt(ledgerStats.current.settlementsCentimes) : '…'}
                  color="#EF4444"
                  sign="−"
                />
                <LedgerKpiCard
                  label="Solde net Kado"
                  sublabel="Entrées − Sorties ce mois"
                  value={ledgerStats ? fmt(ledgerStats.current.netCentimes) : '…'}
                  color={ledgerStats && ledgerStats.current.netCentimes >= 0 ? '#22C55E' : '#EF4444'}
                  sign="="
                  highlight
                />
                <LedgerKpiCard
                  label="Float VOUCHER_LIABILITY"
                  sublabel="Bons actifs non encaissés"
                  value={ledgerStats ? fmt(ledgerStats.current.voucherFloatCentimes) : '…'}
                  color="#8B5CF6"
                  sign="~"
                />
                <LedgerKpiCard
                  label="Provision totale"
                  sublabel="PROVISION_COMPANY — toutes entreprises"
                  value={ledgerStats ? fmt(ledgerStats.current.totalProvisionCentimes) : '…'}
                  color="#F59E0B"
                  sign="~"
                />
              </div>

              {/* Tableau 6 derniers mois */}
              <div style={{ ...s.tableWrap, marginTop: 20 }}>
                <div style={s.tableHeader}>
                  <span style={s.tableHeaderTitle}>Historique mensuel — 6 derniers mois</span>
                </div>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>Mois</th>
                      <th style={{ ...s.th, textAlign: 'right' }}>Commissions</th>
                      <th style={{ ...s.th, textAlign: 'right' }}>SaaS</th>
                      <th style={{ ...s.th, textAlign: 'right' }}>Reversements</th>
                      <th style={{ ...s.th, textAlign: 'right' }}>Solde net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!ledgerStats && (
                      <tr><td colSpan={5} style={s.emptyCell}>Chargement…</td></tr>
                    )}
                    {ledgerStats?.monthlyBreakdown.map((row) => {
                      const [year, month] = row.month.split('-');
                      const label = new Date(parseInt(year), parseInt(month) - 1, 1)
                        .toLocaleDateString('fr-SN', { month: 'long', year: 'numeric' });
                      const isPositive = row.netCentimes >= 0;
                      return (
                        <tr key={row.month} style={s.tr}>
                          <td style={s.td}><span style={s.cellPrimary}>{label}</span></td>
                          <td style={{ ...s.td, textAlign: 'right' }}>
                            <span style={{ color: '#22C55E', fontWeight: 600 }}>{fmt(row.commissionCentimes)}</span>
                          </td>
                          <td style={{ ...s.td, textAlign: 'right' }}>
                            <span style={{ color: '#3B82F6', fontWeight: 600 }}>{fmt(row.saasCentimes)}</span>
                          </td>
                          <td style={{ ...s.td, textAlign: 'right' }}>
                            <span style={{ color: '#EF4444', fontWeight: 600 }}>−{fmt(row.settlementsCentimes)}</span>
                          </td>
                          <td style={{ ...s.td, textAlign: 'right' }}>
                            <span style={{ color: isPositive ? '#22C55E' : '#EF4444', fontWeight: 700 }}>
                              {isPositive ? '+' : ''}{fmt(row.netCentimes)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Documents ── */}
          {activeTab === 'documents' && (
            <DocumentsTab token={token} />
          )}

          {/* ── Webhooks EME ── */}
          {activeTab === 'webhooks' && (
            <div>
              {/* Header métriques */}
              <div style={s.webhookHeader}>
                <div style={s.webhookStat}>
                  <span style={s.webhookStatValue}>{webhookData?.monthlyProcessedCount ?? '…'}</span>
                  <span style={s.webhookStatLabel}>Webhooks traités ce mois</span>
                </div>
                {webhookData && webhookData.pendingOver24hCount > 0 && (
                  <div style={s.webhookAlert}>
                    <span style={s.webhookAlertIcon}>🔴</span>
                    <span style={s.webhookAlertText}>
                      {webhookData.pendingOver24hCount} webhook{webhookData.pendingOver24hCount > 1 ? 's' : ''} en attente depuis plus de 24h
                    </span>
                  </div>
                )}
              </div>

              {/* Table */}
              <div style={s.tableWrap}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>Reçu le</th>
                      <th style={s.th}>Provider</th>
                      <th style={s.th}>Référence</th>
                      <th style={s.th}>Montant</th>
                      <th style={s.th}>Commerçant</th>
                      <th style={s.th}>Statut</th>
                      <th style={s.th}>Traité le</th>
                      <th style={s.th}>Erreur</th>
                      <th style={s.th}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(!webhookData || webhookData.logs.length === 0) && !dataLoading && (
                      <tr>
                        <td colSpan={9} style={s.emptyCell}>
                          Aucun webhook enregistré. Les webhooks Wave et Orange Money apparaîtront ici.
                        </td>
                      </tr>
                    )}
                    {webhookData?.logs.map((log) => {
                      const isOver24h = log.status === 'RECEIVED' &&
                        (Date.now() - new Date(log.receivedAt).getTime()) > 24 * 60 * 60 * 1000;
                      return (
                        <tr key={log.id} style={{ ...s.tr, background: isOver24h ? 'rgba(245,158,11,0.05)' : undefined }}>
                          <td style={s.td}>
                            <span style={s.cellSub}>{fmtDateTime(log.receivedAt)}</span>
                          </td>
                          <td style={s.td}>
                            <span style={{
                              ...s.badge,
                              color: log.provider === 'WAVE' ? '#38BDF8' : '#FB923C',
                              borderColor: log.provider === 'WAVE' ? '#38BDF8' : '#FB923C',
                            }}>
                              {log.provider === 'WAVE' ? 'Wave' : 'Orange Money'}
                            </span>
                          </td>
                          <td style={s.td}>
                            <span style={s.mono}>{log.reference.slice(0, 16)}…</span>
                          </td>
                          <td style={s.td}>
                            {log.amount != null ? (
                              <span style={s.cellPrimary}>{fmt(log.amount)}</span>
                            ) : (
                              <span style={s.cellSub}>—</span>
                            )}
                          </td>
                          <td style={s.td}>
                            <span style={s.cellSub}>{log.merchantName ?? '—'}</span>
                          </td>
                          <td style={s.td}>
                            <WebhookStatusBadge status={log.status} isOver24h={isOver24h} />
                          </td>
                          <td style={s.td}>
                            <span style={s.cellSub}>
                              {log.processedAt ? fmtDateTime(log.processedAt) : '—'}
                            </span>
                          </td>
                          <td style={{ ...s.td, maxWidth: 200 }}>
                            {log.error ? (
                              <span style={{ ...s.cellSub, color: '#FCA5A5', wordBreak: 'break-all' }}>
                                {log.error.slice(0, 80)}{log.error.length > 80 ? '…' : ''}
                              </span>
                            ) : (
                              <span style={s.cellSub}>—</span>
                            )}
                          </td>
                          <td style={s.td}>
                            {(log.status === 'FAILED' || log.status === 'RECEIVED') && (
                              <button
                                onClick={() => handleRetryWebhook(log.id)}
                                disabled={retrying === log.id}
                                style={{ ...s.actionBtn, background: '#1E3A5F', color: '#93C5FD' }}
                              >
                                {retrying === log.id ? '…' : 'Relancer'}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      </div>
    </main>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, color, icon }: { label: string; value: string; color: string; icon: string }) {
  return (
    <div style={s.kpiCard}>
      <div style={s.kpiTop}>
        <span style={s.kpiIcon}>{icon}</span>
        <span style={{ ...s.kpiValue, color }}>{value}</span>
      </div>
      <p style={s.kpiLabel}>{label}</p>
    </div>
  );
}

// ─── LedgerKpiCard ────────────────────────────────────────────────────────────

function LedgerKpiCard({ label, sublabel, value, color, sign, highlight }: {
  label: string;
  sublabel: string;
  value: string;
  color: string;
  sign: string;
  highlight?: boolean;
}) {
  return (
    <div style={{
      background: highlight ? 'rgba(83,74,183,0.12)' : '#1E293B',
      borderRadius: 14,
      padding: '18px 20px',
      border: highlight ? '1px solid rgba(83,74,183,0.4)' : '1px solid #334155',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 22, fontWeight: 800, color, letterSpacing: '-0.5px', lineHeight: 1 }}>
          {value}
        </span>
        <span style={{
          fontSize: 18,
          fontWeight: 900,
          color,
          opacity: 0.6,
          lineHeight: 1,
          flexShrink: 0,
          marginLeft: 8,
        }}>
          {sign}
        </span>
      </div>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#CBD5E1' }}>{label}</p>
      <p style={{ margin: '3px 0 0', fontSize: 11, color: '#475569', fontFamily: 'monospace' }}>{sublabel}</p>
    </div>
  );
}

// ─── WebhookStatusBadge ───────────────────────────────────────────────────────

function WebhookStatusBadge({ status, isOver24h }: {
  status: 'RECEIVED' | 'PROCESSED' | 'FAILED';
  isOver24h: boolean;
}) {
  const config = {
    RECEIVED: { label: isOver24h ? 'En attente +24h' : 'Reçu', color: isOver24h ? '#F59E0B' : '#94A3B8', border: isOver24h ? '#F59E0B' : '#334155' },
    PROCESSED: { label: 'Traité', color: '#22C55E', border: '#22C55E' },
    FAILED: { label: 'Échoué', color: '#EF4444', border: '#EF4444' },
  }[status];
  return (
    <span style={{
      display: 'inline-block',
      fontSize: 11,
      fontWeight: 700,
      border: `1px solid ${config.border}`,
      borderRadius: 4,
      padding: '2px 8px',
      color: config.color,
      whiteSpace: 'nowrap',
    }}>
      {config.label}
    </span>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100dvh',
    background: '#0F172A',
  },

  // Header
  header: {
    background: '#1E293B',
    borderBottom: '1px solid #334155',
    padding: '0 24px',
  },
  headerInner: {
    maxWidth: 1400,
    margin: '0 auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 0',
  },
  title: {
    fontSize: 20,
    fontWeight: 800,
    color: '#F1F5F9',
    margin: 0,
    letterSpacing: '-0.5px',
  },
  subtitle: {
    fontSize: 13,
    color: '#94A3B8',
    margin: '2px 0 0',
  },
  logoutBtn: {
    background: 'none',
    border: '1px solid #334155',
    borderRadius: 8,
    padding: '7px 16px',
    fontSize: 13,
    fontWeight: 600,
    color: '#94A3B8',
    cursor: 'pointer',
  },

  body: {
    maxWidth: 1400,
    margin: '0 auto',
    padding: '24px 24px 48px',
  },

  statusBanner: {
    background: '#D1FAE5',
    border: '1px solid #6EE7B7',
    borderRadius: 8,
    padding: '10px 16px',
    fontSize: 14,
    color: '#065F46',
    fontWeight: 500,
    marginBottom: 16,
  },

  // KPIs
  kpiGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: 12,
    marginBottom: 24,
  },
  kpiCard: {
    background: '#1E293B',
    borderRadius: 14,
    padding: '16px 18px',
    border: '1px solid #334155',
  },
  kpiTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  kpiIcon: {
    fontSize: 20,
  },
  kpiValue: {
    fontSize: 22,
    fontWeight: 800,
    letterSpacing: '-0.5px',
    textAlign: 'right',
    flex: 1,
  },
  kpiLabel: {
    fontSize: 12,
    color: '#64748B',
    margin: 0,
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.3px',
  },

  // Tabs
  tabs: {
    display: 'flex',
    gap: 0,
    borderBottom: '1px solid #334155',
    marginBottom: 20,
    position: 'relative',
  },
  tab: {
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    marginBottom: -1,
    padding: '10px 20px',
    fontSize: 14,
    fontWeight: 600,
    color: '#64748B',
    cursor: 'pointer',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  tabActive: {
    color: '#F1F5F9',
    borderBottomColor: '#534AB7',
  },
  alertDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: '#EF4444',
    flexShrink: 0,
  },

  content: {
    position: 'relative',
    minHeight: 200,
  },
  loadingBar: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 3,
    background: 'linear-gradient(90deg, #534AB7 0%, #818CF8 50%, #534AB7 100%)',
    backgroundSize: '200% 100%',
    borderRadius: 2,
    animation: 'loading 1.2s linear infinite',
    zIndex: 1,
  },

  // Table
  tableWrap: {
    background: '#1E293B',
    borderRadius: 14,
    border: '1px solid #334155',
    overflow: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
  },
  th: {
    padding: '12px 16px',
    textAlign: 'left',
    fontSize: 11,
    fontWeight: 700,
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    borderBottom: '1px solid #334155',
    whiteSpace: 'nowrap',
  },
  tr: {
    borderBottom: '1px solid #1E293B',
  },
  td: {
    padding: '12px 16px',
    borderBottom: '1px solid #334155',
    verticalAlign: 'middle',
  },
  emptyCell: {
    padding: '32px 16px',
    textAlign: 'center',
    color: '#475569',
    fontSize: 14,
  },
  cellPrimary: {
    fontSize: 13,
    fontWeight: 600,
    color: '#F1F5F9',
    margin: 0,
  },
  cellSub: {
    fontSize: 12,
    color: '#64748B',
    margin: '2px 0 0',
  },
  mono: {
    fontFamily: 'monospace',
    fontSize: 13,
    color: '#94A3B8',
  },
  badge: {
    display: 'inline-block',
    fontSize: 11,
    fontWeight: 600,
    border: '1px solid #334155',
    borderRadius: 4,
    padding: '2px 8px',
    color: '#94A3B8',
    whiteSpace: 'nowrap',
  },

  // Actions
  actionRow: {
    display: 'flex',
    gap: 6,
  },
  actionBtn: {
    fontSize: 12,
    fontWeight: 600,
    border: 'none',
    borderRadius: 6,
    padding: '5px 12px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  activateBtn: {
    background: '#14532D',
    color: '#86EFAC',
  },
  suspendBtn: {
    background: '#450A0A',
    color: '#FCA5A5',
  },

  // Alerts
  alertsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 20,
  },
  alertSection: {
    background: '#1E293B',
    borderRadius: 14,
    border: '1px solid #334155',
    padding: '20px',
  },
  alertTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: '#F1F5F9',
    margin: '0 0 16px',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  alertIcon: {
    fontSize: 16,
  },
  alertCount: {
    fontSize: 12,
    fontWeight: 700,
    borderRadius: 99,
    padding: '2px 8px',
    marginLeft: 'auto',
  },
  alertEmpty: {
    padding: '20px 0',
    textAlign: 'center',
    color: '#475569',
    fontSize: 13,
  },
  alertList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
  },
  alertRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 0',
    borderBottom: '1px solid #334155',
    gap: 12,
  },
  alertName: {
    fontSize: 13,
    fontWeight: 600,
    color: '#F1F5F9',
    margin: 0,
  },
  alertSub: {
    fontSize: 12,
    color: '#64748B',
    margin: '2px 0 0',
  },
  alertValue: {
    fontSize: 14,
    fontWeight: 700,
    flexShrink: 0,
  },

  // Ledger
  ledgerKpiGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: 12,
    marginBottom: 8,
  },
  exportBtn: {
    background: '#1E293B',
    border: '1px solid #334155',
    borderRadius: 8,
    padding: '8px 18px',
    fontSize: 13,
    fontWeight: 600,
    color: '#94A3B8',
    cursor: 'pointer',
  },
  tableHeader: {
    padding: '12px 16px',
    borderBottom: '1px solid #334155',
  },
  tableHeaderTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: '#94A3B8',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },

  // Webhooks
  webhookHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 20,
    marginBottom: 16,
    flexWrap: 'wrap' as const,
  },
  webhookStat: {
    background: '#1E293B',
    border: '1px solid #334155',
    borderRadius: 12,
    padding: '14px 20px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
  },
  webhookStatValue: {
    fontSize: 28,
    fontWeight: 800,
    color: '#F1F5F9',
    letterSpacing: '-1px',
  },
  webhookStatLabel: {
    fontSize: 12,
    fontWeight: 500,
    color: '#64748B',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.4px',
  },
  webhookAlert: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    background: 'rgba(245,158,11,0.1)',
    border: '1px solid rgba(245,158,11,0.3)',
    borderRadius: 10,
    padding: '12px 18px',
  },
  webhookAlertIcon: {
    fontSize: 18,
    flexShrink: 0,
  },
  webhookAlertText: {
    fontSize: 13,
    fontWeight: 600,
    color: '#FCD34D',
  },
};
