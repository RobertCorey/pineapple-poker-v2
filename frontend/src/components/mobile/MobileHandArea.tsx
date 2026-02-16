import type { Card, Row, GameState } from '@shared/core/types';
import { GamePhase } from '@shared/core/types';
import { CardComponent, CARD_ASPECT } from '../CardComponent.tsx';

interface Placement {
  card: Card;
  row: Row;
}

function cardKey(c: Card): string {
  return `${c.rank}-${c.suit}`;
}

interface MobileHandAreaProps {
  hand: Card[];
  gameState: GameState;
  uid: string;
  selectedIndex: number | null;
  onSelectCard: (index: number | null) => void;
  placements: Placement[];
  submitting: boolean;
  cardWidthPx: number;
}

export function MobileHandArea({
  hand, gameState, uid, selectedIndex, onSelectCard,
  placements, submitting, cardWidthPx,
}: MobileHandAreaProps) {
  const isInitialDeal = gameState.phase === GamePhase.InitialDeal;
  const requiredPlacements = isInitialDeal ? 5 : 2;
  const placedCardKeys = new Set(placements.map((p) => cardKey(p.card)));
  const remainingHand = hand.filter((c) => !placedCardKeys.has(cardKey(c)));

  const player = gameState.players[uid];
  const alreadyPlaced = player
    ? player.board.top.length + player.board.middle.length + player.board.bottom.length
    : 0;
  const waitingForOthers = isInitialDeal
    ? alreadyPlaced >= 5 && hand.length === 0
    : alreadyPlaced > 0 && hand.length === 0;

  const handleCardClick = (index: number) => {
    if (submitting) return;
    onSelectCard(selectedIndex === index ? null : index);
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
            {remainingHand.map((card, i) => (
              <div key={cardKey(card)} data-testid={`mobile-hand-card-${i}`}>
                <CardComponent
                  card={card}
                  widthPx={cardWidthPx}
                  selected={selectedIndex === i}
                  onClick={() => handleCardClick(i)}
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

      {/* Instruction line */}
      {showCards && !allPlaced && (
        <div className="text-[10px] text-gray-500 text-center mt-1">
          {selectedIndex !== null
            ? 'Tap a row to place'
            : 'Tap a card to select'}
          {placements.length > 0 && (
            <span className="ml-1 text-gray-600">
              ({placements.length}/{requiredPlacements})
            </span>
          )}
        </div>
      )}
    </div>
  );
}
