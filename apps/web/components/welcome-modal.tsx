'use client';

import { useEffect, useState } from 'react';

export type WelcomeRole = 'beneficiary' | 'merchant' | 'company';

const STORAGE_KEYS: Record<WelcomeRole, string> = {
  beneficiary: 'kado_welcomed_beneficiary',
  merchant:    'kado_welcomed_merchant',
  company:     'kado_welcomed_company',
};

const CONFIG: Record<WelcomeRole, {
  bg: string;
  accentColor: string;
  icon: string;
  title: string;
  subtitle: string;
  benefits: Array<{ emoji: string; text: string }>;
  floatingEmojis: string[];
  particleColors: string[];
}> = {
  beneficiary: {
    bg: 'linear-gradient(145deg, #2D1B69 0%, #534AB7 45%, #A855F7 100%)',
    accentColor: '#FFD700',
    icon: '🎁',
    title: 'Bienvenue sur Kado !',
    subtitle: 'Vos cadeaux digitaux vous attendent',
    benefits: [
      { emoji: '🎁', text: 'Recevez vos bons cadeaux par SMS' },
      { emoji: '📱', text: 'Scannez en un geste chez nos commerçants' },
      { emoji: '💝', text: 'Des offres exclusives rien que pour vous' },
      { emoji: '✨', text: 'Fidélité récompensée à chaque achat' },
    ],
    floatingEmojis: ['🎁', '🎊', '✨', '💝', '🎀', '🌟', '😊', '🎉'],
    particleColors: ['#FFD700', '#FF6B9D', '#A855F7', '#60A5FA', '#34D399', '#FFF', '#FBBF24'],
  },
  merchant: {
    bg: 'linear-gradient(145deg, #0A0F1E 0%, #1E3A5F 50%, #534AB7 100%)',
    accentColor: '#34D399',
    icon: '🏪',
    title: 'Bienvenue chez Kado !',
    subtitle: 'Boostez votre chiffre d\'affaires avec Kado',
    benefits: [
      { emoji: '👥', text: 'Des clients fidèles qui reviennent' },
      { emoji: '📈', text: 'Volume de ventes en hausse constante' },
      { emoji: '⚡', text: 'Paiements validés en moins de 3 secondes' },
      { emoji: '💰', text: 'Reversement automatique Wave ou Orange Money' },
    ],
    floatingEmojis: ['👥', '📈', '💰', '⭐', '🚀', '🏆', '🛒', '✅'],
    particleColors: ['#34D399', '#60A5FA', '#534AB7', '#F59E0B', '#FFF', '#A855F7', '#38BDF8'],
  },
  company: {
    bg: 'linear-gradient(145deg, #0F2040 0%, #1E3A8A 50%, #534AB7 100%)',
    accentColor: '#60A5FA',
    icon: '💼',
    title: 'Bienvenue sur Kado RH !',
    subtitle: 'La gestion de vos avantages salariés, simplifiée',
    benefits: [
      { emoji: '🎯', text: 'Émettez des bons en quelques secondes' },
      { emoji: '📊', text: 'Tableau de bord analytique complet' },
      { emoji: '👨‍👩‍👧', text: 'Motivez et fidélisez vos équipes' },
      { emoji: '✅', text: 'Zéro logistique, 100% digital' },
    ],
    floatingEmojis: ['💼', '✅', '📊', '🎯', '👥', '🤝', '🌍', '⚡'],
    particleColors: ['#60A5FA', '#534AB7', '#34D399', '#FFF', '#F59E0B', '#A855F7', '#38BDF8'],
  },
};

// ─── Confetti particle ─────────────────────────────────────────────────────────

interface Particle {
  id: number; x: number; color: string; delay: number; duration: number;
  size: number; shape: 'square' | 'circle' | 'triangle';
}

function generateParticles(colors: string[], count = 50): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    color: colors[Math.floor(Math.random() * colors.length)],
    delay: Math.random() * 2.5,
    duration: 2.5 + Math.random() * 2,
    size: 6 + Math.random() * 10,
    shape: (['square', 'circle', 'triangle'] as const)[Math.floor(Math.random() * 3)],
  }));
}

