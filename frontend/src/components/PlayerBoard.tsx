import type { CSSProperties } from 'react';
import type { Board, Card, Row } from '@shared/core/types';
import { CardComponent, CARD_ASPECT } from './CardComponent.tsx';
import type { CardSize } from './CardComponent.tsx';

const SPACER_W: Record<CardSize, string> = {
  xs: 'w-6',
  sm: 'w-8',
  md: 'w-10',
  lg: 'w-14',
};

const EMPTY_SLOT: Record<CardSize, string> = {
  xs: 'w-6 h-8 rounded-sm',
  sm: 'w-8 h-11 rounded',
  md: 'w-10 h-14 rounded-md',
  lg: 'w-14 h-20 rounded-lg',
};

interface SlotProps {
  card: Card | null;
  size?: CardSize;
  widthPx?: number;
}

function CardSlot({ card, size = 'lg', widthPx }: SlotProps) {
  if (card) {
    return <CardComponent card={card} size={size} widthPx={widthPx} />;
  }

  const pxStyle: CSSProperties | undefined = widthPx !== undefined ? {
    width: widthPx,
    height: Math.round(widthPx * CARD_ASPECT),
    borderRadius: Math.max(2, Math.round(widthPx * 0.1)),
  } : undefined;

  return (
    <div
      className={`
        ${widthPx !== undefined ? '' : EMPTY_SLOT[size]}
        border-2 border-dashed
        flex items-center justify-center
        border-gray-600 bg-gray-800/30
      `}
      style={pxStyle}
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
  cardSize?: CardSize;
  /** Pixel width for cards — overrides cardSize when set. */
  cardWidthPx?: number;
  score?: number;
  hasPlaced?: boolean;
  isObserver?: boolean;
  disconnected?: boolean;
  isBot?: boolean;
}

export function PlayerBoard({
  board, playerName, fouled, isCurrentPlayer, onRowClick, hasCardSelected,
  cardSize, cardWidthPx, score, hasPlaced, isObserver, disconnected, isBot,
}: PlayerBoardProps) {
  const size: CardSize = cardSize ?? 'lg';
  const px = cardWidthPx !== undefined;
  const topSlots = padRow(board.top, 3);
  const middleSlots = padRow(board.middle, 5);
  const bottomSlots = padRow(board.bottom, 5);

  const topHasSpace = board.top.length < 3;
  const middleHasSpace = board.middle.length < 5;
  const bottomHasSpace = board.bottom.length < 5;

  const rowClickable = (hasSpace: boolean) =>
    isCurrentPlayer && hasCardSelected && onRowClick && hasSpace;

  // Pixel-mode: proportional gap and padding
  const gap = px ? Math.max(2, Math.round(cardWidthPx! * 0.06)) : undefined;
  const boardPad = px ? Math.max(4, Math.round(cardWidthPx! * 0.12)) : undefined;
  const headerFs = px ? Math.max(8, Math.round(cardWidthPx! * 0.22)) : undefined;

  const isSmallText = !px && (size === 'sm' || size === 'md');

  const rowClass = (clickable: boolean) => `
    flex justify-center ${px ? '' : 'gap-1'} rounded px-1 py-0.5 transition-colors
    ${clickable ? 'cursor-pointer bg-yellow-900/20 hover:bg-yellow-900/40 ring-1 ring-yellow-500/40' : ''}
  `;

  // In pixel mode, constrain board width so long names don't stretch the grid
  // Board width = 5 cards + 4 gaps + 2 spacers (top row) + 2*padding + 2*border
  const boardMaxW = px
    ? 5 * cardWidthPx! + 4 * gap! + 2 * boardPad! + 4
    : undefined;

  return (
    <div
      className={`
        border overflow-hidden
        ${px ? '' : 'p-2'}
        ${isCurrentPlayer ? 'border-green-600 bg-green-900/20' : 'border-gray-700 bg-gray-800/20'}
      `}
      style={boardPad !== undefined ? { padding: boardPad, maxWidth: boardMaxW } : undefined}
    >
      <div
        className={`text-center mb-1 ${!px ? (isSmallText ? 'text-xs' : 'text-sm') : ''} text-gray-300 flex items-center justify-center gap-1 flex-wrap`}
        style={headerFs ? { fontSize: headerFs, lineHeight: '1.2' } : undefined}
      >
        <span className="truncate max-w-[10em]">{playerName}</span>
        {score !== undefined && (
          <span className={score >= 0 ? 'text-green-400' : 'text-red-400'}>
            [{score >= 0 ? `+${score}` : score}]
          </span>
        )}
        {hasPlaced !== undefined && (
          <span>{hasPlaced ? '\u2713' : '\u00b7'}</span>
        )}
        {fouled && <span className="text-red-400">[F]</span>}
        {disconnected && <span className="text-red-500">[DC]</span>}
        {isObserver && <span className="text-blue-400">[OBS]</span>}
        {isBot && <span className="text-cyan-400">[BOT]</span>}
      </div>

      {/* Top row - 3 cards, centered with spacers to match 5-card row width */}
      <div
        data-testid="row-top"
        onClick={rowClickable(topHasSpace) ? () => onRowClick!('top' as Row) : undefined}
        className={`${rowClass(!!rowClickable(topHasSpace))} mb-1`}
        style={gap ? { gap } : undefined}
      >
        {px
          ? <div style={{ width: cardWidthPx }} />
          : <div className={SPACER_W[size]} />
        }
        {topSlots.map((card, i) => (
          <CardSlot key={`top-${i}`} card={card} size={size} widthPx={cardWidthPx} />
        ))}
        {px
          ? <div style={{ width: cardWidthPx }} />
          : <div className={SPACER_W[size]} />
        }
      </div>

      {/* Middle row - 5 cards */}
      <div
        data-testid="row-middle"
        onClick={rowClickable(middleHasSpace) ? () => onRowClick!('middle' as Row) : undefined}
        className={`${rowClass(!!rowClickable(middleHasSpace))} mb-1`}
        style={gap ? { gap } : undefined}
      >
        {middleSlots.map((card, i) => (
          <CardSlot key={`mid-${i}`} card={card} size={size} widthPx={cardWidthPx} />
        ))}
      </div>

      {/* Bottom row - 5 cards */}
      <div
        data-testid="row-bottom"
        onClick={rowClickable(bottomHasSpace) ? () => onRowClick!('bottom' as Row) : undefined}
        className={rowClass(!!rowClickable(bottomHasSpace))}
        style={gap ? { gap } : undefined}
      >
        {bottomSlots.map((card, i) => (
          <CardSlot key={`bot-${i}`} card={card} size={size} widthPx={cardWidthPx} />
        ))}
      </div>
    </div>
  );
}
