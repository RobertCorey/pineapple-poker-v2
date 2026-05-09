import type { KitesCard } from '@shared/kites/types';

interface Props {
  card: KitesCard;
  /** Optional label badge for stack ordering. */
  size?: 'sm' | 'md' | 'lg';
  selectable?: boolean;
  selected?: boolean;
  onClick?: () => void;
}

const SYMBOL_BG: Record<string, string> = {
  red: 'bg-red-500',
  orange: 'bg-orange-400',
  yellow: 'bg-yellow-400',
  blue: 'bg-blue-500',
  purple: 'bg-purple-500',
};

export function KitesCardView({ card, size = 'md', selectable, selected, onClick }: Props) {
  const dims =
    size === 'sm'
      ? 'w-12 h-16'
      : size === 'lg'
      ? 'w-24 h-32'
      : 'w-16 h-24';

  return (
    <button
      type="button"
      disabled={!selectable}
      onClick={onClick}
      className={[
        'relative rounded-md border bg-gradient-to-br from-sky-700/60 to-sky-900/80',
        'flex flex-col items-center justify-center gap-1',
        dims,
        selectable ? 'cursor-pointer hover:from-sky-600/60 hover:to-sky-800/80' : 'cursor-default',
        selected
          ? 'border-cyan-300 ring-2 ring-cyan-400 -translate-y-2 shadow-lg shadow-cyan-500/30'
          : 'border-gray-700',
        'transition-transform',
      ].join(' ')}
      aria-label={`Kite card with ${card.symbols.join(' and ')}`}
    >
      {/* Faint kite icon — chevron triangle */}
      <div className="absolute inset-0 flex items-center justify-center opacity-25 pointer-events-none">
        <div className="w-8 h-8 rotate-45 border-l-2 border-t-2 border-white/60" />
      </div>
      {/* Symbol pips */}
      <div className="relative flex gap-1">
        {card.symbols.map((s, i) => (
          <span
            key={`${s}-${i}`}
            className={`inline-block rounded-full ${SYMBOL_BG[s]} ${
              size === 'sm' ? 'w-2.5 h-2.5' : size === 'lg' ? 'w-5 h-5' : 'w-3.5 h-3.5'
            } shadow ring-1 ring-black/30`}
            title={s}
          />
        ))}
      </div>
    </button>
  );
}
