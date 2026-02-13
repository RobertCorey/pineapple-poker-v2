import type { Card } from '@shared/core/types';
import { RANK_NAMES } from '@shared/core/constants';

const SUIT_SYMBOLS: Record<string, string> = {
  h: '\u2665',
  d: '\u2666',
  c: '\u2663',
  s: '\u2660',
};

/** Four-color deck: each suit gets a distinct background color. */
const SUIT_BG: Record<string, string> = {
  s: 'bg-gray-900',   // spades — black
  h: 'bg-red-700',    // hearts — red
  d: 'bg-blue-700',   // diamonds — blue
  c: 'bg-green-700',  // clubs — green
};

const SUIT_BORDER: Record<string, string> = {
  s: 'border-gray-700',
  h: 'border-red-500',
  d: 'border-blue-500',
  c: 'border-green-500',
};

const SUIT_SELECTED_RING: Record<string, string> = {
  s: 'ring-gray-400',
  h: 'ring-red-300',
  d: 'ring-blue-300',
  c: 'ring-green-300',
};

export type CardSize = 'sm' | 'md' | 'lg';

const SIZE_CLASSES: Record<CardSize, string> = {
  sm: 'w-8 h-11 text-[10px] rounded',
  md: 'w-10 h-14 text-xs rounded-md',
  lg: 'w-14 h-20 text-sm rounded-lg',
};

const RANK_SIZE: Record<CardSize, string> = {
  sm: 'text-xs leading-none',
  md: 'text-sm leading-none',
  lg: 'text-lg leading-none',
};

interface CardProps {
  card: Card | null;
  faceDown?: boolean;
  selected?: boolean;
  onClick?: () => void;
  /** @deprecated use `size` instead */
  small?: boolean;
  size?: CardSize;
}

export function CardComponent({ card, faceDown, selected, onClick, small, size }: CardProps) {
  const resolvedSize: CardSize = size ?? (small ? 'md' : 'lg');
  const sizeClass = SIZE_CLASSES[resolvedSize];
  const rankSize = RANK_SIZE[resolvedSize];

  if (!card || faceDown) {
    return (
      <div
        className={`
          ${sizeClass}
          border-2 border-gray-600 bg-gray-800
          flex items-center justify-center cursor-default
          bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(255,255,255,0.05)_4px,rgba(255,255,255,0.05)_8px)]
        `}
      >
        {!card && <span className="text-gray-500">-</span>}
      </div>
    );
  }

  const symbol = SUIT_SYMBOLS[card.suit];
  const rank = RANK_NAMES[card.rank];
  const bg = SUIT_BG[card.suit];
  const border = SUIT_BORDER[card.suit];
  const ring = SUIT_SELECTED_RING[card.suit];

  return (
    <div
      onClick={onClick}
      className={`
        ${sizeClass}
        border-2 ${bg} ${border} flex flex-col items-center justify-center
        font-bold select-none transition-all text-white
        ${selected ? `border-yellow-400 ring-2 ${ring} -translate-y-2 shadow-lg shadow-yellow-900/30` : ''}
        ${onClick ? 'cursor-pointer hover:brightness-125 hover:-translate-y-1' : 'cursor-default'}
      `}
    >
      <span className={rankSize}>{rank}</span>
      <span className={rankSize}>{symbol}</span>
    </div>
  );
}
