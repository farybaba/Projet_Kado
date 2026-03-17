'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL ?? '';
const IS_DEV = process.env.NEXT_PUBLIC_APP_ENV === 'development';

function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const part = token.split('.')[1];
    return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return {};
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Company {
  id: string;
  name: string;
  provisionBalance: number;
}

interface Voucher {
  id: string;
  beneficiaryPhone: string;
  nominalValue: number;
  remainingValue: number;
  status: string;
  type: string;
  note?: string;
  issuedAt: string;
}

interface Invitation {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  poste: string | null;
  status: string;
  createdAt: string;
  expiresAt: string;
}

interface ImpactData {
  educationAmountCentimes: number;
  uniqueMerchantCount: number;
  uniqueBeneficiaryCount: number;
}

const TYPE_OPTIONS = [
  { value: 'GIFT_VOUCHER', label: 'Cadeau' },
  { value: 'MEAL_TICKET',  label: 'Ticket repas' },
  { value: 'TRANSPORT',    label: 'Transport' },
  { value: 'BONUS',        label: 'Bonus' },
];

const INV_STATUS: Record<string, { label: string; color: string }> = {
  PENDING:  { label: 'En attente', color: '#F59E0B' },
  ACCEPTED: { label: 'Acceptée',   color: '#22C55E' },
  EXPIRED:  { label: 'Expirée',    color: '#EF4444' },
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  PENDING:   { label: 'En attente', color: '#F59E0B' },
  ISSUED:    { label: 'Actif',      color: '#22C55E' },
  PARTIAL:   { label: 'Partiel',    color: '#3B82F6' },
  USED:      { label: 'Utilisé',    color: '#9CA3AF' },
  EXPIRED:   { label: 'Expiré',     color: '#EF4444' },
  CANCELLED: { label: 'Annulé',     color: '#6B7280' },
};

const ERROR_LABELS: Record<string, string> = {
  INSUFFICIENT_PROVISION: 'Provision insuffisante pour émettre ce bon.',
  INVALID_PHONE:          'Numéro de téléphone invalide.',
};

function formatFcfa(centimes: number): string {
  return (centimes / 100).toLocaleString('fr-SN') + ' FCFA';
}

