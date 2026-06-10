import { useRef, useState } from 'react';
import type { Card, GameState, Row } from '@shared/core/types';
import { GamePhase } from '@shared/core/types';
import { INITIAL_DEAL_COUNT, STREET_PLACE_COUNT } from '@shared/core/constants';
import { CardComponent, CARD_ASPECT } from '../CardComponent.tsx';
import { boardCardCount } from '../../utils/card-utils.ts';
import type { Placement } from '../../utils/card-utils.ts';

interface MobileHandAreaProps {
  hand: Card[];
  /** Cards still in hand, paired with their stable index in the original
   *  dealt hand. The handIndex is used as the React key. */
  availableHand: Array<{ card: Card; handIndex: number }>;
  gameState: GameState;
  uid: string;
  selectedIndex: number | null;
  onSelectCard: (index: number | null) => void;
  placements: Placement[];
  submitting: boolean;
  cardWidthPx: number;
  /** Drop a dragged card (by its position in availableHand) onto a row. */
  onDropCard: (availIndex: number, row: Row) => void;
}

/** Movement (px) before a touch press becomes a drag instead of a tap. */
const DRAG_THRESHOLD = 8;

/** Drag is touch-only: with a mouse/trackpad, click-click is faster and a
 *  wobbly click would otherwise become an accidental drag. The hint text
 *  follows the device's primary pointer. */
const COARSE_POINTER =
  typeof window !== 'undefined' && window.matchMedia('(any-pointer: coarse)').matches;

/** Map a drop point to a row on the player's own board, or null. Opponent
 *  boards render the same row testids, so require the my-board ancestor. */
function rowAtPoint(x: number, y: number): Row | null {
  const el = document.elementFromPoint(x, y);
  if (!el || !el.closest('[data-testid="my-board"]')) return null;
  const rowEl = el.closest('[data-testid^="row-"]');
  if (!rowEl) return null;
  const row = rowEl.getAttribute('data-testid')!.slice('row-'.length);
  return row === 'top' || row === 'middle' || row === 'bottom' ? (row as Row) : null;
}

