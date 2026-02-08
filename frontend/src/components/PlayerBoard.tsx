import type { Board, Card, Row } from '@shared/core/types';
import { CardComponent } from './CardComponent.tsx';

interface SlotProps {
  card: Card | null;
  row: Row;
  index: number;
  onSlotClick?: (row: Row, index: number) => void;
  small?: boolean;
}

function CardSlot({ card, row, index, onSlotClick, small }: SlotProps) {
  return (
    <div
      data-testid={`slot-${row}-${index}`}
      onClick={onSlotClick && !card ? () => onSlotClick(row, index) : undefined}
      className={!card && onSlotClick ? 'cursor-pointer' : ''}
    >
      {card ? (
        <CardComponent card={card} small={small} />
      ) : (
        <div
          className={`
            ${small ? 'w-10 h-14' : 'w-14 h-20'}
            rounded-lg border-2 border-dashed
            flex items-center justify-center
            ${onSlotClick ? 'border-yellow-500/60 bg-yellow-900/20 hover:bg-yellow-900/40' : 'border-gray-600 bg-gray-800/30'}
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

interface PlayerBoardProps {
  board: Board;
  playerName: string;
  fouled?: boolean;
  isCurrentPlayer?: boolean;
  onSlotClick?: (row: Row, index: number) => void;
  small?: boolean;
}

export function PlayerBoard({ board, playerName, fouled, isCurrentPlayer, onSlotClick, small }: PlayerBoardProps) {
  const topSlots = padRow(board.top, 3);
  const middleSlots = padRow(board.middle, 5);
  const bottomSlots = padRow(board.bottom, 5);

  return (
    <div className={`
      border p-2
      ${isCurrentPlayer ? 'border-green-600 bg-green-900/20' : 'border-gray-700 bg-gray-800/20'}
    `}>
      <div className={`text-center mb-1 ${small ? 'text-xs' : 'text-sm'} text-gray-300 flex items-center justify-center gap-2`}>
        <span>{playerName}</span>
        {fouled && (
          <span className="text-xs text-red-400">[FOULED]</span>
        )}
      </div>

      {/* Top row - 3 cards, centered */}
      <div className="flex justify-center gap-1 mb-1">
        <div className={small ? 'w-10' : 'w-14'} />
        {topSlots.map((card, i) => (
          <CardSlot
            key={`top-${i}`}
            card={card}
            row={'top' as Row}
            index={i}
            onSlotClick={isCurrentPlayer ? onSlotClick : undefined}
            small={small}
          />
        ))}
        <div className={small ? 'w-10' : 'w-14'} />
      </div>

      {/* Middle row - 5 cards */}
      <div className="flex justify-center gap-1 mb-1">
        {middleSlots.map((card, i) => (
          <CardSlot
            key={`mid-${i}`}
            card={card}
            row={'middle' as Row}
            index={i}
            onSlotClick={isCurrentPlayer ? onSlotClick : undefined}
            small={small}
          />
        ))}
      </div>

      {/* Bottom row - 5 cards */}
      <div className="flex justify-center gap-1">
        {bottomSlots.map((card, i) => (
          <CardSlot
            key={`bot-${i}`}
            card={card}
            row={'bottom' as Row}
            index={i}
            onSlotClick={isCurrentPlayer ? onSlotClick : undefined}
            small={small}
          />
        ))}
      </div>
    </div>
  );
}
