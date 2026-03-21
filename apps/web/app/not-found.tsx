import Link from 'next/link';

export default function NotFound() {
  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <p style={styles.code}>404</p>

        <h1 style={styles.title}>Page introuvable</h1>
        <p style={styles.message}>
          La page que vous cherchez n'existe pas.
        </p>

        <Link href="/app/wallet" style={styles.btn}>
          Retour
        </Link>
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
  },
  code: {
    fontSize: 72,
    fontWeight: 800,
    color: '#534AB7',
    lineHeight: 1,
    margin: '0 0 16px',
    letterSpacing: '-2px',
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
    marginBottom: 32,
    lineHeight: 1.5,
  },
  btn: {
    display: 'inline-block',
    background: '#534AB7',
    color: '#fff',
    border: 'none',
    borderRadius: 12,
    padding: '15px 40px',
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    textDecoration: 'none',
    minHeight: 52,
    lineHeight: '22px',
  },
};
