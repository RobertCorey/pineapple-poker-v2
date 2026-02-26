import type { Board, Card } from '@shared/core/types';
import { HandRank, Rank, Row, ThreeCardHandRank } from '@shared/core/types';
import { HAND_RANK_NAMES, THREE_CARD_HAND_RANK_NAMES, TOP_PAIR_ROYALTIES } from '@shared/core/constants';
import { evaluate3CardHand, evaluate5CardHand } from '@shared/game-logic/hand-evaluation';
import { calculateRoyalties } from '@shared/game-logic/scoring';
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

function rowLabel(
  row: 'top' | 'middle' | 'bottom',
  board: Board,
  royalties: { top: number; middle: number; bottom: number },
): string | null {
  if (row === 'top') {
    if (board.top.length < 3) return null;
    const eval3 = evaluate3CardHand(board.top);
    if (eval3.handRank === ThreeCardHandRank.HighCard) return null;
    if (eval3.handRank === ThreeCardHandRank.Pair) {
      // Skip pairs below 6s (no royalties)
      const pairRank = eval3.kickers[0] as Rank;
      if (!(pairRank in TOP_PAIR_ROYALTIES)) return null;
    }
    const name = THREE_CARD_HAND_RANK_NAMES[eval3.handRank];
    const pts = royalties.top;
    return pts > 0 ? `${name} +${pts}` : name;
  } else {
    const cards = row === 'middle' ? board.middle : board.bottom;
    if (cards.length < 5) return null;
    const eval5 = evaluate5CardHand(cards);
    if (eval5.handRank === HandRank.HighCard) return null;
    const name = HAND_RANK_NAMES[eval5.handRank];
    const pts = royalties[row];
    return pts > 0 ? `${name} +${pts}` : name;
  }
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
  rank?: number;
}

function RowOverlay({ label, cardWidthPx }: { label: string; cardWidthPx: number }) {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center bg-black/60 pointer-events-none rounded z-[5]"
      style={{ fontSize: Math.max(10, Math.round(cardWidthPx * 0.28)) }}
    >
      <span className="text-white font-bold drop-shadow-lg">{label}</span>
    </div>
  );
}

export function PlayerBoard({
  board, playerName, fouled, isCurrentPlayer, onRowClick, hasCardSelected,
  cardWidthPx, score, disconnected, rank,
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
    relative flex justify-center rounded px-1 py-0.5 transition-colors
    ${clickable ? 'cursor-pointer bg-yellow-900/20 hover:bg-yellow-900/40 ring-1 ring-yellow-500/40' : ''}
  `;

  // Compute row labels (only when not fouled)
  const royalties = calculateRoyalties(board);
  const topLabel = !fouled ? rowLabel('top', board, royalties) : null;
  const middleLabel = !fouled ? rowLabel('middle', board, royalties) : null;
  const bottomLabel = !fouled ? rowLabel('bottom', board, royalties) : null;

  return (
    <div
      className={`relative border overflow-hidden ${isCurrentPlayer ? 'border-green-600 bg-green-900/20' : 'border-gray-700 bg-gray-800/20'}`}
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
        {rank !== undefined && (
          <span className="text-yellow-400 flex-shrink-0">{rank === 1 ? '\u{1F451}' : `#${rank}`}</span>
        )}
        {fouled && <span className="text-red-400 flex-shrink-0">[F]</span>}
        {disconnected && <span className="text-red-500 flex-shrink-0">[DC]</span>}
      </div>

      {/* Top row - 3 cards, centered with spacers to match 5-card row width */}
      <div
        data-testid="row-top"
        onClick={rowClickable(topHasSpace) ? () => onRowClick!(Row.Top) : undefined}
        className={`${rowClass(!!rowClickable(topHasSpace))} mb-1`}
        style={{ gap, ...(fouled ? { transform: 'rotate(-2deg)' } : {}) }}
      >
        <div style={{ width: cardWidthPx }} />
        {topSlots.map((card, i) => (
          <CardSlot key={`top-${i}`} card={card} widthPx={cardWidthPx} />
        ))}
        <div style={{ width: cardWidthPx }} />
        {topLabel && <RowOverlay label={topLabel} cardWidthPx={cardWidthPx} />}
      </div>

      {/* Middle row - 5 cards */}
      <div
        data-testid="row-middle"
        onClick={rowClickable(middleHasSpace) ? () => onRowClick!(Row.Middle) : undefined}
        className={`${rowClass(!!rowClickable(middleHasSpace))} mb-1`}
        style={{ gap, ...(fouled ? { transform: 'rotate(1deg)' } : {}) }}
      >
        {middleSlots.map((card, i) => (
          <CardSlot key={`mid-${i}`} card={card} widthPx={cardWidthPx} />
        ))}
        {middleLabel && <RowOverlay label={middleLabel} cardWidthPx={cardWidthPx} />}
      </div>

      {/* Bottom row - 5 cards */}
      <div
        data-testid="row-bottom"
        onClick={rowClickable(bottomHasSpace) ? () => onRowClick!(Row.Bottom) : undefined}
        className={rowClass(!!rowClickable(bottomHasSpace))}
        style={{ gap, ...(fouled ? { transform: 'rotate(3deg)' } : {}) }}
      >
        {bottomSlots.map((card, i) => (
          <CardSlot key={`bot-${i}`} card={card} widthPx={cardWidthPx} />
        ))}
        {bottomLabel && <RowOverlay label={bottomLabel} cardWidthPx={cardWidthPx} />}
      </div>

      {/* Foul overlay */}
      {fouled && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-red-900/70 pointer-events-none rounded"
          style={{ fontSize: Math.max(16, Math.round(cardWidthPx * 0.6)) }}
        >
          <span className="text-white font-black tracking-widest drop-shadow-lg">FOUL</span>
        </div>
      )}
    </div>
  );
}
