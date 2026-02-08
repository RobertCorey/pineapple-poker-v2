import type { Board, Card, Row } from '@shared/core/types';
import { CardComponent } from './CardComponent.tsx';

interface SlotProps {
  card: Card | null;
  small?: boolean;
}

function CardSlot({ card, small }: SlotProps) {
  return (
    <div>
      {card ? (
        <CardComponent card={card} small={small} />
      ) : (
        <div
          className={`
            ${small ? 'w-10 h-14' : 'w-14 h-20'}
            rounded-lg border-2 border-dashed
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

interface PlayerBoardProps {
  board: Board;
  playerName: string;
  fouled?: boolean;
  isCurrentPlayer?: boolean;
  onRowClick?: (row: Row) => void;
  hasCardSelected?: boolean;
  small?: boolean;
}

export function PlayerBoard({ board, playerName, fouled, isCurrentPlayer, onRowClick, hasCardSelected, small }: PlayerBoardProps) {
  const topSlots = padRow(board.top, 3);
  const middleSlots = padRow(board.middle, 5);
  const bottomSlots = padRow(board.bottom, 5);

  const topHasSpace = board.top.length < 3;
  const middleHasSpace = board.middle.length < 5;
  const bottomHasSpace = board.bottom.length < 5;

  const rowClickable = (hasSpace: boolean) =>
    isCurrentPlayer && hasCardSelected && onRowClick && hasSpace;

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
      <div
        data-testid="row-top"
        onClick={rowClickable(topHasSpace) ? () => onRowClick!('top' as Row) : undefined}
        className={`
          flex justify-center gap-1 mb-1 rounded px-1 py-0.5 transition-colors
          ${rowClickable(topHasSpace) ? 'cursor-pointer bg-yellow-900/20 hover:bg-yellow-900/40 ring-1 ring-yellow-500/40' : ''}
        `}
      >
        <div className={small ? 'w-10' : 'w-14'} />
        {topSlots.map((card, i) => (
          <CardSlot
            key={`top-${i}`}
            card={card}
            small={small}
          />
        ))}
        <div className={small ? 'w-10' : 'w-14'} />
      </div>

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
          <CardSlot
            key={`mid-${i}`}
            card={card}
            small={small}
          />
        ))}
      </div>

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
          <CardSlot
            key={`bot-${i}`}
            card={card}
            small={small}
          />
        ))}
      </div>
    </div>
  );
}
