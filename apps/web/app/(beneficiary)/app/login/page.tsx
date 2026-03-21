'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 'phone' | 'otp';

interface ApiError {
  message?: string;
  statusCode?: number;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const API = process.env.NEXT_PUBLIC_API_URL ?? '';
const RESEND_DELAY = 60; // secondes

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPhoneDisplay(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 9);
  return digits.replace(/(\d{2})(\d{3})(\d{2})(\d{2})/, '$1 $2 $3 $4').trim();
}

function toE164(local: string): string {
  return '+221' + local.replace(/\D/g, '');
}

function isValidSenegalese(local: string): boolean {
  return /^[0-9]{9}$/.test(local.replace(/\D/g, ''));
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('phone');

  // Étape 1 — téléphone
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [sendingOtp, setSendingOtp] = useState(false);

  // Étape 2 — OTP
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [otpError, setOtpError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);

  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Réinitialiser les erreurs au montage — le routeur Next.js 15 peut
  // restaurer l'état d'une session précédente via son cache de navigation.
  useEffect(() => {
    setPhoneError('');
    setOtpError('');
  }, []);

  // Démarrer le compte à rebours après envoi OTP
  useEffect(() => {
    if (resendCountdown <= 0) return;
    const t = setTimeout(() => setResendCountdown((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCountdown]);

  // ─── Envoi OTP ─────────────────────────────────────────────────────────────

  const handleSendOtp = useCallback(async () => {
    setPhoneError('');
    if (!isValidSenegalese(phone)) {
      setPhoneError('Numéro invalide — 9 chiffres après +221');
      return;
    }

    setSendingOtp(true);
    const url = `${API}/api/v1/auth/otp/send`;
    console.log('[OTP send] URL:', url);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: toE164(phone) }),
      });

      if (!res.ok) {
        const err: ApiError = await res.json().catch(() => ({}));
        console.error('[OTP send] Erreur HTTP', res.status, err);
        if (res.status === 429) {
          setPhoneError('Trop de tentatives. Réessayez dans 30 minutes.');
        } else {
          setPhoneError(err.message ?? 'Erreur lors de l\'envoi du code.');
        }
        return;
      }

      setStep('otp');
      setResendCountdown(RESEND_DELAY);
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch (err) {
      console.error('[OTP send] Erreur réseau:', err);
      setPhoneError('Erreur réseau. Vérifiez votre connexion.');
    } finally {
      setSendingOtp(false);
    }
  }, [phone]);

  // ─── Saisie OTP — navigation automatique entre cases ──────────────────────

  const handleOtpChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...otp];
    next[index] = digit;
    setOtp(next);
    setOtpError('');

    if (digit && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }

    // Auto-submit si toutes les cases sont remplies
    if (digit && index === 5) {
      const code = [...next.slice(0, 5), digit].join('');
      if (code.length === 6) verifyOtp(code);
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  // Coller un code complet (ex : depuis SMS sur Android)
  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length !== 6) return;
    const digits = pasted.split('');
    setOtp(digits);
    otpRefs.current[5]?.focus();
    verifyOtp(pasted);
  };

  // ─── Vérification OTP ──────────────────────────────────────────────────────

  const verifyOtp = useCallback(
    async (code: string) => {
      setOtpError('');
      setVerifying(true);
      const url = `${API}/api/v1/auth/otp/verify`;
      console.log('[OTP verify] URL:', url);
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: toE164(phone), code }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          console.error('[OTP verify] Erreur HTTP', res.status, data);
          if (res.status === 429) {
            setOtpError('Compte bloqué 30 min après trop d\'erreurs.');
          } else {
            setOtpError('Code incorrect ou expiré. Réessayez.');
          }
          setOtp(['', '', '', '', '', '']);
          setTimeout(() => otpRefs.current[0]?.focus(), 50);
          return;
        }

        if (!data.accessToken) {
          setOtpError('Réponse invalide du serveur. Réessayez.');
          return;
        }

        // Stockage tokens
        localStorage.setItem('access_token', data.accessToken);
        localStorage.setItem('refresh_token', data.refreshToken);

        // Redirection selon le rôle retourné par l'API
        const role: string = data.role ?? 'BENEFICIARY';
        if (role === 'ADMIN') {
          router.replace('/admin/dashboard');
        } else if (role === 'MERCHANT') {
          localStorage.setItem('merchant_token', data.accessToken);
          if (data.merchantId) localStorage.setItem('merchant_id', data.merchantId);
          router.replace('/pos/scan');
        } else if (role === 'COMPANY_ADMIN' || role === 'COMPANY_VIEWER') {
          router.replace('/dashboard');
        } else {
          router.replace('/app/wallet');
        }
      } catch (err) {
        console.error('[OTP verify] Erreur réseau:', err);
        setOtpError('Erreur réseau. Vérifiez votre connexion.');
      } finally {
        setVerifying(false);
      }
    },
    [phone, router],
  );

  const handleOtpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = otp.join('');
    if (code.length < 6) {
      setOtpError('Entrez les 6 chiffres du code.');
      return;
    }
    verifyOtp(code);
  };

  // ─── Renvoyer le code ──────────────────────────────────────────────────────

  const handleResend = async () => {
    if (resendCountdown > 0) return;
    setOtp(['', '', '', '', '', '']);
    setOtpError('');
    await handleSendOtp();
  };

  // ─── Rendu ─────────────────────────────────────────────────────────────────

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        {/* Logo */}
        <div style={styles.logo}>
          <span style={styles.logoText}>Kado</span>
        </div>

        {step === 'phone' ? (
          <PhoneStep
            phone={phone}
            onChange={(v) => { setPhone(v); setPhoneError(''); }}
            onSubmit={handleSendOtp}
            loading={sendingOtp}
            error={phoneError}
          />
        ) : (
          <OtpStep
            phone={toE164(phone)}
            otp={otp}
            otpRefs={otpRefs}
            onChange={handleOtpChange}
            onKeyDown={handleOtpKeyDown}
            onPaste={handleOtpPaste}
            onSubmit={handleOtpSubmit}
            onResend={handleResend}
            onBack={() => { setStep('phone'); setOtp(['', '', '', '', '', '']); setOtpError(''); }}
            loading={verifying}
            error={otpError}
            resendCountdown={resendCountdown}
          />
        )}
      </div>
    </main>
  );
}