function isValidPhone(raw: string): boolean {
  return /^[0-9]{9}$/.test(raw.replace(/\D/g, ''));
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const [company, setCompany] = useState<Company | null>(null);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);

  // Formulaire d'émission
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState('GIFT_VOUCHER');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Onglet actif
  const [activeTab, setActiveTab] = useState<'bons' | 'collaborateurs' | 'rse'>('bons');

  // RSE & Impact
  const [impactData, setImpactData] = useState<ImpactData | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);

  // Simulation webhook EME (dev uniquement)
  const [confirming, setConfirming] = useState(false);
  const [confirmMsg, setConfirmMsg] = useState('');

  // Invitations
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [invLoading, setInvLoading] = useState(false);
  const [invFirstName, setInvFirstName] = useState('');
  const [invLastName, setInvLastName] = useState('');
  const [invPhone, setInvPhone] = useState('');
  const [invPoste, setInvPoste] = useState('');
  const [invSubmitting, setInvSubmitting] = useState(false);
  const [invError, setInvError] = useState('');
  const [invSuccess, setInvSuccess] = useState('');

  // Import CSV (conservé)
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; errors: unknown[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const token = typeof window !== 'undefined'
    ? localStorage.getItem('company_token') ?? ''
    : '';

  const companyId = (() => {
    if (typeof window === 'undefined') return '';
    const payload = decodeJwtPayload(token);
    return (payload.companyId as string) ?? '';
  })();

  // ─── Chargement des données ─────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [companyRes, vouchersRes] = await Promise.all([
        fetch(`${API}/api/v1/companies/${companyId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API}/api/v1/companies/${companyId}/vouchers`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (companyRes.status === 401) {
        router.replace('/dashboard/login');
        return;
      }

      const companyData = await companyRes.json();
      const vouchersData = await vouchersRes.json().catch(() => []);

      setCompany({ id: companyData.id, name: companyData.name, provisionBalance: companyData.provisionBalance ?? 0 });
      setVouchers(Array.isArray(vouchersData) ? vouchersData : []);
    } finally {
      setLoading(false);
    }
  }, [companyId, token, router]);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── Statistiques calculées ─────────────────────────────────────────────────

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const issuedThisMonth = vouchers.filter(
    (v) => new Date(v.issuedAt) >= startOfMonth,
  ).length;
  const activeVouchers = vouchers.filter(
    (v) => v.status === 'ISSUED' || v.status === 'PARTIAL',
  ).length;

  // ─── Émission d'un bon ──────────────────────────────────────────────────────

  async function handleIssue(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setSuccessMsg('');

    if (!isValidPhone(phone)) {
      setFormError('Numéro invalide — 9 chiffres après +221');
      return;
    }

    const amountFcfa = parseInt(amount, 10);
    if (!amountFcfa || amountFcfa < 1) {
      setFormError('Montant invalide');
      return;
    }

    const nominalValue = amountFcfa * 100; // FCFA → centimes
    const beneficiaryPhone = '+221' + phone.replace(/\D/g, '');

    setSubmitting(true);
    try {
      const res = await fetch(`${API}/api/v1/companies/${companyId}/vouchers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          beneficiaryPhone,
          nominalValue,
          type,
          note: note.trim() || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const knownCode = data?.code as string | undefined;
        setFormError(ERROR_LABELS[knownCode ?? ''] ?? data?.message ?? 'Erreur lors de l\'émission.');
        return;
      }

      setSuccessMsg(`Bon de ${formatFcfa(nominalValue)} envoyé à +221${phone.replace(/\D/g, '')}`);
      setPhone('');
      setAmount('');
      setNote('');
      setType('GIFT_VOUCHER');
      // Recharger les données pour mettre à jour provision + liste
      loadData();
    } catch {
      setFormError('Erreur réseau. Vérifiez votre connexion.');
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Simulation webhook EME ─────────────────────────────────────────────────

  async function handleConfirmVouchers() {
    setConfirming(true);
    setConfirmMsg('');
    try {
      const res = await fetch(`${API}/api/v1/dev/confirm-vouchers`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      setConfirmMsg(`${data.confirmed ?? 0} bon(s) confirmé(s)`);
      loadData();
    } catch {
      setConfirmMsg('Erreur réseau');
    } finally {
      setConfirming(false);
    }
  }

  // ─── Chargement invitations ─────────────────────────────────────────────────

  const loadInvitations = useCallback(async () => {
    if (!companyId) return;
    setInvLoading(true);
    try {
      const res = await fetch(`${API}/api/v1/companies/${companyId}/invitations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => []);
      setInvitations(Array.isArray(data) ? data : []);
    } finally {
      setInvLoading(false);
    }
  }, [companyId, token]);

  const loadImpact = useCallback(async () => {
    if (!companyId) return;
    setImpactLoading(true);
    try {
      const res = await fetch(`${API}/api/v1/companies/${companyId}/impact`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data) setImpactData(data);
    } finally {
      setImpactLoading(false);
    }
  }, [companyId, token]);

  useEffect(() => {
    if (activeTab === 'collaborateurs') loadInvitations();
    if (activeTab === 'rse') loadImpact();
  }, [activeTab, loadInvitations, loadImpact]);

  // ─── Import CSV ─────────────────────────────────────────────────────────────

  async function handleCsvImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${API}/api/v1/companies/${companyId}/vouchers/import`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const result = await res.json();
    setImportResult(result);
    setImporting(false);
    loadData();
  }

  // ─── Invitation ─────────────────────────────────────────────────────────────

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInvError('');
    setInvSuccess('');
    if (!isValidPhone(invPhone)) {
      setInvError('Numéro invalide — 9 chiffres après +221');
      return;
    }
    setInvSubmitting(true);
    try {
      const res = await fetch(`${API}/api/v1/companies/${companyId}/invitations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          firstName: invFirstName.trim() || undefined,
          lastName: invLastName.trim() || undefined,
          phone: '+221' + invPhone.replace(/\D/g, ''),
          poste: invPoste.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setInvError(data?.message ?? 'Erreur lors de l\'envoi.');
        return;
      }
      setInvSuccess('Invitation envoyée par SMS.');
      setInvFirstName(''); setInvLastName(''); setInvPhone(''); setInvPoste('');
      loadInvitations();
    } catch {
      setInvError('Erreur réseau. Vérifiez votre connexion.');
    } finally {
      setInvSubmitting(false);
    }
  }

  async function handleResend(inv: Invitation) {
    if (!inv.phone) return;
    try {
      await fetch(`${API}/api/v1/companies/${companyId}/invitations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          firstName: inv.firstName ?? undefined,
          lastName: inv.lastName ?? undefined,
          phone: inv.phone,
          poste: inv.poste ?? undefined,
        }),
      });
      loadInvitations();
    } catch { /* silencieux */ }
  }

  // ─── Rendu ──────────────────────────────────────────────────────────────────

  if (!token || !companyId) {
    if (typeof window !== 'undefined') router.replace('/dashboard/login');
    return null;
  }

  if (loading) return <main style={s.page}><LoadingSkeleton /></main>;

  return (
    <main style={s.page}>

      {/* ── En-tête ── */}
      <div style={s.header}>
        <div>
          <h1 style={s.title}>Dashboard RH</h1>
          {company && <p style={s.companyName}>{company.name}</p>}
        </div>
        {IS_DEV && (
          <div style={s.devBanner}>
            <span style={s.devLabel}>DEV</span>
            <button
              onClick={handleConfirmVouchers}
              disabled={confirming}
              style={s.devBtn}
            >
              {confirming ? 'Confirmation…' : '⚡ Confirmer bons PENDING'}
            </button>
            {confirmMsg && <span style={s.devMsg}>{confirmMsg}</span>}
          </div>
        )}
      </div>

      {/* ── Onglets ── */}
      <div style={s.tabs}>
        <div style={s.tabsInner}>
          <button
            onClick={() => setActiveTab('bons')}
            style={{ ...s.tab, ...(activeTab === 'bons' ? s.tabActive : {}) }}
          >
            Bons
          </button>
          <button
            onClick={() => setActiveTab('collaborateurs')}
            style={{ ...s.tab, ...(activeTab === 'collaborateurs' ? s.tabActive : {}) }}
          >
            Collaborateurs
          </button>
          <button
            onClick={() => setActiveTab('rse')}
            style={{ ...s.tab, ...(activeTab === 'rse' ? s.tabActive : {}) }}
          >
            RSE &amp; Impact
          </button>
        </div>
      </div>

      {/* ══════════ Onglet Bons ══════════ */}
      {activeTab === 'bons' && (
        <>
          {/* ── Stats ── */}
          <div style={s.statsGrid}>
            <StatCard
              label="Provision disponible"
              value={formatFcfa(company?.provisionBalance ?? 0)}
              color="#534AB7"
            />
            <StatCard
              label="Bons émis ce mois"
              value={String(issuedThisMonth)}
              color="#22C55E"
            />
            <StatCard
              label="Bons actifs"
              value={String(activeVouchers)}
              color="#3B82F6"
            />
          </div>

          <div style={s.twoCol}>

            {/* ── Formulaire émission ── */}
            <section style={s.card}>
              <h2 style={s.sectionTitle}>Émettre un bon</h2>

              <form onSubmit={handleIssue} style={s.form} noValidate>
                <div style={s.field}>
                  <label style={s.label}>Numéro bénéficiaire</label>
                  <div style={{ ...s.phoneWrap, borderColor: formError && !isValidPhone(phone) ? '#EF4444' : '#E5E7EB' }}>
                    <span style={s.prefix}>+221</span>
                    <div style={s.sep} />
                    <input
                      type="tel"
                      inputMode="numeric"
                      value={phone}
                      onChange={(e) => { setPhone(e.target.value); setFormError(''); setSuccessMsg(''); }}
                      placeholder="77 000 00 00"
                      style={s.phoneInput}
                    />
                  </div>
                </div>

                <div style={s.field}>
                  <label style={s.label}>Montant (FCFA)</label>
                  <div style={s.amountWrap}>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={amount}
                      onChange={(e) => { setAmount(e.target.value); setFormError(''); setSuccessMsg(''); }}
                      placeholder="25 000"
                      min="1"
                      style={s.amountInput}
                    />
                    <span style={s.amountSuffix}>FCFA</span>
                  </div>
                  {company && amount && parseInt(amount, 10) * 100 > company.provisionBalance && (
                    <p style={s.fieldHint}>Dépasse la provision ({formatFcfa(company.provisionBalance)})</p>
                  )}
                </div>

                <div style={s.field}>
                  <label style={s.label}>Type de bon</label>
                  <select value={type} onChange={(e) => setType(e.target.value)} style={s.select}>
                    {TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                <div style={s.field}>
                  <label style={s.label}>
                    Message{' '}
                    <span style={{ color: '#9CA3AF', fontWeight: 400 }}>({note.length}/100, optionnel)</span>
                  </label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value.slice(0, 100))}
                    placeholder="Bon cadeau pour vos services…"
                    rows={2}
                    style={s.textarea}
                  />
                </div>

                {formError && <p style={s.errorMsg} role="alert">{formError}</p>}
                {successMsg && <p style={s.successMsg} role="status">{successMsg}</p>}

                <button
                  type="submit"
                  disabled={submitting || !phone || !amount}
                  style={{ ...s.btn, opacity: submitting || !phone || !amount ? 0.5 : 1 }}
                >
                  {submitting ? 'Émission en cours…' : 'Émettre le bon'}
                </button>
              </form>

              <div style={s.csvSection}>
                <p style={s.csvLabel}>Ou importez plusieurs bons</p>
                <input ref={fileRef} type="file" accept=".csv" onChange={handleCsvImport} style={{ display: 'none' }} />
                <button onClick={() => fileRef.current?.click()} disabled={importing} style={s.csvBtn}>
                  {importing ? 'Importation…' : 'Importer un CSV'}
                </button>
                <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 6 }}>
                  Colonnes : <code>telephone</code>, <code>montant</code>, <code>note</code>
                </p>
                {importResult && (
                  <div style={{ marginTop: 8 }}>
                    <p style={{ color: '#22C55E', fontSize: 13 }}>{importResult.success} bon(s) émis</p>
                    {importResult.errors.length > 0 && (
                      <p style={{ color: '#EF4444', fontSize: 13 }}>{importResult.errors.length} erreur(s)</p>
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* ── Liste des bons ── */}
            <section style={s.card}>
              <h2 style={s.sectionTitle}>Derniers bons émis</h2>
              {vouchers.length === 0 ? (
                <div style={s.empty}>Aucun bon émis pour l&apos;instant.</div>
              ) : (
                <div style={s.voucherList}>
                  {vouchers.slice(0, 20).map((v) => (
                    <VoucherRow key={v.id} voucher={v} />
                  ))}
                </div>
              )}
            </section>

          </div>
        </>
      )}

      {/* ══════════ Onglet Collaborateurs ══════════ */}
      {activeTab === 'collaborateurs' && (
        <div style={s.twoCol}>

          {/* ── Formulaire invitation ── */}
          <section style={s.card}>
            <h2 style={s.sectionTitle}>Inviter un collaborateur</h2>
            <form onSubmit={handleInvite} style={s.form} noValidate>

              <div style={s.nameRow}>
                <div style={s.field}>
                  <label style={s.label}>Prénom</label>
                  <input
                    value={invFirstName}
                    onChange={(e) => setInvFirstName(e.target.value)}
                    placeholder="Fatou"
                    style={s.textInput}
                  />
                </div>
                <div style={s.field}>
                  <label style={s.label}>Nom</label>
                  <input
                    value={invLastName}
                    onChange={(e) => setInvLastName(e.target.value)}
                    placeholder="Diallo"
                    style={s.textInput}
                  />
                </div>
              </div>

              <div style={s.field}>
                <label style={s.label}>Téléphone</label>
                <div style={{ ...s.phoneWrap, borderColor: invError && !isValidPhone(invPhone) ? '#EF4444' : '#E5E7EB' }}>
                  <span style={s.prefix}>+221</span>
                  <div style={s.sep} />
                  <input
                    type="tel"
                    inputMode="numeric"
                    value={invPhone}
                    onChange={(e) => { setInvPhone(e.target.value); setInvError(''); }}
                    placeholder="77 000 00 00"
                    style={s.phoneInput}
                  />
                </div>
              </div>

              <div style={s.field}>
                <label style={s.label}>
                  Poste{' '}
                  <span style={{ color: '#9CA3AF', fontWeight: 400 }}>(optionnel)</span>
                </label>
                <input
                  value={invPoste}
                  onChange={(e) => setInvPoste(e.target.value)}
                  placeholder="Responsable comptabilité"
                  style={s.textInput}
                />
              </div>

              {invError && <p style={s.errorMsg} role="alert">{invError}</p>}
              {invSuccess && <p style={s.successMsg} role="status">{invSuccess}</p>}

              <button
                type="submit"
                disabled={invSubmitting || !invPhone}
                style={{ ...s.btn, opacity: invSubmitting || !invPhone ? 0.5 : 1 }}
              >
                {invSubmitting ? 'Envoi en cours…' : 'Envoyer l\'invitation SMS'}
              </button>
            </form>
          </section>

          {/* ── Liste des invitations ── */}
          <section style={s.card}>
            <h2 style={s.sectionTitle}>
              Invitations envoyées
              {invLoading && (
                <span style={{ fontSize: 13, color: '#9CA3AF', fontWeight: 400, marginLeft: 8 }}>
                  Chargement…
                </span>
              )}
            </h2>

            {!invLoading && invitations.length === 0 ? (
              <div style={s.empty}>Aucune invitation envoyée.</div>
            ) : (
              <div style={s.voucherList}>
                {invitations.map((inv) => (
                  <InvitationRow
                    key={inv.id}
                    invitation={inv}
                    onResend={() => handleResend(inv)}
                  />
                ))}
              </div>
            )}
          </section>

        </div>
      )}

      {/* ══════════ Onglet RSE & Impact ══════════ */}
      {activeTab === 'rse' && (() => {
        const now2 = new Date();
        const som = new Date(now2.getFullYear(), now2.getMonth(), 1);
        const issuedThisMonthLocal = vouchers.filter((v) => new Date(v.issuedAt) >= som).length;
        const usedCount = vouchers.filter((v) => v.status === 'USED' || v.status === 'PARTIAL').length;
        const totalCount = vouchers.length;
        const utilizationRate = totalCount > 0 ? (usedCount / totalCount) * 100 : 0;

        const uniqBenef = impactData?.uniqueBeneficiaryCount ?? 0;
        const uniqMerchants = impactData?.uniqueMerchantCount ?? 0;
        const educAmt = impactData?.educationAmountCentimes ?? 0;

        // Score par ODD
        const s1 = Math.min(25, Math.round((uniqBenef / 50) * 25));
        const s4 = Math.min(20, Math.round((educAmt / 10_000_000) * 20));
        const s8 = Math.round((utilizationRate / 100) * 20);
        const s10 = Math.min(20, Math.round((issuedThisMonthLocal / 100) * 20));
        const s17 = Math.min(15, Math.round((uniqMerchants / 10) * 15));
        const score = s1 + s4 + s8 + s10 + s17;

        function handlePdf() {
          const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<title>Rapport RSE Kado — ${company?.name ?? ''}</title>
<style>body{font-family:Arial,sans-serif;padding:40px;color:#111}
h1{color:#534AB7}table{width:100%;border-collapse:collapse;margin-top:24px}
th,td{padding:10px 14px;border:1px solid #E5E7EB;text-align:left}
th{background:#F9FAFB;font-weight:700}.score{font-size:48px;font-weight:800;color:#534AB7}
@media print{.no-print{display:none}}</style></head><body>
<h1>Rapport RSE — ${company?.name ?? ''}</h1>
<p>Mois de ${now2.toLocaleDateString('fr-SN',{month:'long',year:'numeric'})} · Généré le ${now2.toLocaleDateString('fr-SN')}</p>
<p class="score">${score}/100</p>
<table><thead><tr><th>ODD</th><th>Indicateur</th><th>Valeur</th><th>Score</th></tr></thead>
<tbody>
<tr><td>ODD 1 — Pas de pauvreté</td><td>Bénéficiaires uniques</td><td>${uniqBenef}</td><td>${s1}/25</td></tr>
<tr><td>ODD 4 — Éducation de qualité</td><td>Dépenses éducation (FCFA)</td><td>${(educAmt/100).toLocaleString('fr-SN')}</td><td>${s4}/20</td></tr>
<tr><td>ODD 8 — Travail décent</td><td>Taux d'utilisation bons</td><td>${utilizationRate.toFixed(1)}%</td><td>${s8}/20</td></tr>
<tr><td>ODD 10 — Réduire les inégalités</td><td>Bons émis ce mois</td><td>${issuedThisMonthLocal}</td><td>${s10}/20</td></tr>
<tr><td>ODD 17 — Partenariats</td><td>Commerçants partenaires</td><td>${uniqMerchants}</td><td>${s17}/15</td></tr>
</tbody></table>
<p style="margin-top:32px;font-size:12px;color:#6B7280">Kado SAS · kado.sn · Rapport généré automatiquement</p>
</body></html>`;
          const w = window.open('', '_blank');
          if (w) { w.document.write(html); w.document.close(); w.print(); }
        }

        return (
          <div style={s.rseContainer}>

            {/* Score global */}
            <section style={s.rseScoreCard}>
              <div style={s.rseScoreLeft}>
                <p style={s.rseScoreLabel}>Score RSE</p>
                <p style={s.rseScoreSubtitle}>
                  {now2.toLocaleDateString('fr-SN', { month: 'long', year: 'numeric' })}
                </p>
                <button onClick={handlePdf} style={s.rsePdfBtn}>
                  Télécharger le rapport PDF
                </button>
              </div>
              <ScoreCircle score={score} loading={impactLoading} />
            </section>

            {/* Cartes ODD */}
            <div style={s.rseOddGrid}>
              <OddCard
                number="1"
                color="#DDA63A"
                title="Pas de pauvreté"
                icon="🤝"
                metric={`${uniqBenef} bénéficiaire${uniqBenef !== 1 ? 's' : ''} unique${uniqBenef !== 1 ? 's' : ''}`}
                context="Personnes ayant reçu un bon Kado"
                pts={s1}
                maxPts={25}
                loading={impactLoading}
              />
              <OddCard
                number="4"
                color="#26BDE2"
                title="Éducation de qualité"
                icon="📚"
                metric={`${(educAmt / 100).toLocaleString('fr-SN')} FCFA`}
                context="Dépensés chez des commerçants éducation ce mois"
                pts={s4}
                maxPts={20}
                loading={impactLoading}
              />
              <OddCard
                number="8"
                color="#FD9D24"
                title="Travail décent"
                icon="💼"
                metric={`${utilizationRate.toFixed(0)}% d'utilisation`}
                context={`${usedCount} bon${usedCount !== 1 ? 's' : ''} utilisé${usedCount !== 1 ? 's' : ''} sur ${totalCount}`}
                pts={s8}
                maxPts={20}
                loading={false}
              />
              <OddCard
                number="10"
                color="#3F7E44"
                title="Réduire les inégalités"
                icon="⚖️"
                metric={`${issuedThisMonthLocal} bon${issuedThisMonthLocal !== 1 ? 's' : ''} ce mois`}
                context="Bons émis pour distribuer le pouvoir d'achat"
                pts={s10}
                maxPts={20}
                loading={false}
              />
              <OddCard
                number="17"
                color="#19486A"
                title="Partenariats"
                icon="🌍"
                metric={`${uniqMerchants} commerçant${uniqMerchants !== 1 ? 's' : ''} partenaire${uniqMerchants !== 1 ? 's' : ''}`}
                context="Réseau de commerçants locaux acceptant Kado"
                pts={s17}
                maxPts={15}
                loading={impactLoading}
              />
            </div>

          </div>
        );
      })()}

    </main>
  );
}

