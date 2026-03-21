'use client';

import { useEffect, useState } from 'react';

interface SplashScreenProps {
  onDone: () => void;
}

export default function SplashScreen({ onDone }: SplashScreenProps) {
  const [phase, setPhase] = useState<1 | 2 | 3 | 4>(1);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(2), 500);
    const t2 = setTimeout(() => setPhase(3), 1200);
    const t3 = setTimeout(() => setPhase(4), 1800);
    const t4 = setTimeout(() => onDone(), 2500);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [onDone]);

  return (
    <>
      <style>{`
        @keyframes circleAppear {
          from { transform: scale(0); opacity: 0; }
          to   { transform: scale(1); opacity: 1; }
        }
        @keyframes circleToEnvelope {
          0%   { border-radius: 50%; }
          100% { border-radius: 12px; }
        }
        @keyframes particleFly1 {
          0%   { transform: translate(0, 0) scale(1); opacity: 1; }
          100% { transform: translate(-60px, -80px) scale(0); opacity: 0; }
        }
        @keyframes particleFly2 {
          0%   { transform: translate(0, 0) scale(1); opacity: 1; }
          100% { transform: translate(70px, -60px) scale(0); opacity: 0; }
        }
        @keyframes particleFly3 {
          0%   { transform: translate(0, 0) scale(1); opacity: 1; }
          100% { transform: translate(-40px, 90px) scale(0); opacity: 0; }
        }
        @keyframes particleFly4 {
          0%   { transform: translate(0, 0) scale(1); opacity: 1; }
          100% { transform: translate(80px, 70px) scale(0); opacity: 0; }
        }
        @keyframes particleFly5 {
          0%   { transform: translate(0, 0) scale(1); opacity: 1; }
          100% { transform: translate(10px, -100px) scale(0); opacity: 0; }
        }
        @keyframes fadeInText {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .splash-circle-phase1 {
          animation: circleAppear 0.5s ease-out forwards;
        }
        .splash-circle-phase2 {
          animation: circleToEnvelope 0.7s ease-in-out forwards;
        }
        .splash-particle-1 { animation: particleFly1 0.6s ease-out forwards; }
        .splash-particle-2 { animation: particleFly2 0.6s ease-out 0.05s forwards; }
        .splash-particle-3 { animation: particleFly3 0.6s ease-out 0.1s forwards; }
        .splash-particle-4 { animation: particleFly4 0.6s ease-out 0.15s forwards; }
        .splash-particle-5 { animation: particleFly5 0.6s ease-out 0.2s forwards; }
        .splash-text {
          animation: fadeInText 0.7s ease-out forwards;
        }
      `}</style>

      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          background: '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Phase 1 & 2 & 3 : cercle / enveloppe + particules */}
        {(phase === 1 || phase === 2 || phase === 3) && (
          <div style={{ position: 'relative', width: 96, height: 96 }}>
            {/* Cercle / Enveloppe */}
            <div
              className={
                phase === 1
                  ? 'splash-circle-phase1'
                  : phase === 2
                    ? 'splash-circle-phase2'
                    : undefined
              }
              style={{
                width: 96,
                height: 96,
                background: '#534AB7',
                borderRadius: phase === 1 ? '50%' : phase === 2 ? '12px' : '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {phase >= 2 && (
                /* SVG enveloppe simple */
                <svg
                  width="52"
                  height="40"
                  viewBox="0 0 52 40"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <rect x="1" y="1" width="50" height="38" rx="4" fill="white" fillOpacity="0.2" stroke="white" strokeWidth="2" />
                  <path d="M1 5L26 23L51 5" stroke="white" strokeWidth="2" strokeLinecap="round" />
                </svg>
              )}
            </div>

            {/* Particules — phase 3 */}
            {phase === 3 && (
              <>
                <div
                  className="splash-particle-1"
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    width: 10,
                    height: 10,
                    marginTop: -5,
                    marginLeft: -5,
                    background: '#FFD700',
                    borderRadius: 2,
                  }}
                />
                <div
                  className="splash-particle-2"
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    width: 8,
                    height: 8,
                    marginTop: -4,
                    marginLeft: -4,
                    background: '#FF6B6B',
                    borderRadius: 2,
                  }}
                />
                <div
                  className="splash-particle-3"
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    width: 8,
                    height: 8,
                    marginTop: -4,
                    marginLeft: -4,
                    background: '#4ECDC4',
                    borderRadius: 2,
                  }}
                />
                <div
                  className="splash-particle-4"
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    width: 10,
                    height: 10,
                    marginTop: -5,
                    marginLeft: -5,
                    background: '#A29BFE',
                    borderRadius: 2,
                  }}
                />
                <div
                  className="splash-particle-5"
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    width: 7,
                    height: 7,
                    marginTop: -3,
                    marginLeft: -3,
                    background: '#FD79A8',
                    borderRadius: 2,
                  }}
                />
              </>
            )}
          </div>
        )}

        {/* Phase 4 : texte Kado */}
        {phase === 4 && (
          <span
            className="splash-text"
            style={{
              color: '#534AB7',
              fontWeight: 800,
              fontSize: 48,
              letterSpacing: '-1px',
              fontFamily: 'system-ui, -apple-system, sans-serif',
            }}
          >
            Kado
          </span>
        )}
      </div>
    </>
  );
}
