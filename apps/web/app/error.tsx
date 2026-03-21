'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    // Loguer l'erreur en production (Sentry, etc.)
    console.error('[GlobalError]', error);
  }, [error]);

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <div style={styles.iconWrap}>
          <span style={styles.icon}>!</span>
        </div>

        <h1 style={styles.title}>Une erreur est survenue</h1>
        <p style={styles.message}>
          {error?.message || 'Erreur inattendue'}
        </p>

        {error?.digest && (
          <p style={styles.digest}>Référence : {error.digest}</p>
        )}

        <div style={styles.actions}>
          <button
            type="button"
            onClick={reset}
            style={styles.btnPrimary}
          >
            Réessayer
          </button>

          <button
            type="button"
            onClick={() => router.push('/app/wallet')}
            style={styles.btnSecondary}
          >
            Retour à l'accueil
          </button>
        </div>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 16px',
  },
  card: {
    width: '100%',
    maxWidth: 400,
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 0,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: '50%',
    background: '#FEF2F2',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  icon: {
    fontSize: 28,
    fontWeight: 800,
    color: '#EF4444',
    lineHeight: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: '#111827',
    marginBottom: 10,
  },
  message: {
    fontSize: 15,
    color: '#6B7280',
    marginBottom: 8,
    lineHeight: 1.5,
    maxWidth: 320,
  },
  digest: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 24,
    fontFamily: 'monospace',
  },
  actions: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    width: '100%',
    marginTop: 16,
  },
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
    minHeight: 52,
  },
  btnSecondary: {
    width: '100%',
    background: 'transparent',
    color: '#534AB7',
    border: '1.5px solid #534AB7',
    borderRadius: 12,
    padding: '14px',
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    minHeight: 52,
  },
};
