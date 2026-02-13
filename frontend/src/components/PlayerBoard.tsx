import type { Board, Card, Row } from '@shared/core/types';
import { evaluate5CardHand, evaluate3CardHand } from '@shared/game-logic/hand-evaluation';
import { describeHand, describe3CardHand } from '../utils/handDescription.ts';
import { CardComponent } from './CardComponent.tsx';
import type { CardSize } from './CardComponent.tsx';

const SPACER_W: Record<CardSize, string> = {
  sm: 'w-8',
  md: 'w-10',
  lg: 'w-14',
};

const EMPTY_SLOT: Record<CardSize, string> = {
  sm: 'w-8 h-11 rounded',
  md: 'w-10 h-14 rounded-md',
  lg: 'w-14 h-20 rounded-lg',
};

interface SlotProps {
  card: Card | null;
  size?: CardSize;
}

function CardSlot({ card, size = 'lg' }: SlotProps) {
  return (
    <div>
      {card ? (
        <CardComponent card={card} size={size} />
      ) : (
        <div
          className={`
            ${EMPTY_SLOT[size]}
            border-2 border-dashed
            flex items-center justify-center
            border-gray-600 bg-gray-800/30
          `}
        />
      )}
    </div>
  );
}

function padRow(cards: Card[], size: number): (Card | null)[] {
  const result: (Card | null)[] = [...cards];
  while (result.length < size) result.push(null);
  return result;
}

function RowEval({ cards, size, isTop }: { cards: Card[]; size: number; isTop: boolean }) {
  if (cards.length === size) {
    const label = isTop
      ? describe3CardHand(evaluate3CardHand(cards))
      : describeHand(evaluate5CardHand(cards));
    return <div className="text-center text-[10px] text-gray-500 -mt-0.5 mb-0.5">{label}</div>;
  }
  if (cards.length > 0) {
    return <div className="text-center text-[10px] text-gray-600 -mt-0.5 mb-0.5">({cards.length}/{size})</div>;
  }
  return null;
}

interface PlayerBoardProps {
  board: Board;
  playerName: string;
  fouled?: boolean;
  isCurrentPlayer?: boolean;
  onRowClick?: (row: Row) => void;
  hasCardSelected?: boolean;
  /** @deprecated use `cardSize` instead */
  small?: boolean;
  cardSize?: CardSize;
  score?: number;
  hasPlaced?: boolean;
  isObserver?: boolean;
  disconnected?: boolean;
}

export function PlayerBoard({
  board, playerName, fouled, isCurrentPlayer, onRowClick, hasCardSelected, small,
  cardSize, score, hasPlaced, isObserver, disconnected,
}: PlayerBoardProps) {
  const size: CardSize = cardSize ?? (small ? 'md' : 'lg');
  const topSlots = padRow(board.top, 3);
  const middleSlots = padRow(board.middle, 5);
  const bottomSlots = padRow(board.bottom, 5);

  const topHasSpace = board.top.length < 3;
  const middleHasSpace = board.middle.length < 5;
  const bottomHasSpace = board.bottom.length < 5;

  const rowClickable = (hasSpace: boolean) =>
    isCurrentPlayer && hasCardSelected && onRowClick && hasSpace;

  const isSmallText = size === 'sm' || size === 'md';

  return (
    <div className={`
      border p-2
      ${isCurrentPlayer ? 'border-green-600 bg-green-900/20' : 'border-gray-700 bg-gray-800/20'}
    `}>
      <div className={`text-center mb-1 ${isSmallText ? 'text-xs' : 'text-sm'} text-gray-300 flex items-center justify-center gap-2`}>
        <span>{playerName}</span>
        {score !== undefined && (
          <span className={`text-xs ${score >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            [{score >= 0 ? `+${score}` : score}]
          </span>
        )}
        {hasPlaced !== undefined && (
          <span className="text-xs">{hasPlaced ? '\u2713' : '\u00b7'}</span>
        )}
        {fouled && (
          <span className="text-xs text-red-400">[FOULED]</span>
        )}
        {disconnected && <span className="text-xs text-red-500">[DC]</span>}
        {isObserver && <span className="text-xs text-blue-400">[OBS]</span>}
      </div>

      {/* Top row - 3 cards, centered */}
      <div
        data-testid="row-top"
        onClick={rowClickable(topHasSpace) ? () => onRowClick!('top' as Row) : undefined}
        className={`
          flex justify-center gap-1 mb-1 rounded px-1 py-0.5 transition-colors
          ${rowClickable(topHasSpace) ? 'cursor-pointer bg-yellow-900/20 hover:bg-yellow-900/40 ring-1 ring-yellow-500/40' : ''}
        `}
      >
        <div className={SPACER_W[size]} />
        {topSlots.map((card, i) => (
          <CardSlot key={`top-${i}`} card={card} size={size} />
        ))}
        <div className={SPACER_W[size]} />
      </div>
      <RowEval cards={board.top} size={3} isTop />

      {/* Middle row - 5 cards */}
      <div
        data-testid="row-middle"
        onClick={rowClickable(middleHasSpace) ? () => onRowClick!('middle' as Row) : undefined}
        className={`
          flex justify-center gap-1 mb-1 rounded px-1 py-0.5 transition-colors
          ${rowClickable(middleHasSpace) ? 'cursor-pointer bg-yellow-900/20 hover:bg-yellow-900/40 ring-1 ring-yellow-500/40' : ''}
        `}
      >
        {middleSlots.map((card, i) => (
          <CardSlot key={`mid-${i}`} card={card} size={size} />
        ))}
      </div>
      <RowEval cards={board.middle} size={5} isTop={false} />

      {/* Bottom row - 5 cards */}
      <div
        data-testid="row-bottom"
        onClick={rowClickable(bottomHasSpace) ? () => onRowClick!('bottom' as Row) : undefined}
        className={`
          flex justify-center gap-1 rounded px-1 py-0.5 transition-colors
          ${rowClickable(bottomHasSpace) ? 'cursor-pointer bg-yellow-900/20 hover:bg-yellow-900/40 ring-1 ring-yellow-500/40' : ''}
        `}
      >
        {bottomSlots.map((card, i) => (
          <CardSlot key={`bot-${i}`} card={card} size={size} />
        ))}
      </div>
      <RowEval cards={board.bottom} size={5} isTop={false} />
    </div>
  );
}
