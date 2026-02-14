import { useState, useEffect, useRef } from 'react';
import { soundEngine, getScoreIntensity, isWin, isLoss, type ScoreIntensity } from '../audio/SoundEngine';

// ---- Animated score counter hook ----

function getCountDuration(intensity: ScoreIntensity): number {
  switch (intensity) {
    case 'big-win':
    case 'big-loss':
      return 1400;
    case 'medium-win':
    case 'medium-loss':
      return 900;
    case 'small-win':
    case 'small-loss':
      return 500;
    case 'neutral':
      return 200;
  }
}

function useAnimatedScore(target: number, duration: number, startDelay: number = 400) {
  const [current, setCurrent] = useState(0);
  const [done, setDone] = useState(false);
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const lastTickVal = useRef<number>(0);

  useEffect(() => {
    if (target === 0) {
      const t = setTimeout(() => {
        setCurrent(0);
        setDone(true);
      }, startDelay);
      return () => clearTimeout(t);
    }

    const timeout = setTimeout(() => {
      const step = (now: number) => {
        if (!startTimeRef.current) startTimeRef.current = now;
        const elapsed = now - startTimeRef.current;
        const progress = Math.min(elapsed / duration, 1);

        // Ease-out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        const value = Math.round(target * eased);
        setCurrent(value);

        // Play tick when the displayed value changes
        if (value !== lastTickVal.current) {
          lastTickVal.current = value;
          soundEngine.playTick();
        }

        if (progress < 1) {
          rafRef.current = requestAnimationFrame(step);
        } else {
          setCurrent(target);
          setDone(true);
        }
      };

      rafRef.current = requestAnimationFrame(step);
    }, startDelay);

    return () => {
      clearTimeout(timeout);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration, startDelay]);

  return { current, done };
}

// ---- Confetti particles ----

const CONFETTI_COLORS = [
  '#fbbf24', // amber-400
  '#34d399', // emerald-400
  '#60a5fa', // blue-400
  '#f472b6', // pink-400
  '#a78bfa', // violet-400
  '#ffffff',
];

interface ConfettiProps {
  count: number;
}

function Confetti({ count }: ConfettiProps) {
  // useState lazy initializer: runs once on mount, Math.random is fine here
  const [particles] = useState(() =>
    Array.from({ length: count }, (_, i) => ({
      id: i,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      left: `${10 + Math.random() * 80}%`,
      delay: `${Math.random() * 0.6}s`,
      duration: `${1.2 + Math.random() * 1}s`,
      size: 4 + Math.random() * 6,
      drift: (Math.random() - 0.5) * 120,
    }))
  );

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-10">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute animate-confetti-fall"
          style={{
            left: p.left,
            top: '-8px',
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            borderRadius: p.size > 7 ? '50%' : '1px',
            animationDelay: p.delay,
            animationDuration: p.duration,
            '--confetti-drift': `${p.drift}px`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

// ---- Score styling helpers ----

function getScoreColor(intensity: ScoreIntensity): string {
  if (isWin(intensity)) return 'text-green-400';
  if (isLoss(intensity)) return 'text-red-400';
  return 'text-gray-400';
}

function getScoreSize(intensity: ScoreIntensity, compact: boolean): string {
  if (compact) {
    switch (intensity) {
      case 'big-win':
      case 'big-loss':
        return 'text-3xl';
      case 'medium-win':
      case 'medium-loss':
        return 'text-2xl';
      default:
        return 'text-xl';
    }
  }
  switch (intensity) {
    case 'big-win':
    case 'big-loss':
      return 'text-5xl';
    case 'medium-win':
    case 'medium-loss':
      return 'text-4xl';
    default:
      return 'text-3xl';
  }
}

function getGlowClass(intensity: ScoreIntensity, done: boolean): string {
  if (!done) return '';
  switch (intensity) {
    case 'big-win':
      return 'animate-glow-green';
    case 'big-loss':
      return 'animate-glow-red';
    default:
      return '';
  }
}

function formatAnimatedScore(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

// ---- Main component ----

interface ScoreRevealProps {
  score: number;
  /** Use compact sizing for match results where space is tighter. */
  compact?: boolean;
}

export function ScoreReveal({ score, compact = false }: ScoreRevealProps) {
  const intensity = getScoreIntensity(score);
  const duration = getCountDuration(intensity);
  const { current, done } = useAnimatedScore(score, duration);
  const soundPlayed = useRef(false);

  // Play impact sound when counting finishes
  useEffect(() => {
    if (done && !soundPlayed.current) {
      soundPlayed.current = true;
      soundEngine.playScoreReveal(intensity);
    }
  }, [done, intensity]);

  const confettiCount = intensity === 'big-win' ? 40 : intensity === 'medium-win' ? 20 : 0;
  const showShake = done && (intensity === 'big-loss');

  return (
    <div
      className={`relative py-3 ${compact ? 'py-2' : 'py-4'} ${showShake ? 'animate-screen-shake' : ''}`}
    >
      {/* Confetti for wins */}
      {done && confettiCount > 0 && <Confetti count={confettiCount} />}

      {/* Red flash overlay for big losses */}
      {done && intensity === 'big-loss' && (
        <div className="absolute inset-0 bg-red-600/15 rounded-lg animate-pulse pointer-events-none" />
      )}

      {/* Score display */}
      <div className="relative text-center z-20">
        <div className="text-gray-500 text-[10px] uppercase tracking-wider mb-1">
          Your Round
        </div>
        <div
          className={`
            font-bold tabular-nums transition-all
            ${getScoreSize(intensity, compact)}
            ${getScoreColor(intensity)}
            ${getGlowClass(intensity, done)}
            ${done && (intensity === 'big-win' || intensity === 'big-loss') ? 'scale-110' : ''}
          `}
        >
          {formatAnimatedScore(current)}
        </div>

        {/* Subtitle for notable outcomes */}
        {done && intensity === 'big-win' && (
          <div className="text-green-500/80 text-xs mt-1 animate-pulse">CRUSHED IT</div>
        )}
        {done && intensity === 'big-loss' && (
          <div className="text-red-500/80 text-xs mt-1">ROUGH ROUND</div>
        )}
      </div>
    </div>
  );
}