// ─── Composants ───────────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={s.statCard}>
      <p style={s.statLabel}>{label}</p>
      <p style={{ ...s.statValue, color }}>{value}</p>
    </div>
  );
}

function VoucherRow({ voucher }: { voucher: Voucher }) {
  const status = STATUS_LABELS[voucher.status] ?? { label: voucher.status, color: '#9CA3AF' };
  const date = new Date(voucher.issuedAt).toLocaleDateString('fr-SN', {
    day: 'numeric', month: 'short',
  });
  const fcfa = (voucher.nominalValue / 100).toLocaleString('fr-SN');

  return (
    <div style={s.voucherRow}>
      <div style={s.voucherLeft}>
        <p style={s.voucherPhone}>{voucher.beneficiaryPhone}</p>
        {voucher.note && <p style={s.voucherNote}>{voucher.note}</p>}
      </div>
      <div style={s.voucherRight}>
        <p style={s.voucherAmount}>{fcfa} F</p>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end' }}>
          <span style={{ ...s.statusBadge, color: status.color, borderColor: status.color }}>
            {status.label}
          </span>
          <span style={s.voucherDate}>{date}</span>
        </div>
      </div>
    </div>
  );
}

function InvitationRow({
  invitation,
  onResend,
}: {
  invitation: Invitation;
  onResend: () => void;
}) {
  const st = INV_STATUS[invitation.status] ?? { label: invitation.status, color: '#9CA3AF' };
  const name = [invitation.firstName, invitation.lastName].filter(Boolean).join(' ') || '—';
  const date = new Date(invitation.createdAt).toLocaleDateString('fr-SN', {
    day: 'numeric', month: 'short',
  });

  return (
    <div style={s.voucherRow}>
      <div style={s.voucherLeft}>
        <p style={s.voucherPhone}>{name}</p>
        <p style={s.voucherNote}>
          {invitation.phone ?? '—'}
          {invitation.poste ? ` · ${invitation.poste}` : ''}
        </p>
      </div>
      <div style={s.voucherRight}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end', marginBottom: 4 }}>
          <span style={{ ...s.statusBadge, color: st.color, borderColor: st.color }}>
            {st.label}
          </span>
          <span style={s.voucherDate}>{date}</span>
        </div>
        {invitation.status === 'EXPIRED' && invitation.phone && (
          <button onClick={onResend} style={s.resendBtn}>
            Relancer
          </button>
        )}
      </div>
    </div>
  );
}

