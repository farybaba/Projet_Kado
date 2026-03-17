'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL ?? '';
const RESEND_DELAY = 60;

// Décode le payload d'un JWT sans vérification (lecture côté client uniquement)
function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const part = token.split('.')[1];
    return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return {};
  }
}

type Step = 'phone' | 'otp';

export default function PosLoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [sending, setSending] = useState(false);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [otpError, setOtpError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Compte à rebours renvoi
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const toE164 = (raw: string) => '+221' + raw.replace(/\D/g, '');
  const isValid = (raw: string) => /^[0-9]{9}$/.test(raw.replace(/\D/g, ''));

  const handleSend = useCallback(async () => {
    setPhoneError('');
    if (!isValid(phone)) {
      setPhoneError('Numéro invalide — 9 chiffres après +221');
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`${API}/api/v1/auth/otp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: toE164(phone) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setPhoneError(
          res.status === 429
            ? 'Trop de tentatives. Réessayez dans 30 minutes.'
            : err.message ?? 'Erreur lors de l\'envoi.',
        );
        return;
      }
      setStep('otp');
      setCountdown(RESEND_DELAY);
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch {
      setPhoneError('Erreur réseau.');
    } finally {
      setSending(false);
    }
  }, [phone]);

  const verifyOtp = useCallback(async (code: string) => {
    setOtpError('');
    setVerifying(true);
    try {
      const res = await fetch(`${API}/api/v1/auth/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: toE164(phone), code }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setOtpError(
          res.status === 429
            ? 'Compte bloqué 30 min.'
            : 'Code incorrect ou expiré.',
        );
        setOtp(['', '', '', '', '', '']);
        setTimeout(() => otpRefs.current[0]?.focus(), 50);
        return;
      }

      // Vérifier que le compte est bien un marchand
      const payload = decodeJwtPayload(data.accessToken);
      if (payload.role !== 'MERCHANT') {
        setOtpError('Ce numéro n\'est pas un compte marchand.');
        setOtp(['', '', '', '', '', '']);
        return;
      }

      // Stocker token + merchantId pour les appels POS
      localStorage.setItem('merchant_token', data.accessToken);
      localStorage.setItem('merchant_refresh_token', data.refreshToken ?? '');
      localStorage.setItem('merchant_id', (payload.merchantId as string) ?? '');

      router.replace('/pos/scan');
    } catch {
      setOtpError('Erreur réseau.');
    } finally {
      setVerifying(false);
    }
  }, [phone, router]);

  const handleOtpChange = (i: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...otp];
    next[i] = digit;
    setOtp(next);
    setOtpError('');
    if (digit && i < 5) otpRefs.current[i + 1]?.focus();
    if (digit && i === 5) {
      const code = [...next.slice(0, 5), digit].join('');
      if (code.length === 6) verifyOtp(code);
    }
  };

  const handleOtpKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[i] && i > 0) otpRefs.current[i - 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length !== 6) return;
    setOtp(pasted.split(''));
    otpRefs.current[5]?.focus();
    verifyOtp(pasted);
  };

  return (
    <main style={s.page}>
      <div style={s.card}>

        {/* Logo */}
        <div style={s.logoWrap}>
          <span style={s.logo}>Kado</span>
          <span style={s.logoSub}>Terminal commerçant</span>
        </div>

        {step === 'phone' ? (
          <form
            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
            style={s.form}
            noValidate
          >
            <h1 style={s.title}>Connexion POS</h1>
            <p style={s.subtitle}>Entrez votre numéro pour recevoir un code SMS</p>

            <label style={s.label}>Numéro marchand</label>
            <div style={{ ...s.inputRow, borderColor: phoneError ? '#EF4444' : '#E5E7EB' }}>
              <span style={s.prefix}>+221</span>
              <div style={s.divider} />
              <input
                type="tel"
                inputMode="numeric"
                value={phone.replace(/\D/g, '').slice(0, 9).replace(/(\d{2})(\d{3})(\d{2})(\d{2})/, '$1 $2 $3 $4').trim()}
                onChange={(e) => { setPhone(e.target.value); setPhoneError(''); }}
                placeholder="77 000 00 01"
                autoFocus
                style={s.phoneInput}
              />
            </div>
            {phoneError && <p style={s.error}>{phoneError}</p>}

            <button
              type="submit"
              disabled={sending || phone.replace(/\D/g, '').length < 9}
              style={{ ...s.btn, opacity: sending || phone.replace(/\D/g, '').length < 9 ? 0.5 : 1 }}
            >
              {sending ? <Spinner /> : 'Recevoir le code'}
            </button>
          </form>
        ) : (
          <form
            onSubmit={(e) => { e.preventDefault(); verifyOtp(otp.join('')); }}
            style={s.form}
            noValidate
          >
            <button type="button" onClick={() => { setStep('phone'); setOtp(['', '', '', '', '', '']); setOtpError(''); }} style={s.back}>
              ← Retour
            </button>
            <h1 style={s.title}>Code de vérification</h1>
            <p style={s.subtitle}>
              Envoyé au <strong>+221{phone.replace(/\D/g, '')}</strong>
            </p>

            <div style={s.otpRow} onPaste={handlePaste}>
              {otp.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => { otpRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={d}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(i, e)}
                  disabled={verifying}
                  style={{
                    ...s.otpBox,
                    borderColor: otpError ? '#EF4444' : d ? '#534AB7' : '#E5E7EB',
                    background: d ? '#F5F4FF' : '#fff',
                  }}
                />
              ))}
            </div>
            {otpError && <p style={s.error}>{otpError}</p>}

            <button
              type="submit"
              disabled={verifying || otp.some((d) => !d)}
              style={{ ...s.btn, opacity: verifying || otp.some((d) => !d) ? 0.5 : 1 }}
            >
              {verifying ? <Spinner /> : 'Vérifier'}
            </button>

            <div style={{ textAlign: 'center', marginTop: 16 }}>
              {countdown > 0 ? (
                <span style={{ fontSize: 13, color: '#9CA3AF' }}>
                  Renvoyer dans <strong style={{ color: '#534AB7' }}>{countdown}s</strong>
                </span>
              ) : (
                <button type="button" onClick={handleSend} style={s.resend}>
                  Renvoyer le code
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </main>
  );
}

function Spinner() {
  return (
    <span style={{
      display: 'inline-block',
      width: 18, height: 18,
      border: '2px solid rgba(255,255,255,0.4)',
      borderTopColor: '#fff',
      borderRadius: '50%',
      animation: 'spin 0.7s linear infinite',
    }} />
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100dvh',
    background: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 16px',
  },
  card: { width: '100%', maxWidth: 400 },
  logoWrap: { textAlign: 'center', marginBottom: 36 },
  logo: { fontSize: 36, fontWeight: 800, color: '#534AB7', display: 'block' },
  logoSub: { fontSize: 13, color: '#9CA3AF', marginTop: 4, display: 'block' },
  form: { display: 'flex', flexDirection: 'column', gap: 0 },
  title: { fontSize: 22, fontWeight: 700, color: '#111827', marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#6B7280', marginBottom: 24, lineHeight: 1.5 },
  label: { fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8, display: 'block' },
  inputRow: {
    display: 'flex', alignItems: 'center',
    border: '1.5px solid #E5E7EB', borderRadius: 12,
    overflow: 'hidden', marginBottom: 8,
  },
  prefix: { padding: '0 12px', fontSize: 16, fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' },
  divider: { width: 1, height: 24, background: '#E5E7EB', flexShrink: 0 },
  phoneInput: {
    flex: 1, border: 'none', outline: 'none',
    fontSize: 18, fontWeight: 500, padding: '14px 12px',
    background: 'transparent', color: '#111827', letterSpacing: '0.5px',
  },
  error: { fontSize: 13, color: '#EF4444', marginBottom: 12, marginTop: 4 },
  btn: {
    marginTop: 16, width: '100%',
    background: '#534AB7', color: '#fff',
    border: 'none', borderRadius: 12,
    padding: '15px', fontSize: 16, fontWeight: 600,
    cursor: 'pointer', minHeight: 52,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  back: {
    background: 'none', border: 'none',
    color: '#6B7280', fontSize: 14, cursor: 'pointer',
    padding: '0 0 18px', textAlign: 'left', alignSelf: 'flex-start',
  },
  otpRow: { display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 8 },
  otpBox: {
    width: 48, height: 56,
    border: '1.5px solid #E5E7EB', borderRadius: 10,
    textAlign: 'center', fontSize: 22, fontWeight: 700,
    outline: 'none',
  },
  resend: {
    background: 'none', border: 'none',
    color: '#534AB7', fontSize: 14, fontWeight: 600,
    cursor: 'pointer', textDecoration: 'underline',
  },
};
