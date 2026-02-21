import type { Card, GameState } from '@shared/core/types';
import { GamePhase } from '@shared/core/types';
import { INITIAL_DEAL_COUNT, STREET_PLACE_COUNT } from '@shared/core/constants';
import { CardComponent, CARD_ASPECT } from '../CardComponent.tsx';
import { cardKey, boardCardCount } from '../../utils/card-utils.ts';
import type { Placement } from '../../utils/card-utils.ts';

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
  const requiredPlacements = isInitialDeal ? INITIAL_DEAL_COUNT : STREET_PLACE_COUNT;
  const placedCardKeys = new Set(placements.map((p) => cardKey(p.card)));
  const remainingHand = hand.filter((c) => !placedCardKeys.has(cardKey(c)));

  const player = gameState.players[uid];
  const alreadyPlaced = player ? boardCardCount(player.board) : 0;
  const waitingForOthers = isInitialDeal
    ? alreadyPlaced >= INITIAL_DEAL_COUNT && hand.length === 0
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
              <div key={cardKey(card)} data-testid={`hand-card-${i}`}>
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

      {/* Instruction line — always rendered to prevent layout shift */}
      <div className="text-[10px] text-gray-500 text-center mt-1">
        {showCards && !allPlaced ? (
          <>
            {selectedIndex !== null ? 'Tap a row to place' : 'Tap a card to select'}
            {placements.length > 0 && (
              <span className="ml-1 text-gray-600">
                ({placements.length}/{requiredPlacements})
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