// ─── Étape 1 : saisie du numéro ───────────────────────────────────────────────

function PhoneStep({
  phone, onChange, onSubmit, loading, error,
}: {
  phone: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  loading: boolean;
  error: string;
}) {
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); onSubmit(); };
  const digits = phone.replace(/\D/g, '').slice(0, 9);

  return (
    <form onSubmit={handleSubmit} style={styles.form} noValidate>
      <h1 style={styles.title}>Connexion</h1>
      <p style={styles.subtitle}>Entrez votre numéro pour recevoir un code par SMS</p>

      <label style={styles.label}>Numéro de téléphone</label>
      <div style={{ ...styles.inputWrap, borderColor: error ? '#EF4444' : '#E5E7EB' }}>
        <span style={styles.prefix}>+221</span>
        <div style={styles.separator} />
        <input
          type="tel"
          inputMode="numeric"
          value={formatPhoneDisplay(phone)}
          onChange={(e) => onChange(e.target.value)}
          placeholder="77 000 00 00"
          autoComplete="tel-national"
          autoFocus
          style={styles.phoneInput}
          aria-label="Numéro sénégalais"
          aria-invalid={!!error}
        />
      </div>

      {error && <p style={styles.errorMsg} role="alert">{error}</p>}

      <button
        type="submit"
        disabled={loading || digits.length < 9}
        style={{ ...styles.btn, opacity: loading || digits.length < 9 ? 0.55 : 1 }}
      >
        {loading ? <Spinner /> : 'Recevoir le code'}
      </button>
    </form>
  );
}

// ─── Étape 2 : saisie du code OTP ─────────────────────────────────────────────

