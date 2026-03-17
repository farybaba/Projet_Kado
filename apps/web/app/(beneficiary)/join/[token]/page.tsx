'use client';

import { useEffect, useState, useRef, useCallback, use } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? '';
const RESEND_DELAY = 60;

// ─── Types ────────────────────────────────────────────────────────────────────

interface InvitationInfo {
  firstName: string | null;
  lastName: string | null;
  poste: string | null;
  phone: string | null;
  companyName: string;
  expiresAt: string;
}

type Step = 'loading' | 'invalid' | 'info' | 'phone' | 'otp' | 'accepting' | 'success';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toE164(local: string): string {
  return '+221' + local.replace(/\D/g, '');
}

function isValid(local: string): boolean {
  return /^[0-9]{9}$/.test(local.replace(/\D/g, ''));
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token: inviteToken } = use(params);
  const [step, setStep] = useState<Step>('loading');
  const [invitation, setInvitation] = useState<InvitationInfo | null>(null);
  const [invalidMsg, setInvalidMsg] = useState('');

  // Étape saisie téléphone
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [sending, setSending] = useState(false);

  // Étape OTP
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [otpError, setOtpError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Erreur accept
  const [acceptError, setAcceptError] = useState('');

  // ─── Fetch invitation ──────────────────────────────────────────────────────

  useEffect(() => {
    fetch(`${API}/api/v1/invitations/${inviteToken}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          setInvalidMsg(data?.message ?? 'Lien d\'invitation invalide ou expiré.');
          setStep('invalid');
          return;
        }
        setInvitation(data);
        // Pré-remplir le téléphone si fourni dans l'invitation
        if (data.phone) {
          const digits = (data.phone as string).replace(/^\+221/, '');
          setPhone(digits);
        }
        setStep('info');
      })
      .catch(() => {
        setInvalidMsg('Erreur réseau. Vérifiez votre connexion.');
        setStep('invalid');
      });
  }, [inviteToken]);

  // ─── Countdown OTP ────────────────────────────────────────────────────────

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  // ─── Envoi OTP ────────────────────────────────────────────────────────────

  const handleSendOtp = useCallback(async () => {
    if (!isValid(phone)) {
      setPhoneError('Numéro invalide — 9 chiffres après +221');
      return;
    }
    setPhoneError('');
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
      setPhoneError('Erreur réseau. Vérifiez votre connexion.');
    } finally {
      setSending(false);
    }
  }, [phone]);

  // ─── Vérification OTP + accept ────────────────────────────────────────────

  const verifyAndAccept = useCallback(async (code: string) => {
    setOtpError('');
    setVerifying(true);
    try {
      // 1. Vérifier OTP → obtenir access_token
      const res = await fetch(`${API}/api/v1/auth/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: toE164(phone), code }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setOtpError(
          res.status === 429
            ? 'Compte bloqué 30 min après trop d\'erreurs.'
            : 'Code incorrect ou expiré. Réessayez.',
        );
        setOtp(['', '', '', '', '', '']);
        setTimeout(() => otpRefs.current[0]?.focus(), 50);
        return;
      }

      // 2. Accepter l'invitation avec le token fraîchement obtenu
      setStep('accepting');
      const acceptRes = await fetch(`${API}/api/v1/invitations/${inviteToken}/accept`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${data.accessToken}` },
      });

      if (!acceptRes.ok) {
        const acceptErr = await acceptRes.json().catch(() => ({}));
        setAcceptError(acceptErr?.message ?? 'Erreur lors de l\'activation du compte.');
        setStep('otp');
        return;
      }

      setStep('success');
    } catch {
      setOtpError('Erreur réseau. Vérifiez votre connexion.');
      setStep('otp');
    } finally {
      setVerifying(false);
    }
  }, [phone, inviteToken]);

  // ─── Gestion saisie OTP ───────────────────────────────────────────────────

  const handleOtpChange = (i: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...otp];
    next[i] = digit;
    setOtp(next);
    setOtpError('');
    if (digit && i < 5) otpRefs.current[i + 1]?.focus();
    if (digit && i === 5) {
      const code = next.join('');
      if (code.length === 6) verifyAndAccept(code);
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
    verifyAndAccept(pasted);
  };

  // ─── Rendu ────────────────────────────────────────────────────────────────

  return (
    <main style={s.page}>
      <div style={s.card}>

        {/* Logo */}
        <div style={s.logoWrap}>
          <span style={s.logo}>Kado</span>
          <span style={s.logoSub}>Activation de compte collaborateur</span>
        </div>

        {/* ── Chargement ── */}
        {step === 'loading' && (
          <div style={s.center}>
            <div style={s.spinner} />
            <p style={s.hint}>Vérification du lien…</p>
          </div>
        )}

        {/* ── Lien invalide ── */}
        {step === 'invalid' && (
          <div style={s.center}>
            <div style={s.errorIcon}>✕</div>
            <p style={s.errorText}>{invalidMsg}</p>
            <p style={s.hint}>
              Demandez à votre RH de vous renvoyer une invitation.
            </p>
          </div>
        )}

        {/* ── Infos invitation ── */}
        {step === 'info' && invitation && (
          <>
            <div style={s.infoBox}>
              <p style={s.infoCompany}>{invitation.companyName}</p>
              {(invitation.firstName || invitation.lastName) && (
                <p style={s.infoName}>
                  Bonjour {[invitation.firstName, invitation.lastName].filter(Boolean).join(' ')} 👋
                </p>
              )}
              {invitation.poste && (
                <p style={s.infoPoste}>Poste : {invitation.poste}</p>
              )}
              <p style={s.infoExpiry}>
                Lien valable jusqu&apos;au{' '}
                {new Date(invitation.expiresAt).toLocaleDateString('fr-SN', {
                  day: 'numeric', month: 'long',
                })}
              </p>
            </div>
            <button onClick={() => setStep('phone')} style={s.btn}>
              Activer mon compte →
            </button>
          </>
        )}

        {/* ── Saisie téléphone ── */}
        {step === 'phone' && (
          <form
            onSubmit={(e) => { e.preventDefault(); handleSendOtp(); }}
            style={s.form}
            noValidate
          >
            <button
              type="button"
              onClick={() => setStep('info')}
              style={s.back}
            >
              ← Retour
            </button>
            <h1 style={s.title}>Vérifiez votre identité</h1>
            <p style={s.subtitle}>Entrez votre numéro pour recevoir un code SMS</p>

            <label style={s.label}>Votre numéro</label>
            <div style={{ ...s.inputRow, borderColor: phoneError ? '#EF4444' : '#E5E7EB' }}>
              <span style={s.prefix}>+221</span>
              <div style={s.divider} />
              <input
                type="tel"
                inputMode="numeric"
                value={phone.replace(/\D/g, '').slice(0, 9).replace(/(\d{2})(\d{3})(\d{2})(\d{2})/, '$1 $2 $3 $4').trim()}
                onChange={(e) => { setPhone(e.target.value); setPhoneError(''); }}
                placeholder="76 000 00 01"
                autoFocus
                style={s.phoneInput}
              />
            </div>
            {phoneError && <p style={s.errorMsg}>{phoneError}</p>}

            <button
              type="submit"
              disabled={sending || phone.replace(/\D/g, '').length < 9}
              style={{ ...s.btn, opacity: sending || phone.replace(/\D/g, '').length < 9 ? 0.5 : 1 }}
            >
              {sending ? <Spinner /> : 'Recevoir le code'}
            </button>
          </form>
        )}

        {/* ── Saisie OTP ── */}
        {(step === 'otp' || step === 'accepting') && (
          <form
            onSubmit={(e) => { e.preventDefault(); verifyAndAccept(otp.join('')); }}
            style={s.form}
            noValidate
          >
            <button
              type="button"
              onClick={() => { setStep('phone'); setOtp(['', '', '', '', '', '']); setOtpError(''); }}
              style={s.back}
            >
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
                  disabled={verifying || step === 'accepting'}
                  style={{
                    ...s.otpBox,
                    borderColor: otpError ? '#EF4444' : d ? '#534AB7' : '#E5E7EB',
                    background: d ? '#F5F4FF' : '#fff',
                  }}
                />
              ))}
            </div>
            {otpError && <p style={s.errorMsg}>{otpError}</p>}
            {acceptError && <p style={s.errorMsg}>{acceptError}</p>}

            <button
              type="submit"
              disabled={verifying || step === 'accepting' || otp.some((d) => !d)}
              style={{ ...s.btn, opacity: verifying || step === 'accepting' || otp.some((d) => !d) ? 0.5 : 1 }}
            >
              {step === 'accepting' ? <Spinner /> : verifying ? <Spinner /> : 'Activer mon compte'}
            </button>

            <div style={{ textAlign: 'center', marginTop: 16 }}>
              {countdown > 0 ? (
                <span style={{ fontSize: 13, color: '#9CA3AF' }}>
                  Renvoyer dans <strong style={{ color: '#534AB7' }}>{countdown}s</strong>
                </span>
              ) : (
                <button type="button" onClick={handleSendOtp} style={s.resend}>
                  Renvoyer le code
                </button>
              )}
            </div>
          </form>
        )}

        {/* ── Succès ── */}
        {step === 'success' && (
          <div style={s.center}>
            <div style={s.successIcon}>✓</div>
            <h2 style={s.successTitle}>Compte activé !</h2>
            <p style={s.successText}>
              Votre compte est en attente de validation par votre RH.
              <br />
              Vous serez notifié par SMS dès qu&apos;il sera activé.
            </p>
            <a href="/dashboard/login" style={s.btn}>
              Accéder à l&apos;espace RH →
            </a>
          </div>
        )}

      </div>
    </main>
  );
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <span style={{
      display: 'inline-block', width: 18, height: 18,
      border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff',
      borderRadius: '50%', animation: 'spin 0.7s linear infinite',
    }} />
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100dvh',
    background: '#F9FAFB',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 16px',
  },
  card: {
    width: '100%',
    maxWidth: 400,
    background: '#fff',
    borderRadius: 20,
    padding: '32px 28px',
    border: '1px solid #E5E7EB',
    boxShadow: '0 4px 24px rgba(0,0,0,0.05)',
  },

  // Logo
  logoWrap: { textAlign: 'center', marginBottom: 28 },
  logo: { fontSize: 30, fontWeight: 800, color: '#534AB7', display: 'block' },
  logoSub: { fontSize: 12, color: '#9CA3AF', marginTop: 4, display: 'block' },

  // Invitation info
  infoBox: {
    background: '#F5F4FF',
    borderRadius: 12,
    padding: '16px',
    marginBottom: 20,
    textAlign: 'center',
  },
  infoCompany: {
    fontSize: 13,
    color: '#534AB7',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    margin: '0 0 8px',
  },
  infoName: {
    fontSize: 18,
    fontWeight: 700,
    color: '#111827',
    margin: '0 0 4px',
  },
  infoPoste: {
    fontSize: 13,
    color: '#6B7280',
    margin: '0 0 8px',
  },
  infoExpiry: {
    fontSize: 12,
    color: '#9CA3AF',
    margin: 0,
  },

  // Formulaires
  form: { display: 'flex', flexDirection: 'column' as const, gap: 0 },
  title: { fontSize: 20, fontWeight: 700, color: '#111827', marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#6B7280', marginBottom: 20, lineHeight: 1.5 },
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
  errorMsg: { fontSize: 13, color: '#EF4444', marginBottom: 12, marginTop: 4 },
  back: {
    background: 'none', border: 'none', color: '#6B7280',
    fontSize: 14, cursor: 'pointer', padding: '0 0 16px', alignSelf: 'flex-start',
  },
  btn: {
    marginTop: 12,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    width: '100%',
    background: '#534AB7', color: '#fff',
    border: 'none', borderRadius: 12, padding: '15px',
    fontSize: 16, fontWeight: 600, cursor: 'pointer',
    minHeight: 52, textDecoration: 'none',
  },
  resend: {
    background: 'none', border: 'none', color: '#534AB7',
    fontSize: 14, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline',
  },

  // OTP
  otpRow: { display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 8 },
  otpBox: {
    width: 48, height: 56, border: '1.5px solid #E5E7EB', borderRadius: 10,
    textAlign: 'center', fontSize: 22, fontWeight: 700, outline: 'none',
  },

  // États centrés
  center: {
    display: 'flex', flexDirection: 'column' as const,
    alignItems: 'center', gap: 12, textAlign: 'center',
    padding: '16px 0',
  },
  spinner: {
    width: 36, height: 36,
    border: '3px solid #E5E7EB', borderTopColor: '#534AB7',
    borderRadius: '50%', animation: 'spin 0.8s linear infinite',
  },
  hint: { fontSize: 14, color: '#6B7280', margin: 0 },
  errorIcon: {
    width: 52, height: 52, borderRadius: '50%',
    background: '#FEF2F2', color: '#EF4444',
    fontSize: 22, fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  errorText: { fontSize: 15, color: '#374151', fontWeight: 600, margin: 0 },

  // Succès
  successIcon: {
    width: 64, height: 64, borderRadius: '50%',
    background: '#F0FDF4', color: '#22C55E',
    fontSize: 28, fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  successTitle: { fontSize: 20, fontWeight: 800, color: '#111827', margin: 0 },
  successText: { fontSize: 14, color: '#6B7280', lineHeight: 1.6, margin: 0 },
};
