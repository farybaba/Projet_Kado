'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatMontant } from '@kado/shared';

interface Voucher {
  id: string;
  code: string;
  nominalValue: number;
  remainingValue: number;
  status: string;
  type: string;
  expiresAt: string;
  note?: string;
}

const TYPE_LABELS: Record<string, string> = {
  GIFT_VOUCHER: 'Cadeau',
  MEAL_TICKET: 'Repas',
  TRANSPORT: 'Transport',
  BONUS: 'Bonus',
};

export default function WalletPage() {
  const router = useRouter();
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.replace('/app/login');
      return;
    }

    const url = `${process.env.NEXT_PUBLIC_API_URL}/api/v1/vouchers/me`;
    console.log('[wallet] GET', url);

    fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (r) => {
        console.log('[wallet] status HTTP:', r.status);
        if (r.status === 401) {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          router.replace('/app/login');
          return null;
        }
        const json = await r.json();
        console.log('[wallet] réponse brute:', JSON.stringify(json, null, 2));
        return json;
      })
      .then((data) => {
        if (data) setVouchers(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        console.error('[wallet] Erreur réseau:', err);
        // Token peut-être invalide ou serveur inaccessible — retour login
        router.replace('/app/login');
      })
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <main style={{ padding: 24, maxWidth: 480, margin: '0 auto' }}>
        <div style={{ height: 28, width: 160, background: '#E5E7EB', borderRadius: 6, marginBottom: 24 }} />
        {[1, 2].map((i) => (
          <div key={i} style={{ height: 90, background: '#F3F4F6', borderRadius: 12, marginBottom: 12 }} />
        ))}
      </main>
    );
  }

  const actifs = vouchers.filter((v) => v.status === 'ISSUED' || v.status === 'PARTIAL');
  const archives = vouchers.filter((v) => !['ISSUED', 'PARTIAL'].includes(v.status));

  return (
    <main style={{ padding: 16, maxWidth: 480, margin: '0 auto' }}>
      <h1 style={{ color: '#534AB7', fontSize: 22, fontWeight: 700, marginBottom: 24 }}>
        Mon Portefeuille
      </h1>

      {/* Bons actifs */}
      <section>
        <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 12, fontWeight: 500 }}>
          Bons actifs ({actifs.length})
        </p>

        {actifs.length === 0 && (
          <div style={{
            background: '#F9FAFB',
            border: '1px dashed #E5E7EB',
            borderRadius: 12,
            padding: '32px 16px',
            textAlign: 'center',
            color: '#9CA3AF',
            fontSize: 14,
          }}>
            Aucun bon disponible
          </div>
        )}

        {actifs.map((v) => (
          <Link key={v.id} href={`/app/wallet/${v.id}`} style={{ textDecoration: 'none' }}>
            <div style={{
              background: '#fff',
              borderRadius: 12,
              padding: '16px',
              marginBottom: 12,
              border: '1px solid #E5E7EB',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}>
              {/* Ligne 1 — montant + badge type */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: 20, color: '#111827' }}>
                  {formatMontant(v.remainingValue)}
                </span>
                <span style={{
                  background: '#F5F4FF',
                  color: '#534AB7',
                  borderRadius: 6,
                  padding: '3px 10px',
                  fontSize: 12,
                  fontWeight: 600,
                }}>
                  {TYPE_LABELS[v.type] ?? v.type}
                </span>
              </div>

              {/* Ligne 2 — note */}
              {v.note && (
                <p style={{ color: '#6B7280', fontSize: 13, margin: 0 }}>{v.note}</p>
              )}

              {/* Ligne 3 — solde restant si partiel + date expiration */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {v.status === 'PARTIAL' && (
                  <span style={{ fontSize: 12, color: '#F59E0B', fontWeight: 500 }}>
                    Solde partiel
                  </span>
                )}
                <span style={{ fontSize: 12, color: '#9CA3AF', marginLeft: 'auto' }}>
                  Expire le {new Date(v.expiresAt).toLocaleDateString('fr-SN')}
                </span>
              </div>
            </div>
          </Link>
        ))}
      </section>

      {/* Historique */}
      {archives.length > 0 && (
        <section style={{ marginTop: 32 }}>
          <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 12, fontWeight: 500 }}>
            Historique ({archives.length})
          </p>
          {archives.map((v) => (
            <div key={v.id} style={{
              background: '#F9FAFB',
              borderRadius: 12,
              padding: 16,
              marginBottom: 8,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span style={{ color: '#6B7280', fontSize: 15 }}>
                {formatMontant(v.nominalValue)}
              </span>
              <span style={{
                fontSize: 12,
                color: '#9CA3AF',
                background: '#F3F4F6',
                padding: '2px 8px',
                borderRadius: 4,
              }}>
                {v.status === 'USED' ? 'Utilisé' : v.status === 'EXPIRED' ? 'Expiré' : 'Annulé'}
              </span>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