function OtpStep({
  phone, otp, otpRefs, onChange, onKeyDown, onPaste,
  onSubmit, onResend, onBack, loading, error, resendCountdown,
}: {
  phone: string;
  otp: string[];
  otpRefs: React.MutableRefObject<(HTMLInputElement | null)[]>;
  onChange: (i: number, v: string) => void;
  onKeyDown: (i: number, e: React.KeyboardEvent) => void;
  onPaste: (e: React.ClipboardEvent) => void;
  onSubmit: (e: React.FormEvent) => void;
  onResend: () => void;
  onBack: () => void;
  loading: boolean;
  error: string;
  resendCountdown: number;
}) {
  const filled = otp.every((d) => d !== '');

  return (
    <form onSubmit={onSubmit} style={styles.form} noValidate>
      <button type="button" onClick={onBack} style={styles.backBtn} aria-label="Retour">
        ← Retour
      </button>

      <h1 style={styles.title}>Code de vérification</h1>
      <p style={styles.subtitle}>
        Code envoyé au{' '}
        <strong style={{ color: '#111827' }}>{phone}</strong>
      </p>

      <div
        style={styles.otpRow}
        onPaste={onPaste}
        role="group"
        aria-label="Code à 6 chiffres"
      >
        {otp.map((digit, i) => (
          <input
            key={i}
            ref={(el) => { otpRefs.current[i] = el; }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => onChange(i, e.target.value)}
            onKeyDown={(e) => onKeyDown(i, e)}
            disabled={loading}
            style={{
              ...styles.otpBox,
              borderColor: error ? '#EF4444' : digit ? '#534AB7' : '#E5E7EB',
              background: digit ? '#F5F4FF' : '#fff',
              color: '#111827',
            }}
            aria-label={`Chiffre ${i + 1}`}
          />
        ))}
      </div>

      {error && <p style={styles.errorMsg} role="alert">{error}</p>}

      <button
        type="submit"
        disabled={loading || !filled}
        style={{ ...styles.btn, opacity: loading || !filled ? 0.55 : 1 }}
      >
        {loading ? <Spinner /> : 'Vérifier'}
      </button>

      <div style={styles.resendWrap}>
        {resendCountdown > 0 ? (
          <span style={styles.resendTimer}>
            Renvoyer dans{' '}
            <strong style={{ color: '#534AB7' }}>{resendCountdown}s</strong>
          </span>
        ) : (
          <button type="button" onClick={onResend} style={styles.resendBtn}>
            Renvoyer le code
          </button>
        )}
      </div>
    </form>
  );
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 18,
        height: 18,
        border: '2px solid rgba(255,255,255,0.4)',
        borderTopColor: '#fff',
        borderRadius: '50%',
        animation: 'spin 0.7s linear infinite',
        verticalAlign: 'middle',
      }}
    />
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  page: {
    minHeight: '100vh',
    background: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 16px',
  } as React.CSSProperties,

  card: {
    width: '100%',
    maxWidth: 400,
  } as React.CSSProperties,

  logo: {
    textAlign: 'center' as const,
    marginBottom: 40,
    letterSpacing: '-1px',
  } as React.CSSProperties,

  logoText: {
    fontSize: 40,
    fontWeight: 800,
    color: '#534AB7',
    lineHeight: 1,
  } as React.CSSProperties,

  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 0,
  } as React.CSSProperties,

  title: {
    fontSize: 24,
    fontWeight: 700,
    color: '#111827',
    marginBottom: 8,
  } as React.CSSProperties,

  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 28,
    lineHeight: 1.5,
  } as React.CSSProperties,

  label: {
    fontSize: 13,
    fontWeight: 600,
    color: '#374151',
    marginBottom: 8,
    display: 'block',
  } as React.CSSProperties,

  inputWrap: {
    display: 'flex',
    alignItems: 'center',
    border: '1.5px solid #E5E7EB',
    borderRadius: 12,
    background: '#fff',
    overflow: 'hidden',
    marginBottom: 8,
    transition: 'border-color 0.15s',
  } as React.CSSProperties,

  prefix: {
    padding: '0 12px',
    fontSize: 16,
    fontWeight: 600,
    color: '#374151',
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
  } as React.CSSProperties,

  separator: {
    width: 1,
    height: 24,
    background: '#E5E7EB',
    flexShrink: 0,
  } as React.CSSProperties,

  phoneInput: {
    flex: 1,
    border: 'none',
    outline: 'none',
    fontSize: 18,
    fontWeight: 500,
    padding: '14px 12px',
    background: 'transparent',
    color: '#111827',
    letterSpacing: '0.5px',
    width: '100%',
  } as React.CSSProperties,

  errorMsg: {
    fontSize: 13,
    color: '#EF4444',
    marginBottom: 16,
    marginTop: 4,
  } as React.CSSProperties,

  btn: {
    marginTop: 16,
    width: '100%',
    background: '#534AB7',
    color: '#fff',
    border: 'none',
    borderRadius: 12,
    padding: '15px',
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    transition: 'opacity 0.15s',
    minHeight: 52,
  } as React.CSSProperties,

  backBtn: {
    background: 'none',
    border: 'none',
    color: '#6B7280',
    fontSize: 14,
    cursor: 'pointer',
    padding: '0 0 20px 0',
    textAlign: 'left' as const,
    alignSelf: 'flex-start',
  } as React.CSSProperties,

  otpRow: {
    display: 'flex',
    gap: 10,
    justifyContent: 'center',
    marginBottom: 8,
  } as React.CSSProperties,

  otpBox: {
    width: 48,
    height: 56,
    border: '1.5px solid #E5E7EB',
    borderRadius: 10,
    textAlign: 'center' as const,
    fontSize: 22,
    fontWeight: 700,
    outline: 'none',
    transition: 'border-color 0.15s, background 0.15s',
    caretColor: '#534AB7',
  } as React.CSSProperties,

  resendWrap: {
    textAlign: 'center' as const,
    marginTop: 20,
  } as React.CSSProperties,

  resendTimer: {
    fontSize: 14,
    color: '#9CA3AF',
  } as React.CSSProperties,

  resendBtn: {
    background: 'none',
    border: 'none',
    color: '#534AB7',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    textDecoration: 'underline',
  } as React.CSSProperties,
} as const;
