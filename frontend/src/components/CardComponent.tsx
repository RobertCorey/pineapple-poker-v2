import type { Card } from '@shared/core/types';
import type { CSSProperties } from 'react';
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

export type CardSize = 'xs' | 'sm' | 'md' | 'lg';

const SIZE_CLASSES: Record<CardSize, string> = {
  xs: 'w-6 h-8 text-[7px] rounded-sm',
  sm: 'w-8 h-11 text-[10px] rounded',
  md: 'w-10 h-14 text-xs rounded-md',
  lg: 'w-14 h-20 text-sm rounded-lg',
};

const RANK_SIZE: Record<CardSize, string> = {
  xs: 'text-[8px] leading-none',
  sm: 'text-xs leading-none',
  md: 'text-sm leading-none',
  lg: 'text-lg leading-none',
};

export const CARD_ASPECT = 1.4;

interface CardProps {
  card: Card | null;
  faceDown?: boolean;
  selected?: boolean;
  onClick?: () => void;
  size?: CardSize;
  /** Pixel width — when set, card dimensions are computed from this instead of size presets. */
  widthPx?: number;
}

function pxStyles(w: number) {
  return {
    card: {
      width: w,
      height: Math.round(w * CARD_ASPECT),
      borderRadius: Math.max(2, Math.round(w * 0.1)),
    } as CSSProperties,
    rank: {
      fontSize: Math.max(7, Math.round(w * 0.3)),
      lineHeight: '1',
    } as CSSProperties,
  };
}

export function CardComponent({ card, faceDown, selected, onClick, size, widthPx }: CardProps) {
  const px = widthPx !== undefined;
  const resolvedSize: CardSize = size ?? 'lg';
  const ps = px ? pxStyles(widthPx!) : null;
  const sizeClass = px ? '' : SIZE_CLASSES[resolvedSize];
  const rankClass = px ? '' : RANK_SIZE[resolvedSize];

  if (!card || faceDown) {
    return (
      <div
        className={`
          ${sizeClass}
          border-2 border-gray-600 bg-gray-800
          flex items-center justify-center cursor-default
          bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(255,255,255,0.05)_4px,rgba(255,255,255,0.05)_8px)]
        `}
        style={ps?.card}
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
      style={ps?.card}
    >
      <span className={rankClass} style={ps?.rank}>{rank}</span>
      <span className={rankClass} style={ps?.rank}>{symbol}</span>
    </div>
  );
}
