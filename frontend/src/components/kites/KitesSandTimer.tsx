import { useEffect, useState } from 'react';
import type { KitesTimer } from '@shared/kites/types';

interface Props {
  timer: KitesTimer;
  /** When true, shows a flip pulse on the timer. */
  isHighlighted?: boolean;
  /** When true, the timer is selectable and shows a click cursor. */
  selectable?: boolean;
  selected?: boolean;
  onClick?: () => void;
}

const COLOR_CLASSES: Record<string, { bulb: string; sand: string; ring: string; label: string }> = {
  red: { bulb: 'from-red-300/50 to-red-100/30', sand: 'bg-red-500', ring: 'ring-red-400', label: 'text-red-300' },
  orange: { bulb: 'from-orange-300/50 to-orange-100/30', sand: 'bg-orange-400', ring: 'ring-orange-400', label: 'text-orange-300' },
  yellow: { bulb: 'from-yellow-200/50 to-yellow-100/30', sand: 'bg-yellow-400', ring: 'ring-yellow-300', label: 'text-yellow-200' },
  white: { bulb: 'from-gray-200/50 to-gray-100/30', sand: 'bg-gray-200', ring: 'ring-white', label: 'text-gray-100' },
  blue: { bulb: 'from-blue-300/50 to-blue-100/30', sand: 'bg-blue-400', ring: 'ring-blue-400', label: 'text-blue-300' },
  purple: { bulb: 'from-purple-300/50 to-purple-100/30', sand: 'bg-purple-400', ring: 'ring-purple-400', label: 'text-purple-300' },
};

export function KitesSandTimer({ timer, isHighlighted, selectable, selected, onClick }: Props) {
  // Tick at 16Hz for smooth sand drain animation.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60);
    return () => clearInterval(id);
  }, []);

  const flowing = timer.flippedAt !== null;
  const elapsed = flowing ? Math.max(0, now - (timer.flippedAt as number)) : 0;
  const remaining = flowing ? Math.max(0, timer.durationMs - elapsed) : timer.durationMs;
  const fraction = flowing ? remaining / timer.durationMs : 1;
  const expired = flowing && remaining <= 0;
  const danger = flowing && fraction < 0.25 && !expired;

  const c = COLOR_CLASSES[timer.color] ?? COLOR_CLASSES.white;
  const topPct = fraction * 100;          // sand left in top bulb
  const bottomPct = (1 - fraction) * 100; // sand accumulated in bottom

  return (
    <button
      type="button"
      onClick={selectable ? onClick : undefined}
      disabled={!selectable}
      className={[
        'relative flex flex-col items-center gap-1 select-none',
        selectable ? 'cursor-pointer' : 'cursor-default',
        selected ? `ring-2 ring-offset-2 ring-offset-gray-950 ${c.ring} rounded-md` : '',
        isHighlighted ? 'animate-pulse' : '',
      ].join(' ')}
      aria-label={`${timer.color} timer, ${flowing ? `${Math.ceil(remaining / 1000)} seconds remaining` : 'paused'}`}
    >
      {/* Hourglass body */}
      <div className="relative w-10 h-16 flex flex-col">
        {/* Top bulb */}
        <div className={`relative flex-1 rounded-t-lg overflow-hidden border border-gray-700 bg-gradient-to-b ${c.bulb}`}>
          <div
            className={`absolute left-0 right-0 top-0 ${c.sand}`}
            style={{ height: `${topPct}%`, transition: 'height 80ms linear' }}
          />
        </div>
        {/* Pinch */}
        <div className="h-0.5 w-2 self-center bg-gray-700" />
        {/* Bottom bulb */}
        <div className={`relative flex-1 rounded-b-lg overflow-hidden border border-gray-700 bg-gradient-to-b ${c.bulb}`}>
          <div
            className={`absolute left-0 right-0 bottom-0 ${c.sand}`}
            style={{ height: `${bottomPct}%`, transition: 'height 80ms linear' }}
          />
        </div>
      </div>

      <div className={`text-[10px] uppercase tracking-wider ${c.label} ${danger ? 'animate-pulse text-red-300' : ''}`}>
        {expired ? 'OUT' : flowing ? `${Math.ceil(remaining / 1000)}s` : '—'}
      </div>
    </button>
  );
}
