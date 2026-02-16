import type { Board, Card } from '@shared/core/types';
import { Row } from '@shared/core/types';
import { CardComponent, CARD_ASPECT } from './CardComponent.tsx';

function CardSlot({ card, widthPx }: { card: Card | null; widthPx: number }) {
  if (card) {
    return <CardComponent card={card} widthPx={widthPx} />;
  }
  return (
    <div
      className="border-2 border-dashed flex items-center justify-center border-gray-600 bg-gray-800/30"
      style={{
        width: widthPx,
        height: Math.round(widthPx * CARD_ASPECT),
        borderRadius: Math.max(2, Math.round(widthPx * 0.1)),
      }}
    />
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
  cardWidthPx: number;
  score?: number;
  disconnected?: boolean;
}

export function PlayerBoard({
  board, playerName, fouled, isCurrentPlayer, onRowClick, hasCardSelected,
  cardWidthPx, score, disconnected,
}: PlayerBoardProps) {
  const topSlots = padRow(board.top, 3);
  const middleSlots = padRow(board.middle, 5);
  const bottomSlots = padRow(board.bottom, 5);

  const topHasSpace = board.top.length < 3;
  const middleHasSpace = board.middle.length < 5;
  const bottomHasSpace = board.bottom.length < 5;

  const rowClickable = (hasSpace: boolean) =>
    isCurrentPlayer && hasCardSelected && onRowClick && hasSpace;

  const gap = Math.max(2, Math.round(cardWidthPx * 0.06));
  const boardPad = Math.max(4, Math.round(cardWidthPx * 0.12));
  const headerFs = Math.max(8, Math.round(cardWidthPx * 0.22));
  const boardMaxW = 5 * cardWidthPx + 4 * gap + 2 * boardPad + 4;

  const rowClass = (clickable: boolean) => `
    flex justify-center rounded px-1 py-0.5 transition-colors
    ${clickable ? 'cursor-pointer bg-yellow-900/20 hover:bg-yellow-900/40 ring-1 ring-yellow-500/40' : ''}
  `;

  return (
    <div
      className={`border overflow-hidden ${isCurrentPlayer ? 'border-green-600 bg-green-900/20' : 'border-gray-700 bg-gray-800/20'}`}
      style={{ padding: boardPad, maxWidth: boardMaxW }}
    >
      <div
        className="text-center mb-1 text-gray-300 flex items-center justify-center gap-1 overflow-hidden whitespace-nowrap"
        style={{ fontSize: headerFs, lineHeight: '1.2' }}
      >
        <span className="truncate">{playerName}</span>
        {score !== undefined && (
          <span className="flex-shrink-0" style={{ color: score >= 0 ? '#4ade80' : '#f87171' }}>
            [{score >= 0 ? `+${score}` : score}]
          </span>
        )}
        {fouled && <span className="text-red-400 flex-shrink-0">[F]</span>}
        {disconnected && <span className="text-red-500 flex-shrink-0">[DC]</span>}
      </div>

      {/* Top row - 3 cards, centered with spacers to match 5-card row width */}
      <div
        data-testid="row-top"
        onClick={rowClickable(topHasSpace) ? () => onRowClick!(Row.Top) : undefined}
        className={`${rowClass(!!rowClickable(topHasSpace))} mb-1`}
        style={{ gap }}
      >
        <div style={{ width: cardWidthPx }} />
        {topSlots.map((card, i) => (
          <CardSlot key={`top-${i}`} card={card} widthPx={cardWidthPx} />
        ))}
        <div style={{ width: cardWidthPx }} />
      </div>

      {/* Middle row - 5 cards */}
      <div
        data-testid="row-middle"
        onClick={rowClickable(middleHasSpace) ? () => onRowClick!(Row.Middle) : undefined}
        className={`${rowClass(!!rowClickable(middleHasSpace))} mb-1`}
        style={{ gap }}
      >
        {middleSlots.map((card, i) => (
          <CardSlot key={`mid-${i}`} card={card} widthPx={cardWidthPx} />
        ))}
      </div>

      {/* Bottom row - 5 cards */}
      <div
        data-testid="row-bottom"
        onClick={rowClickable(bottomHasSpace) ? () => onRowClick!(Row.Bottom) : undefined}
        className={rowClass(!!rowClickable(bottomHasSpace))}
        style={{ gap }}
      >
        {bottomSlots.map((card, i) => (
          <CardSlot key={`bot-${i}`} card={card} widthPx={cardWidthPx} />
        ))}
      </div>
    </div>
  );
}
