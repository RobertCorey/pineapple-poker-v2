import type { Card } from '@shared/core/types';
import { RANK_NAMES } from '@shared/core/constants';

const SUIT_SYMBOLS: Record<string, string> = {
  h: '\u2665',
  d: '\u2666',
  c: '\u2663',
  s: '\u2660',
};

function isRed(suit: string): boolean {
  return suit === 'h' || suit === 'd';
}

interface CardProps {
  card: Card | null;
  faceDown?: boolean;
  selected?: boolean;
  onClick?: () => void;
  small?: boolean;
}

export function CardComponent({ card, faceDown, selected, onClick, small }: CardProps) {
  if (!card || faceDown) {
    return (
      <div
        className={`
          ${small ? 'w-10 h-14 text-xs' : 'w-14 h-20 text-sm'}
          rounded-lg border-2 border-gray-600 bg-blue-800
          flex items-center justify-center cursor-default
          bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(255,255,255,0.05)_4px,rgba(255,255,255,0.05)_8px)]
        `}
      >
        {!card && <span className="text-gray-500">-</span>}
      </div>
    );
  }

  const red = isRed(card.suit);
  const symbol = SUIT_SYMBOLS[card.suit];
  const rank = RANK_NAMES[card.rank];

  return (
    <div
      onClick={onClick}
      className={`
        ${small ? 'w-10 h-14 text-xs' : 'w-14 h-20 text-sm'}
        rounded-lg border-2 bg-white flex flex-col items-center justify-center
        font-bold select-none transition-all
        ${red ? 'text-red-600' : 'text-gray-900'}
        ${selected ? 'border-yellow-400 ring-2 ring-yellow-400 -translate-y-2 shadow-lg' : 'border-gray-300'}
        ${onClick ? 'cursor-pointer hover:border-yellow-300 hover:-translate-y-1' : 'cursor-default'}
      `}
    >
      <span className={small ? 'text-sm leading-none' : 'text-lg leading-none'}>{rank}</span>
      <span className={small ? 'text-sm leading-none' : 'text-lg leading-none'}>{symbol}</span>
    </div>
  );
}
