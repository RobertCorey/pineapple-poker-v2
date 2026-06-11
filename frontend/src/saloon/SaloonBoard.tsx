/**
 * OFC board for one seat at the saloon table. VENDORED structure from
 * components/PlayerBoard.tsx, restyled for the old-West theme and trimmed of
 * multiplayer-only concerns (Fantasy Land, disconnects, ranks).
 */
import type { Board, Card, Rank } from './vendor/types.ts';
import { HandRank, Row, ThreeCardHandRank } from './vendor/types.ts';
import {
  HAND_RANK_NAMES,
  THREE_CARD_HAND_RANK_NAMES,
  TOP_PAIR_ROYALTIES,
} from './vendor/constants.ts';
import { evaluate3CardHand, evaluate5CardHand } from './vendor/hand-evaluation.ts';
import { calculateRoyalties } from './vendor/scoring.ts';
import { SaloonCard, CARD_ASPECT } from './SaloonCard.tsx';

function CardSlot({ card, widthPx, back }: { card: Card | null; widthPx: number; back?: boolean }) {
  if (card || back) {
    return <SaloonCard card={card} widthPx={widthPx} back={back} />;
  }
  return (
    <div
      className="border-2 border-dashed border-amber-200/25 bg-black/15"
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

function RowOverlay({ label, royalty, cardWidthPx }: { label: string; royalty: boolean; cardWidthPx: number }) {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center bg-black/60 pointer-events-none rounded z-[5]"
      style={{ fontSize: Math.max(10, Math.round(cardWidthPx * 0.28)) }}
    >
      <span className={`font-bold drop-shadow-lg ${royalty ? 'text-yellow-300' : 'text-amber-50'}`}>{label}</span>
    </div>
  );
}

interface SaloonBoardProps {
  board: Board;
  name: string;
  /** Line under the name, e.g. running points or chips. */
  sub?: string;
  avatar?: string;
  fouled?: boolean;
  /** It's this seat's turn to act. */
  active?: boolean;
  /** Number of face-down cards to show beside the name (a rival's dealt hand). */
  ponderingCards?: number;
  cardWidthPx: number;
  onRowClick?: (row: Row) => void;
  hasCardSelected?: boolean;
  /** Count of trailing not-yet-submitted cards per row (tap to take back). */
  pendingByRow?: { top: number; middle: number; bottom: number };
  onUndoCard?: (row: Row, pendingIndex: number) => void;
}

export function SaloonBoard({
  board, name, sub, avatar, fouled, active, ponderingCards = 0,
  cardWidthPx, onRowClick, hasCardSelected, pendingByRow, onUndoCard,
}: SaloonBoardProps) {
  const topSlots = padRow(board.top, 3);
  const middleSlots = padRow(board.middle, 5);
  const bottomSlots = padRow(board.bottom, 5);

  const pending = pendingByRow ?? { top: 0, middle: 0, bottom: 0 };

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
        data-testid={`saloon-pending-${rowKey}-${i - committed}`}
      >
        <SaloonCard card={card} widthPx={cardWidthPx} />
        <span className="absolute inset-0 rounded ring-2 ring-yellow-500/80 pointer-events-none" />
      </div>
    );
  };

  const rowClickable = (hasSpace: boolean) => !!onRowClick && !!hasCardSelected && hasSpace;

  const gap = Math.max(2, Math.round(cardWidthPx * 0.06));
  const boardPad = Math.max(4, Math.round(cardWidthPx * 0.12));
  const headerFs = Math.max(9, Math.round(cardWidthPx * 0.24));
  const boardMaxW = 5 * cardWidthPx + 4 * gap + 2 * boardPad + 4;

  const rowClass = (clickable: boolean) => `
    relative flex justify-center rounded px-1 py-0.5 transition-colors
    ${clickable ? 'cursor-pointer bg-yellow-700/20 hover:bg-yellow-600/30 ring-1 ring-yellow-500/50' : ''}
  `;

  const royalties = calculateRoyalties(board);
  const topEval = !fouled ? rowEval('top', board, royalties) : null;
  const middleEval = !fouled ? rowEval('middle', board, royalties) : null;
  const bottomEval = !fouled ? rowEval('bottom', board, royalties) : null;

  return (
    <div
      className={`relative border-2 rounded overflow-hidden ${
        active
          ? 'border-yellow-500 bg-yellow-900/20 shadow-lg shadow-yellow-900/30'
          : 'border-amber-900/60 bg-black/20'
      }`}
      style={{ padding: boardPad, maxWidth: boardMaxW }}
    >
      <div
        className="text-center mb-1 text-amber-100 flex items-center justify-center gap-1 overflow-hidden whitespace-nowrap"
        style={{ fontSize: headerFs, lineHeight: '1.2' }}
      >
        {avatar && <span className="flex-shrink-0">{avatar}</span>}
        <span className="truncate font-bold">{name}</span>
        {sub && <span className="text-amber-300/80 flex-shrink-0">{sub}</span>}
        {fouled && <span className="text-red-400 font-bold flex-shrink-0">[FOUL]</span>}
        {ponderingCards > 0 && (
          <span className="flex gap-0.5 flex-shrink-0" aria-label={`${ponderingCards} cards dealt`}>
            {Array.from({ length: ponderingCards }, (_, i) => (
              <SaloonCard key={i} card={null} back widthPx={Math.round(cardWidthPx * 0.4)} />
            ))}
          </span>
        )}
      </div>

      {/* Top row - 3 cards, centered with spacers to match 5-card row width */}
      <div
        data-testid="saloon-row-top"
        onClick={rowClickable(board.top.length < 3) ? () => onRowClick!(Row.Top) : undefined}
        className={`${rowClass(rowClickable(board.top.length < 3))} mb-1`}
        style={{ gap }}
      >
        <div style={{ width: cardWidthPx }} />
        {topSlots.map((card, i) => renderSlot('top', Row.Top, board.top, card, i, `top-${i}`))}
        <div style={{ width: cardWidthPx }} />
        {topEval && <RowOverlay label={topEval.label} royalty={topEval.royalty} cardWidthPx={cardWidthPx} />}
      </div>

      {/* Middle row - 5 cards */}
      <div
        data-testid="saloon-row-middle"
        onClick={rowClickable(board.middle.length < 5) ? () => onRowClick!(Row.Middle) : undefined}
        className={`${rowClass(rowClickable(board.middle.length < 5))} mb-1`}
        style={{ gap }}
      >
        {middleSlots.map((card, i) => renderSlot('middle', Row.Middle, board.middle, card, i, `mid-${i}`))}
        {middleEval && <RowOverlay label={middleEval.label} royalty={middleEval.royalty} cardWidthPx={cardWidthPx} />}
      </div>

      {/* Bottom row - 5 cards */}
      <div
        data-testid="saloon-row-bottom"
        onClick={rowClickable(board.bottom.length < 5) ? () => onRowClick!(Row.Bottom) : undefined}
        className={rowClass(rowClickable(board.bottom.length < 5))}
        style={{ gap }}
      >
        {bottomSlots.map((card, i) => renderSlot('bottom', Row.Bottom, board.bottom, card, i, `bot-${i}`))}
        {bottomEval && <RowOverlay label={bottomEval.label} royalty={bottomEval.royalty} cardWidthPx={cardWidthPx} />}
      </div>
    </div>
  );
}
