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

/** Unicode suit symbols for card display. */
const SUIT_SYMBOL: Record<string, string> = {
  s: '\u2660',  // ♠
  h: '\u2665',  // ♥
  d: '\u2666',  // ♦
  c: '\u2663',  // ♣
};

export const CARD_ASPECT = 1.4;

interface CardProps {
  card: Card | null;
  widthPx: number;
  selected?: boolean;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}

function cardStyles(w: number, rankLen: number) {
  const rankFontSize = rankLen > 1 ? w * 0.35 : w * 0.45;
  return {
    card: {
      width: w,
      height: Math.round(w * CARD_ASPECT),
      borderRadius: Math.max(2, Math.round(w * 0.1)),
    } as CSSProperties,
    rank: {
      fontSize: Math.max(7, Math.round(rankFontSize)),
      lineHeight: '1',
    } as CSSProperties,
    suit: {
      fontSize: Math.max(5, Math.round(w * 0.25)),
      lineHeight: '1',
    } as CSSProperties,
  };
}

export function CardComponent({ card, widthPx, selected, onClick }: CardProps) {
  if (!card) {
    const s = cardStyles(widthPx, 1);
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
  const s = cardStyles(widthPx, rank.length);
  const bg = SUIT_BG[card.suit];
  const border = SUIT_BORDER[card.suit];
  const ring = SUIT_SELECTED_RING[card.suit];
  const suitSymbol = SUIT_SYMBOL[card.suit];

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
      {widthPx >= 25 && <span style={s.suit}>{suitSymbol}</span>}
    </div>
  );
}