function ScoreCircle({ score, loading }: { score: number; loading: boolean }) {
  const r = 54;
  const circ = 2 * Math.PI * r;
  const filled = loading ? 0 : (score / 100) * circ;

  return (
    <div style={{ position: 'relative', width: 140, height: 140, flexShrink: 0 }}>
      <svg width={140} height={140} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={70} cy={70} r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={12} />
        <circle
          cx={70} cy={70} r={r} fill="none"
          stroke="#fff"
          strokeWidth={12}
          strokeDasharray={`${filled} ${circ}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.8s ease' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: 36, fontWeight: 900, color: '#fff', lineHeight: 1 }}>
          {loading ? '…' : score}
        </span>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>/100</span>
      </div>
    </div>
  );
}

function OddCard({
  number, color, title, icon, metric, context, pts, maxPts, loading,
}: {
  number: string; color: string; title: string; icon: string;
  metric: string; context: string; pts: number; maxPts: number; loading: boolean;
}) {
  return (
    <div style={{ ...s.oddCard, borderLeftColor: color }}>
      <div style={s.oddHeader}>
        <span style={{ ...s.oddBadge, background: color }}>ODD {number}</span>
        <span style={s.oddIcon}>{icon}</span>
      </div>
      <p style={s.oddTitle}>{title}</p>
      <p style={s.oddMetric}>{loading ? '…' : metric}</p>
      <p style={s.oddContext}>{context}</p>
      <div style={s.oddPtsRow}>
        <div style={s.oddPtsBar}>
          <div style={{
            ...s.oddPtsFill,
            width: loading ? '0%' : `${(pts / maxPts) * 100}%`,
            background: color,
          }} />
        </div>
        <span style={s.oddPtsLabel}>{loading ? '…' : pts}/{maxPts} pts</span>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ height: 28, width: 200, background: '#E5E7EB', borderRadius: 6, marginBottom: 24 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 24 }}>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ height: 80, background: '#F3F4F6', borderRadius: 12 }} />
        ))}
      </div>
      <div style={{ height: 400, background: '#F3F4F6', borderRadius: 12 }} />
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100dvh',
    background: '#F9FAFB',
    padding: '24px 16px 48px',
  },
  header: {
    maxWidth: 900,
    margin: '0 auto 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    flexWrap: 'wrap' as const,
  },
  title: {
    fontSize: 24,
    fontWeight: 800,
    color: '#111827',
    margin: 0,
  },
  companyName: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },

  // Bandeau dev
  devBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    background: '#FEF9C3',
    border: '1px solid #FDE047',
    borderRadius: 10,
    padding: '8px 14px',
    flexWrap: 'wrap' as const,
  },
  devLabel: {
    fontSize: 10,
    fontWeight: 800,
    background: '#EAB308',
    color: '#fff',
    borderRadius: 4,
    padding: '2px 6px',
    letterSpacing: '0.5px',
  },
  devBtn: {
    background: '#EAB308',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '6px 14px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  devMsg: {
    fontSize: 13,
    color: '#854D0E',
    fontWeight: 500,
  },

  // Stats
  statsGrid: {
    maxWidth: 900,
    margin: '0 auto 24px',
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 16,
  },
  statCard: {
    background: '#fff',
    borderRadius: 14,
    padding: '18px 20px',
    border: '1px solid #E5E7EB',
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    margin: '0 0 6px',
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  statValue: {
    fontSize: 22,
    fontWeight: 800,
    margin: 0,
    letterSpacing: '-0.5px',
  },

  // Deux colonnes
  twoCol: {
    maxWidth: 900,
    margin: '0 auto',
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 20,
    alignItems: 'start',
  },
  card: {
    background: '#fff',
    borderRadius: 16,
    padding: '24px 20px',
    border: '1px solid #E5E7EB',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: '#111827',
    margin: '0 0 20px',
  },

  // Formulaire
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: '#374151',
  },
  phoneWrap: {
    display: 'flex',
    alignItems: 'center',
    border: '1.5px solid #E5E7EB',
    borderRadius: 10,
    overflow: 'hidden',
  },
  prefix: {
    padding: '0 10px',
    fontSize: 14,
    fontWeight: 600,
    color: '#374151',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  sep: {
    width: 1,
    height: 22,
    background: '#E5E7EB',
    flexShrink: 0,
  },
  phoneInput: {
    flex: 1,
    border: 'none',
    outline: 'none',
    fontSize: 15,
    padding: '11px 10px',
    background: 'transparent',
    color: '#111827',
  },
  amountWrap: {
    display: 'flex',
    alignItems: 'center',
    border: '1.5px solid #E5E7EB',
    borderRadius: 10,
    overflow: 'hidden',
  },
  amountInput: {
    flex: 1,
    border: 'none',
    outline: 'none',
    fontSize: 18,
    fontWeight: 600,
    padding: '11px 12px',
    background: 'transparent',
    color: '#111827',
    textAlign: 'right',
  },
  amountSuffix: {
    padding: '0 12px',
    fontSize: 13,
    color: '#6B7280',
    flexShrink: 0,
  },
  fieldHint: {
    fontSize: 12,
    color: '#F59E0B',
    margin: 0,
  },
  select: {
    border: '1.5px solid #E5E7EB',
    borderRadius: 10,
    padding: '11px 12px',
    fontSize: 14,
    color: '#111827',
    background: '#fff',
    outline: 'none',
    width: '100%',
  },
  textarea: {
    border: '1.5px solid #E5E7EB',
    borderRadius: 10,
    padding: '10px 12px',
    fontSize: 14,
    color: '#111827',
    resize: 'vertical',
    outline: 'none',
    fontFamily: 'inherit',
    width: '100%',
  },
  errorMsg: {
    fontSize: 13,
    color: '#EF4444',
    margin: 0,
    padding: '8px 12px',
    background: '#FEF2F2',
    borderRadius: 8,
    border: '1px solid #FECACA',
  },
  successMsg: {
    fontSize: 13,
    color: '#15803D',
    margin: 0,
    padding: '8px 12px',
    background: '#F0FDF4',
    borderRadius: 8,
    border: '1px solid #BBF7D0',
  },
  btn: {
    background: '#534AB7',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    padding: '13px',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: 4,
  },

  // CSV
  csvSection: {
    marginTop: 20,
    paddingTop: 20,
    borderTop: '1px solid #F3F4F6',
  },
  csvLabel: {
    fontSize: 13,
    color: '#6B7280',
    margin: '0 0 8px',
  },
  csvBtn: {
    background: 'transparent',
    border: '1.5px solid #E5E7EB',
    borderRadius: 10,
    padding: '9px 16px',
    fontSize: 13,
    color: '#374151',
    cursor: 'pointer',
    fontWeight: 500,
  },

  // Liste bons
  voucherList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
  },
  voucherRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 0',
    borderBottom: '1px solid #F3F4F6',
    gap: 8,
  },
  voucherLeft: {
    flex: 1,
    minWidth: 0,
  },
  voucherPhone: {
    fontSize: 14,
    fontWeight: 600,
    color: '#111827',
    margin: 0,
  },
  voucherNote: {
    fontSize: 12,
    color: '#9CA3AF',
    margin: '2px 0 0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  voucherRight: {
    textAlign: 'right',
    flexShrink: 0,
  },
  voucherAmount: {
    fontSize: 15,
    fontWeight: 700,
    color: '#111827',
    margin: '0 0 4px',
  },
  statusBadge: {
    fontSize: 11,
    fontWeight: 600,
    border: '1px solid',
    borderRadius: 4,
    padding: '1px 6px',
  },
  voucherDate: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  empty: {
    padding: '32px 0',
    textAlign: 'center',
    color: '#9CA3AF',
    fontSize: 14,
  },

  // Onglets
  tabs: {
    maxWidth: 900,
    margin: '0 auto 24px',
    borderBottom: '2px solid #F3F4F6',
  },
  tabsInner: {
    display: 'flex',
    gap: 0,
  },
  tab: {
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    marginBottom: -2,
    padding: '10px 20px',
    fontSize: 14,
    fontWeight: 600,
    color: '#6B7280',
    cursor: 'pointer',
  },
  tabActive: {
    color: '#534AB7',
    borderBottomColor: '#534AB7',
  },

  // Formulaire invitation
  nameRow: {
    display: 'flex',
    gap: 10,
  },
  textInput: {
    border: '1.5px solid #E5E7EB',
    borderRadius: 10,
    padding: '11px 12px',
    fontSize: 14,
    color: '#111827',
    outline: 'none',
    width: '100%',
    background: '#fff',
    fontFamily: 'inherit',
  },
  resendBtn: {
    background: 'none',
    border: '1px solid #E5E7EB',
    borderRadius: 6,
    padding: '3px 10px',
    fontSize: 12,
    fontWeight: 600,
    color: '#534AB7',
    cursor: 'pointer',
  },

  // ── RSE & Impact ──
  rseContainer: {
    maxWidth: 900,
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 20,
  },
  rseScoreCard: {
    background: '#534AB7',
    borderRadius: 18,
    padding: '28px 32px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 24,
  },
  rseScoreLeft: {
    flex: 1,
  },
  rseScoreLabel: {
    fontSize: 22,
    fontWeight: 800,
    color: '#fff',
    margin: '0 0 4px',
  },
  rseScoreSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.65)',
    margin: '0 0 20px',
    textTransform: 'capitalize' as const,
  },
  rsePdfBtn: {
    background: 'rgba(255,255,255,0.15)',
    border: '1px solid rgba(255,255,255,0.3)',
    borderRadius: 10,
    padding: '10px 18px',
    fontSize: 14,
    fontWeight: 600,
    color: '#fff',
    cursor: 'pointer',
  },
  rseOddGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
    gap: 16,
  },
  oddCard: {
    background: '#fff',
    border: '1px solid #E5E7EB',
    borderLeft: '4px solid #534AB7',
    borderRadius: 14,
    padding: '18px 20px',
  },
  oddHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  oddBadge: {
    fontSize: 11,
    fontWeight: 700,
    color: '#fff',
    borderRadius: 4,
    padding: '2px 8px',
    letterSpacing: '0.3px',
  },
  oddIcon: {
    fontSize: 22,
  },
  oddTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: '#374151',
    margin: '0 0 8px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.3px',
  },
  oddMetric: {
    fontSize: 20,
    fontWeight: 800,
    color: '#111827',
    margin: '0 0 4px',
    letterSpacing: '-0.3px',
  },
  oddContext: {
    fontSize: 12,
    color: '#9CA3AF',
    margin: '0 0 14px',
    lineHeight: 1.4,
  },
  oddPtsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  oddPtsBar: {
    flex: 1,
    height: 6,
    background: '#F3F4F6',
    borderRadius: 3,
    overflow: 'hidden',
  },
  oddPtsFill: {
    height: '100%',
    borderRadius: 3,
    transition: 'width 0.6s ease',
  },
  oddPtsLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: '#6B7280',
    flexShrink: 0,
  },
};