export function MobileHandArea({
  hand, availableHand, gameState, uid, selectedIndex, onSelectCard,
  placements, submitting, cardWidthPx, onDropCard,
}: MobileHandAreaProps) {
  const isInitialDeal = gameState.phase === GamePhase.InitialDeal;
  const requiredPlacements = isInitialDeal ? INITIAL_DEAL_COUNT : STREET_PLACE_COUNT;

  const player = gameState.players[uid];
  const alreadyPlaced = player ? boardCardCount(player.board) : 0;
  const waitingForOthers = isInitialDeal
    ? alreadyPlaced >= INITIAL_DEAL_COUNT && hand.length === 0
    : alreadyPlaced > 0 && hand.length === 0;

  const handleCardClick = (index: number, e: React.MouseEvent) => {
    if (submitting) return;
    // Some browsers still fire a click on the source card right after a drag —
    // swallow it so a drop doesn't immediately re-select. Time-based (not a
    // sticky flag) because when the click targets the wrapper instead, a flag
    // would never clear and would eat the next genuine tap. Event timestamps
    // share a clock, so no impure Date.now() in render scope.
    if (e.timeStamp - dragEndAtRef.current < 300) return;
    onSelectCard(selectedIndex === index ? null : index);
  };

  // --- Drag state ---
  // pressRef tracks a press that may become a drag; drag is set once the
  // pointer moves past DRAG_THRESHOLD and drives the floating ghost card.
  const pressRef = useRef<{ index: number; x: number; y: number } | null>(null);
  const dragEndAtRef = useRef(0);
  const [drag, setDrag] = useState<{ index: number; x: number; y: number } | null>(null);

  const handlePointerDown = (index: number) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (submitting) return;
    if (e.pointerType !== 'touch') return; // mouse/trackpad: click-click only
    pressRef.current = { index, x: e.clientX, y: e.clientY };
    // Deliberately NOT capturing the pointer here: capture retargets the
    // press's eventual click at this wrapper instead of the card, which
    // breaks tap-to-select. Capture starts only when a drag does (below).
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const press = pressRef.current;
    if (!press) return;
    if (e.buttons === 0) {
      // Press already ended (released outside before we captured) — a stale
      // pressRef would otherwise turn plain mouse hover into a drag.
      pressRef.current = null;
      return;
    }
    if (!drag) {
      const dist = Math.hypot(e.clientX - press.x, e.clientY - press.y);
      if (dist < DRAG_THRESHOLD) return;
      // Becoming a drag: capture so tracking continues outside the card, and
      // select it so the board rows light up as targets. Capture can throw on
      // synthetic pointer events (tests); tracking still works without it.
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic pointer — no capture */
      }
      onSelectCard(press.index);
    }
    setDrag({ index: press.index, x: e.clientX, y: e.clientY });
  };

  const handlePointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    const endedDrag = drag;
    pressRef.current = null;
    if (!endedDrag) return; // plain tap — the card's onClick handles selection
    dragEndAtRef.current = e.timeStamp;
    const row = e.type === 'pointerup' ? rowAtPoint(e.clientX, e.clientY) : null;
    setDrag(null);
    if (row) {
      onDropCard(endedDrag.index, row);
    } else {
      onSelectCard(null); // released off-board: cancel
    }
  };

  const allPlaced = placements.length >= requiredPlacements;

  let statusMessage: string | null = null;
  let showCards = false;

  if (gameState.phase === GamePhase.Lobby) {
    statusMessage = gameState.round === 0 ? 'Waiting for host...' : 'Next round starting...';
  } else if (hand.length === 0 && !waitingForOthers) {
    statusMessage = null;
  } else if (waitingForOthers || submitting) {
    statusMessage = submitting ? 'Submitting...' : 'Waiting for others...';
  } else {
    showCards = true;
  }

  const cardH = Math.round(cardWidthPx * CARD_ASPECT);
  const cardGap = Math.max(4, Math.round(cardWidthPx * 0.15));

  return (
    <div className="border-t border-gray-700 px-2 py-2 flex-shrink-0">
      <div
        className="flex items-center justify-center"
        style={{ minHeight: cardH + 8 }}
      >
        {showCards && !allPlaced ? (
          <div className="flex justify-center" style={{ gap: cardGap }}>
            {availableHand.map(({ card, handIndex }, i) => (
              <div
                key={handIndex}
                data-testid={`hand-card-${i}`}
                onPointerDown={handlePointerDown(i)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerEnd}
                onPointerCancel={handlePointerEnd}
                className={drag?.index === i ? 'opacity-30' : ''}
                style={{ touchAction: 'none' }}
              >
                <CardComponent
                  card={card}
                  widthPx={cardWidthPx}
                  selected={selectedIndex === i}
                  onClick={(e) => handleCardClick(i, e)}
                />
              </div>
            ))}
          </div>
        ) : (
          <span className="text-gray-400 text-xs">
            {statusMessage ?? '\u00a0'}
          </span>
        )}
      </div>

      {/* Floating ghost card that follows the pointer while dragging */}
      {drag && availableHand[drag.index] && (
        <div
          className="fixed z-[200] pointer-events-none opacity-90 drop-shadow-xl"
          style={{
            left: drag.x - cardWidthPx / 2,
            top: drag.y - cardH * 0.75,
          }}
        >
          <CardComponent card={availableHand[drag.index].card} widthPx={cardWidthPx} />
        </div>
      )}

      {/* Instruction line — always rendered to prevent layout shift */}
      <div className="text-[10px] text-gray-500 text-center mt-1">
        {showCards && !allPlaced ? (
          <>
            {selectedIndex !== null
              ? 'Tap a row to place'
              : COARSE_POINTER ? 'Tap or drag a card' : 'Tap a card to select'}
            {placements.length > 0 && (
              <span className="ml-1 text-gray-600">
                ({placements.length}/{requiredPlacements}) · tap a placed card to undo
              </span>
            )}
          </>
        ) : (
          '\u00a0'
        )}
      </div>
    </div>
  );
}
