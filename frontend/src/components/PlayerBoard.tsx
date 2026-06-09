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

interface RowEvalInfo {
  label: string;
  royalty: boolean;
}

function rowEval(
  row: 'top' | 'middle' | 'bottom',
  board: Board,
  royalties: { top: number; middle: number; bottom: number },
): RowEvalInfo | null {
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
    return { label: pts > 0 ? `${name} +${pts}` : name, royalty: pts > 0 };
  } else {
    const cards = row === 'middle' ? board.middle : board.bottom;
    if (cards.length < 5) return null;
    const eval5 = evaluate5CardHand(cards);
    if (eval5.handRank === HandRank.HighCard) return null;
    const name = HAND_RANK_NAMES[eval5.handRank];
    const pts = royalties[row];
    return { label: pts > 0 ? `${name} +${pts}` : name, royalty: pts > 0 };
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
  /** Count of trailing cards in each row that are optimistic (placed this turn,
   *  not yet submitted) and therefore takeable-back. */
  pendingByRow?: { top: number; middle: number; bottom: number };
  /** Tap a pending card to return it to hand. pendingIndex is its position
   *  among that row's pending cards (0 = first placed there this turn). */
  onUndoCard?: (row: Row, pendingIndex: number) => void;
}

function RowOverlay({ label, royalty, cardWidthPx }: { label: string; royalty: boolean; cardWidthPx: number }) {
  return (
    <div
      className={`absolute inset-0 flex items-center justify-center bg-black/60 pointer-events-none rounded z-[5] ${royalty ? 'royalty-glow' : ''}`}
      style={{ fontSize: Math.max(10, Math.round(cardWidthPx * 0.28)) }}
    >
      <span className={`font-bold drop-shadow-lg ${royalty ? 'text-yellow-300' : 'text-white'}`}>{label}</span>
    </div>
  );
}

export function PlayerBoard({
  board, playerName, fouled, isCurrentPlayer, onRowClick, hasCardSelected,
  cardWidthPx, score, disconnected, rank, pendingByRow, onUndoCard,
}: PlayerBoardProps) {
  const topSlots = padRow(board.top, 3);
  const middleSlots = padRow(board.middle, 5);
  const bottomSlots = padRow(board.bottom, 5);

  const pending = pendingByRow ?? { top: 0, middle: 0, bottom: 0 };

  // Render one slot: a takeable-back pending card (tap to return to hand), or a
  // plain CardSlot. The trailing `pending[rowKey]` cards of a row are pending.
  const renderSlot = (
    rowKey: 'top' | 'middle' | 'bottom',
    rowEnum: Row,
    cards: Card[],
    card: Card | null,
    i: number,
    key: string,
  ) => {
    const committed = cards.length - pending[rowKey];
    const undoable = !!onUndoCard && card !== null && i >= committed && i < cards.length;
    if (!undoable) return <CardSlot key={key} card={card} widthPx={cardWidthPx} />;
    return (
      <div
        key={key}
        onClick={(e) => { e.stopPropagation(); onUndoCard!(rowEnum, i - committed); }}
        title="Tap to take this card back"
        className="relative cursor-pointer hover:brightness-110 active:scale-95 transition-transform"
        data-testid={`pending-${rowKey}-${i - committed}`}
      >
        <CardComponent card={card} widthPx={cardWidthPx} />
        <span className="absolute inset-0 rounded ring-2 ring-yellow-400/80 pointer-events-none" />
        <span
          className="absolute -top-1 -right-1 bg-yellow-400 text-black rounded-full font-black flex items-center justify-center pointer-events-none leading-none"
          style={{ width: Math.max(10, Math.round(cardWidthPx * 0.34)), height: Math.max(10, Math.round(cardWidthPx * 0.34)), fontSize: Math.max(8, Math.round(cardWidthPx * 0.26)) }}
        >
          ↶
        </span>
      </div>
    );
  };

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
  const topEval = !fouled ? rowEval('top', board, royalties) : null;
  const middleEval = !fouled ? rowEval('middle', board, royalties) : null;
  const bottomEval = !fouled ? rowEval('bottom', board, royalties) : null;

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
        {topSlots.map((card, i) => renderSlot('top', Row.Top, board.top, card, i, `top-${i}`))}
        <div style={{ width: cardWidthPx }} />
        {topEval && <RowOverlay label={topEval.label} royalty={topEval.royalty} cardWidthPx={cardWidthPx} />}
      </div>

      {/* Middle row - 5 cards */}
      <div
        data-testid="row-middle"
        onClick={rowClickable(middleHasSpace) ? () => onRowClick!(Row.Middle) : undefined}
        className={`${rowClass(!!rowClickable(middleHasSpace))} mb-1`}
        style={{ gap, ...(fouled ? { transform: 'rotate(1deg)' } : {}) }}
      >
        {middleSlots.map((card, i) => renderSlot('middle', Row.Middle, board.middle, card, i, `mid-${i}`))}
        {middleEval && <RowOverlay label={middleEval.label} royalty={middleEval.royalty} cardWidthPx={cardWidthPx} />}
      </div>

      {/* Bottom row - 5 cards */}
      <div
        data-testid="row-bottom"
        onClick={rowClickable(bottomHasSpace) ? () => onRowClick!(Row.Bottom) : undefined}
        className={rowClass(!!rowClickable(bottomHasSpace))}
        style={{ gap, ...(fouled ? { transform: 'rotate(3deg)' } : {}) }}
      >
        {bottomSlots.map((card, i) => renderSlot('bottom', Row.Bottom, board.bottom, card, i, `bot-${i}`))}
        {bottomEval && <RowOverlay label={bottomEval.label} royalty={bottomEval.royalty} cardWidthPx={cardWidthPx} />}
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