// ─── Floating emoji ────────────────────────────────────────────────────────────

interface FloatingEmoji { id: number; emoji: string; x: number; delay: number; duration: number; size: number; }

function generateFloatingEmojis(emojis: string[], count = 12): FloatingEmoji[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    emoji: emojis[i % emojis.length],
    x: 5 + Math.random() * 90,
    delay: Math.random() * 3,
    duration: 3 + Math.random() * 3,
    size: 24 + Math.random() * 28,
  }));
}

// ─── WelcomeModal ──────────────────────────────────────────────────────────────

export default function WelcomeModal({ role, name }: { role: WelcomeRole; name?: string }) {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [particles] = useState(() => generateParticles(CONFIG[role].particleColors));
  const [floatingEmojis] = useState(() => generateFloatingEmojis(CONFIG[role].floatingEmojis));

  const AUTO_DISMISS = 5500; // ms

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const key = STORAGE_KEYS[role];
    if (!localStorage.getItem(key)) {
      setVisible(true);
      localStorage.setItem(key, '1');
    }
  }, [role]);

  useEffect(() => {
    if (!visible) return;
    let start: number;
    let raf: number;
    function tick(ts: number) {
      if (!start) start = ts;
      const elapsed = ts - start;
      setProgress(Math.min((elapsed / AUTO_DISMISS) * 100, 100));
      if (elapsed < AUTO_DISMISS) {
        raf = requestAnimationFrame(tick);
      } else {
        dismiss();
      }
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible]);

  function dismiss() {
    setClosing(true);
    setTimeout(() => setVisible(false), 500);
  }

  if (!visible) return null;

  const cfg = CONFIG[role];

  return (
    <>
      <style>{`
        @keyframes confettiFall {
          0%   { transform: translateY(-20px) rotate(0deg); opacity: 1; }
          80%  { opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
        }
        @keyframes floatUp {
          0%   { transform: translateY(0) scale(0.8); opacity: 0; }
          15%  { opacity: 1; }
          85%  { opacity: 0.7; }
          100% { transform: translateY(-110vh) scale(1.1); opacity: 0; }
        }
        @keyframes popIn {
          0%   { transform: scale(0) rotate(-15deg); opacity: 0; }
          70%  { transform: scale(1.1) rotate(5deg); }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes iconBounce {
          0%, 100% { transform: translateY(0) scale(1); }
          25%  { transform: translateY(-18px) scale(1.08); }
          50%  { transform: translateY(-8px) scale(1.04); }
          75%  { transform: translateY(-14px) scale(1.06); }
        }
        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes fadeSlideIn {
          0%   { opacity: 0; transform: translateY(30px) scale(0.95); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes fadeSlideOut {
          0%   { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(-40px) scale(0.9); }
        }
        @keyframes benefitIn {
          0%   { opacity: 0; transform: translateX(-24px); }
          100% { opacity: 1; transform: translateX(0); }
        }
        @keyframes progressFill {
          from { width: 0%; }
        }
        @keyframes pulseGlow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,255,255,0.2); }
          50% { box-shadow: 0 0 0 18px rgba(255,255,255,0); }
        }
      `}</style>

      <div
        onClick={dismiss}
        style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          animation: closing ? 'fadeSlideOut 0.5s ease forwards' : 'fadeSlideIn 0.4s ease',
          cursor: 'pointer',
        }}
      >
        {/* ── Confetti ── */}
        {particles.map(p => (
          <div key={p.id} style={{
            position: 'absolute',
            left: `${p.x}%`,
            top: -20,
            width: p.size,
            height: p.shape === 'circle' ? p.size : p.shape === 'triangle' ? 0 : p.size,
            background: p.shape !== 'triangle' ? p.color : 'transparent',
            borderRadius: p.shape === 'circle' ? '50%' : 2,
            borderLeft: p.shape === 'triangle' ? `${p.size / 2}px solid transparent` : undefined,
            borderRight: p.shape === 'triangle' ? `${p.size / 2}px solid transparent` : undefined,
            borderBottom: p.shape === 'triangle' ? `${p.size}px solid ${p.color}` : undefined,
            animation: `confettiFall ${p.duration}s ${p.delay}s ease-in infinite`,
            pointerEvents: 'none',
          }} />
        ))}

        {/* ── Floating emojis ── */}
        {floatingEmojis.map(e => (
          <div key={e.id} style={{
            position: 'absolute',
            left: `${e.x}%`,
            bottom: -40,
            fontSize: e.size,
            animation: `floatUp ${e.duration}s ${e.delay}s ease-in infinite`,
            pointerEvents: 'none',
            userSelect: 'none',
          }}>
            {e.emoji}
          </div>
        ))}

        {/* ── Card ── */}
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'relative',
            width: 'min(420px, 92vw)',
            borderRadius: 28,
            background: cfg.bg,
            padding: '36px 28px 28px',
            boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
            animation: 'popIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
            overflow: 'hidden',
            cursor: 'default',
          }}
        >
          {/* Glow background */}
          <div style={{
            position: 'absolute', inset: 0, opacity: 0.15,
            background: `radial-gradient(circle at 50% 0%, ${cfg.accentColor}, transparent 65%)`,
            pointerEvents: 'none',
          }} />

          {/* Close */}
          <button onClick={dismiss} style={{
            position: 'absolute', top: 14, right: 14,
            background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 50,
            width: 30, height: 30, color: '#fff', fontSize: 16, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            lineHeight: 1,
          }}>✕</button>

          {/* Main icon */}
          <div style={{
            fontSize: 72, textAlign: 'center' as const,
            animation: 'iconBounce 2s ease-in-out infinite',
            marginBottom: 8, filter: 'drop-shadow(0 8px 20px rgba(0,0,0,0.4))',
          }}>
            {cfg.icon}
          </div>

          {/* Title */}
          <h1 style={{
            textAlign: 'center' as const,
            color: '#fff',
            fontSize: 24,
            fontWeight: 900,
            margin: '0 0 4px',
            letterSpacing: '-0.5px',
            background: `linear-gradient(90deg, #fff 0%, ${cfg.accentColor} 50%, #fff 100%)`,
            backgroundSize: '200% auto',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            animation: 'shimmer 3s linear infinite',
          }}>
            {name ? `Bonjour ${name} !` : cfg.title}
          </h1>

          <p style={{
            textAlign: 'center' as const,
            color: 'rgba(255,255,255,0.8)',
            fontSize: 15,
            margin: '0 0 28px',
            lineHeight: 1.4,
          }}>
            {cfg.subtitle}
          </p>

          {/* Benefits */}
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10, marginBottom: 28 }}>
            {cfg.benefits.map((b, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: 'rgba(255,255,255,0.1)',
                borderRadius: 12, padding: '10px 14px',
                animation: `benefitIn 0.4s ${0.3 + i * 0.1}s both ease-out`,
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255,255,255,0.15)',
              }}>
                <span style={{ fontSize: 22, minWidth: 28 }}>{b.emoji}</span>
                <span style={{ color: '#fff', fontSize: 14, fontWeight: 500, lineHeight: 1.3 }}>{b.text}</span>
              </div>
            ))}
          </div>

          {/* CTA button */}
          <button
            onClick={dismiss}
            style={{
              width: '100%', padding: '14px 0', borderRadius: 14, border: 'none',
              background: cfg.accentColor, color: role === 'merchant' ? '#0A0F1E' : '#1E0B4B',
              fontSize: 16, fontWeight: 800, cursor: 'pointer', letterSpacing: 0.2,
              animation: 'pulseGlow 2s ease infinite',
              boxShadow: `0 6px 24px ${cfg.accentColor}60`,
            }}
          >
            C'est parti ! 🚀
          </button>

          {/* Progress bar */}
          <div style={{
            marginTop: 14, height: 3, background: 'rgba(255,255,255,0.15)',
            borderRadius: 4, overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: `${progress}%`,
              background: cfg.accentColor,
              borderRadius: 4,
              transition: 'width 0.1s linear',
            }} />
          </div>
          <p style={{ textAlign: 'center' as const, color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 6 }}>
            Se ferme automatiquement…
          </p>
        </div>
      </div>
    </>
  );
}
