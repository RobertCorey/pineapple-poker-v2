import { useState } from 'react';
import type { CSSProperties } from 'react';

interface TimerBarProps {
  /** Epoch ms when the phase times out. */
  deadline: number;
  /** Full phase duration (settings.turnTimeoutMs) — the bar is full at totalMs remaining. */
  totalMs: number;
  /** Last-seconds state: recolor the bar red. */
  urgent: boolean;
  /** Whole seconds remaining, for the accessible label only. */
  secondsLeft: number;
}

function computeAnim(deadline: number, totalMs: number) {
  const remaining = Math.max(0, deadline - Date.now());
  return { fraction: Math.min(1, remaining / totalMs), durationMs: remaining };
}

/**
 * Depleting turn-timer bar. The fill starts at the fraction of phase time
 * remaining and a CSS animation shrinks it to zero exactly at the deadline,
 * so it stays smooth without per-frame re-renders.
 */
export function TimerBar({ deadline, totalMs, urgent, secondsLeft }: TimerBarProps) {
  // Freeze the start fraction/duration per deadline (same adjust-during-render
  // pattern as useCountdown): changing animation-duration mid-flight would make
  // the playback position jump.
  const [anim, setAnim] = useState(() => computeAnim(deadline, totalMs));
  const [prevDeadline, setPrevDeadline] = useState(deadline);
  if (prevDeadline !== deadline) {
    setPrevDeadline(deadline);
    setAnim(computeAnim(deadline, totalMs));
  }

  return (
    <div
      className="h-1 bg-gray-800 flex-shrink-0"
      role="timer"
      aria-label={`${secondsLeft} seconds remaining`}
    >
      <div
        key={deadline}
        className={`h-full timer-deplete ${urgent ? 'bg-red-500' : 'bg-yellow-400'}`}
        style={{
          transform: `scaleX(${anim.fraction})`,
          '--timer-ms': `${anim.durationMs}ms`,
        } as CSSProperties}
      />
    </div>
  );
}
