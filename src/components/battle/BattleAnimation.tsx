import { useState, useEffect, useCallback } from 'react';
import { Blader } from '../../types';

type Phase = 'countdown' | 'clash' | 'ready';

interface BattleAnimationProps {
  blader1: Blader;
  blader2: Blader;
  lang: string;
  onReady: () => void; // Called when user clicks "click for result"
  onCancel: () => void;
}

export default function BattleAnimation({ blader1, blader2, lang, onReady, onCancel }: BattleAnimationProps) {
  const [phase, setPhase] = useState<Phase>('countdown');
  const [count, setCount] = useState(3);
  const [sparks, setSparks] = useState(false);
  const [isCounting, setIsCounting] = useState(false);

  // Countdown: 3 → 2 → 1 → LANCIO!
  useEffect(() => {
    if (phase !== 'countdown' || !isCounting) return;
    if (count > 0) {
      const t = setTimeout(() => setCount(c => c - 1), 900);
      return () => clearTimeout(t);
    } else {
      // Show LANCIO then transition to clash
      const t = setTimeout(() => setPhase('clash'), 700);
      return () => clearTimeout(t);
    }
  }, [phase, count, isCounting]);

  // Clash phase: animate beys colliding, sparks, then go to ready
  useEffect(() => {
    if (phase !== 'clash') return;
    const t1 = setTimeout(() => setSparks(true), 800);
    const t2 = setTimeout(() => setPhase('ready'), 3000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [phase]);

  const handleOverlayClick = useCallback(() => {
    if (phase === 'ready') onReady();
  }, [phase, onReady]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'radial-gradient(ellipse at center, #0d0d2e 0%, #050510 100%)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        cursor: phase === 'ready' ? 'pointer' : 'default',
        overflow: 'hidden',
      }}
      onClick={handleOverlayClick}
    >
      {/* Animated background rings */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {[0.3, 0.5, 0.7].map((opacity, i) => (
          <div key={i} style={{
            position: 'absolute',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: `${200 + i * 150}px`, height: `${200 + i * 150}px`,
            borderRadius: '50%',
            border: `1px solid rgba(0,212,255,${opacity * 0.3})`,
            animation: `pulse-ring ${1.5 + i * 0.5}s ease-in-out infinite`,
            animationDelay: `${i * 0.2}s`,
          }} />
        ))}
      </div>

      {/* Blader names top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: '100%', maxWidth: 700, padding: '0 40px',
        marginBottom: 60,
      }}>
        <BladerLabel blader={blader1} side="left" />
        <div style={{
          fontFamily: 'Orbitron', fontSize: '1rem', color: 'var(--secondary)',
          fontWeight: 900, letterSpacing: 4,
        }}>VS</div>
        <BladerLabel blader={blader2} side="right" />
      </div>

      {phase === 'countdown' && !isCounting && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, zIndex: 10 }}>
          <div style={{
            fontFamily: 'Orbitron', fontSize: '1.2rem', color: 'white',
            letterSpacing: 4, textTransform: 'uppercase', textAlign: 'center',
            marginBottom: 10, textShadow: '0 0 10px rgba(0,212,255,0.3)'
          }}>
            {lang === 'it' ? 'PRONTI AL LANCIO?' : 'READY FOR LAUNCH?'}
          </div>
          <button
            className="btn btn-primary btn-lg"
            style={{
              padding: '16px 48px', fontSize: '1.2rem', fontFamily: 'Orbitron',
              borderRadius: 100, boxShadow: '0 0 25px var(--primary-glow)',
              border: '2px solid var(--primary)',
              cursor: 'pointer',
            }}
            onClick={() => setIsCounting(true)}
            id="start-countdown-btn"
          >
            ⚡ {lang === 'it' ? 'AVVIA COUNTDOWN' : 'START COUNTDOWN'} ⚡
          </button>
        </div>
      )}

      {phase === 'countdown' && isCounting && (
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div
            key={count}
            style={{
              fontFamily: 'Orbitron',
              fontSize: count === 0 ? '3.5rem' : '8rem',
              fontWeight: 900,
              color: count === 0 ? 'var(--accent)' : 'white',
              textShadow: count === 0
                ? '0 0 40px var(--accent), 0 0 80px rgba(255,215,0,0.5)'
                : '0 0 30px rgba(0,212,255,0.8), 0 0 60px rgba(0,212,255,0.4)',
              animation: 'count-pop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
              letterSpacing: count === 0 ? 4 : 0,
            }}
          >
            {count === 0 ? (lang === 'it' ? 'LANCIO!' : 'LAUNCH!') : count}
          </div>
          {count > 0 && (
            <div style={{
              fontFamily: 'Orbitron', fontSize: '0.85rem', color: 'var(--text-muted)',
              letterSpacing: 6, textTransform: 'uppercase',
            }}>
              {lang === 'it' ? 'Pronti...' : 'Get ready...'}
            </div>
          )}
        </div>
      )}

      {(phase === 'clash' || phase === 'ready') && (
        <div style={{ position: 'relative', width: 600, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {/* Bey 1 */}
          <div style={{
            position: 'absolute',
            left: phase === 'ready' ? '50%' : 0,
            transform: phase === 'ready' ? 'translateX(calc(-50% - 70px))' : 'translateX(0)',
            transition: 'left 0.7s cubic-bezier(0.25, 0.46, 0.45, 0.94), transform 0.7s ease',
          }}>
            <SpinningBey color={blader1.avatar_color} />
          </div>

          {/* Collision center: sparks */}
          {sparks && (
            <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none' }}>
              {Array.from({ length: 16 }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    width: `${4 + Math.random() * 6}px`,
                    height: `${4 + Math.random() * 6}px`,
                    borderRadius: '50%',
                    background: [
                      '#ffd700', '#00d4ff', '#ff6b35', '#ffffff', '#ff4444', '#00ff88',
                    ][i % 6],
                    top: '50%', left: '50%',
                    animation: `spark-${i % 4} 0.6s ease-out forwards`,
                    animationDelay: `${Math.random() * 0.3}s`,
                    boxShadow: `0 0 8px currentColor`,
                  }}
                />
              ))}
              {/* Central flash */}
              <div style={{
                position: 'absolute',
                width: 100, height: 100,
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(255,215,0,0.9) 0%, rgba(0,212,255,0.6) 40%, transparent 70%)',
                top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
                animation: 'clash-flash 0.8s ease-out forwards',
              }} />
            </div>
          )}

          {/* Bey 2 */}
          <div style={{
            position: 'absolute',
            right: phase === 'ready' ? '50%' : 0,
            transform: phase === 'ready' ? 'translateX(calc(50% + 70px))' : 'translateX(0)',
            transition: 'right 0.7s cubic-bezier(0.25, 0.46, 0.45, 0.94), transform 0.7s ease',
          }}>
            <SpinningBey color={blader2.avatar_color} />
          </div>
        </div>
      )}

      {/* Ready state CTA */}
      {phase === 'ready' && (
        <div style={{
          marginTop: 60,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
          animation: 'fade-in-up 0.5s ease-out',
        }}>
          <div style={{
            fontFamily: 'Orbitron', fontSize: '1.5rem', fontWeight: 900,
            color: 'var(--accent)',
            textShadow: '0 0 20px rgba(255,215,0,0.6)',
            animation: 'pulse-text 1.5s ease-in-out infinite',
          }}>
            {lang === 'it' ? '⚡ CLICCA PER I RISULTATI ⚡' : '⚡ CLICK FOR RESULTS ⚡'}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontFamily: 'Orbitron', letterSpacing: 2 }}>
            {lang === 'it' ? 'Chi ha vinto?' : 'Who won?'}
          </div>
        </div>
      )}

      {/* Cancel button */}
      <button
        onClick={(e) => { e.stopPropagation(); onCancel(); }}
        style={{
          position: 'absolute', top: 20, right: 20,
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.1)',
          color: 'var(--text-muted)', padding: '8px 16px',
          borderRadius: 8, cursor: 'pointer', fontFamily: 'Orbitron', fontSize: '0.65rem',
          letterSpacing: 2, transition: 'all 0.2s',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
      >
        {lang === 'it' ? 'ANNULLA' : 'CANCEL'}
      </button>

      {/* Keyframes injected */}
      <style>{`
        @keyframes count-pop {
          0% { transform: scale(0.3); opacity: 0; }
          60% { transform: scale(1.15); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes bey-spin-anim {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse-ring {
          0%, 100% { opacity: 0.3; transform: translate(-50%, -50%) scale(1); }
          50% { opacity: 0.7; transform: translate(-50%, -50%) scale(1.05); }
        }
        @keyframes clash-flash {
          0% { opacity: 1; transform: translate(-50%, -50%) scale(0.5); }
          50% { opacity: 0.8; transform: translate(-50%, -50%) scale(1.5); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(2); }
        }
        @keyframes spark-0 {
          0% { transform: translate(-50%, -50%) translate(0, 0); opacity: 1; }
          100% { transform: translate(-50%, -50%) translate(80px, -80px) scale(0); opacity: 0; }
        }
        @keyframes spark-1 {
          0% { transform: translate(-50%, -50%) translate(0, 0); opacity: 1; }
          100% { transform: translate(-50%, -50%) translate(-80px, -80px) scale(0); opacity: 0; }
        }
        @keyframes spark-2 {
          0% { transform: translate(-50%, -50%) translate(0, 0); opacity: 1; }
          100% { transform: translate(-50%, -50%) translate(80px, 80px) scale(0); opacity: 0; }
        }
        @keyframes spark-3 {
          0% { transform: translate(-50%, -50%) translate(0, 0); opacity: 1; }
          100% { transform: translate(-50%, -50%) translate(-80px, 80px) scale(0); opacity: 0; }
        }
        @keyframes pulse-text {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(0.97); }
        }
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes bey-wobble {
          0%, 100% { transform: rotate(-3deg); }
          50% { transform: rotate(3deg); }
        }
      `}</style>
    </div>
  );
}

