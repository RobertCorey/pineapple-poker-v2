/**
 * Western-styled playing card for the Saloon mode. VENDORED layout from
 * components/CardComponent.tsx, restyled: cream stock, four-color suits,
 * plus a card-back variant for face-down deals.
 */
import type { CSSProperties } from 'react';
import type { Card } from './vendor/types.ts';
import { RANK_NAMES } from './vendor/constants.ts';

const SUIT_SYMBOL: Record<string, string> = {
  s: '♠',
  h: '♥',
  d: '♦',
  c: '♣',
};

/** Four-color deck, same suit colors as multiplayer: spades black, hearts
 *  red, diamonds blue, clubs green — on cream western card stock. */
const SUIT_COLOR: Record<string, string> = {
  s: 'text-stone-900',
  h: 'text-red-700',
  d: 'text-blue-700',
  c: 'text-green-700',
};

export const CARD_ASPECT = 1.4;

interface SaloonCardProps {
  card: Card | null;
  widthPx: number;
  selected?: boolean;
  onClick?: () => void;
  /** Render a face-down card back (used while a rival ponders their deal). */
  back?: boolean;
}

function frameStyle(w: number): CSSProperties {
  return {
    width: w,
    height: Math.round(w * CARD_ASPECT),
    borderRadius: Math.max(2, Math.round(w * 0.1)),
  };
}

export function SaloonCard({ card, widthPx, selected, onClick, back }: SaloonCardProps) {
  if (back) {
    return (
      <div
        className="border-2 border-red-950 bg-red-900 bg-[repeating-linear-gradient(135deg,transparent,transparent_3px,rgba(255,215,130,0.18)_3px,rgba(255,215,130,0.18)_6px)] flex items-center justify-center"
        style={frameStyle(widthPx)}
      >
        <span className="text-amber-200/70" style={{ fontSize: Math.round(widthPx * 0.4) }}>★</span>
      </div>
    );
  }

  if (!card) {
    return (
      <div
        className="border-2 border-dashed border-amber-200/25 bg-black/20 flex items-center justify-center"
        style={frameStyle(widthPx)}
      >
        <span className="text-amber-200/30">·</span>
      </div>
    );
  }

  const rank = RANK_NAMES[card.rank];
  const rankFontSize = rank.length > 1 ? widthPx * 0.33 : widthPx * 0.43;

  return (
    <div
      onClick={onClick}
      className={`
        border bg-amber-50 flex flex-col items-center justify-center
        font-bold select-none transition-all ${SUIT_COLOR[card.suit]}
        ${selected ? 'border-yellow-500 ring-2 ring-yellow-400 -translate-y-2 shadow-lg shadow-black/50' : 'border-stone-400'}
        ${onClick ? 'cursor-pointer hover:brightness-105 hover:-translate-y-1' : 'cursor-default'}
      `}
      style={frameStyle(widthPx)}
    >
      <span style={{ fontSize: Math.max(7, Math.round(rankFontSize)), lineHeight: '1' }}>{rank}</span>
      {widthPx >= 25 && (
        <span style={{ fontSize: Math.max(5, Math.round(widthPx * 0.25)), lineHeight: '1' }}>
          {SUIT_SYMBOL[card.suit]}
        </span>
      )}
    </div>
  );
}
