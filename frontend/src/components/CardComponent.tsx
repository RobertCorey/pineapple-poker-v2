import type { Card } from '@shared/core/types';
import type { CSSProperties } from 'react';
import { RANK_NAMES } from '@shared/core/constants';

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

export const CARD_ASPECT = 1.4;

interface CardProps {
  card: Card | null;
  widthPx: number;
  selected?: boolean;
  onClick?: () => void;
}

function cardStyles(w: number) {
  return {
    card: {
      width: w,
      height: Math.round(w * CARD_ASPECT),
      borderRadius: Math.max(2, Math.round(w * 0.1)),
    } as CSSProperties,
    rank: {
      fontSize: Math.max(7, Math.round(w * 0.45)),
      lineHeight: '1',
    } as CSSProperties,
  };
}

export function CardComponent({ card, widthPx, selected, onClick }: CardProps) {
  const s = cardStyles(widthPx);

  if (!card) {
    return (
      <div
        className="border-2 border-gray-600 bg-gray-800 flex items-center justify-center cursor-default bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(255,255,255,0.05)_4px,rgba(255,255,255,0.05)_8px)]"
        style={s.card}
      >
        <span className="text-gray-500">-</span>
      </div>
    );
  }

  const rank = RANK_NAMES[card.rank];
  const bg = SUIT_BG[card.suit];
  const border = SUIT_BORDER[card.suit];
  const ring = SUIT_SELECTED_RING[card.suit];

  return (
    <div
      onClick={onClick}
      className={`
        border-2 ${bg} ${border} flex flex-col items-center justify-center
        font-bold select-none transition-all text-white
        ${selected ? `border-yellow-400 ring-2 ${ring} -translate-y-2 shadow-lg shadow-yellow-900/30` : ''}
        ${onClick ? 'cursor-pointer hover:brightness-125 hover:-translate-y-1' : 'cursor-default'}
      `}
      style={s.card}
    >
      <span style={s.rank}>{rank}</span>
    </div>
  );
}