function SpinningBey({ color }: { color: string }) {
  return (
    <div style={{ position: 'relative', width: 90, height: 90 }}>
      {/* Outer ring spinning */}
      <div style={{
        position: 'absolute', inset: 0,
        borderRadius: '50%',
        background: `conic-gradient(from 0deg, ${color}, ${color}44, ${color}88, ${color})`,
        animation: 'bey-spin-anim 0.4s linear infinite',
        boxShadow: `0 0 30px ${color}88, 0 0 60px ${color}44`,
      }} />
      {/* Inner hub */}
      <div style={{
        position: 'absolute',
        top: '25%', left: '25%', right: '25%', bottom: '25%',
        borderRadius: '50%',
        background: `radial-gradient(circle, ${color} 0%, #1a1a3a 100%)`,
        boxShadow: `0 0 15px ${color}88`,
      }} />
      {/* Center dot */}
      <div style={{
        position: 'absolute',
        top: '42%', left: '42%', right: '42%', bottom: '42%',
        borderRadius: '50%',
        background: 'white',
        boxShadow: `0 0 10px white`,
      }} />
      {/* Trail effect */}
      <div style={{
        position: 'absolute', inset: -8,
        borderRadius: '50%',
        border: `2px solid ${color}44`,
        animation: 'bey-spin-anim 0.6s linear infinite reverse',
      }} />
    </div>
  );
}

function BladerLabel({ blader, side }: { blader: Blader; side: 'left' | 'right' }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: side === 'left' ? 'flex-start' : 'flex-end',
      gap: 8,
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: '50%',
        background: blader.avatar_color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Orbitron', fontWeight: 700, fontSize: '1rem', color: 'white',
        boxShadow: `0 0 20px ${blader.avatar_color}88`,
        alignSelf: side === 'left' ? 'flex-start' : 'flex-end',
        overflow: 'hidden',
      }}>
        {blader.avatar_image
          ? <img src={blader.avatar_image} alt={blader.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : blader.avatar_initials}
      </div>
      <div style={{
        fontFamily: 'Orbitron', fontSize: '1.1rem', fontWeight: 900,
        color: 'white', textShadow: `0 0 15px ${blader.avatar_color}`,
        textAlign: side === 'left' ? 'left' : 'right',
        maxWidth: 160,
      }}>
        {blader.name}
      </div>
      <div style={{
        fontSize: '0.75rem', color: 'var(--text-muted)',
        fontFamily: 'Orbitron', letterSpacing: 2,
      }}>
        {blader.wins}W · {blader.losses}L
      </div>
    </div>
  );
}
