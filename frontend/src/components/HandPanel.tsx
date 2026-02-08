import { useCallback } from 'react';
import type { Card, GameState } from '@shared/core/types';
import { GamePhase } from '@shared/core/types';
import { CardComponent } from './CardComponent.tsx';
import type { Placement } from './GamePage.tsx';

function cardKey(c: Card): string {
  return `${c.rank}-${c.suit}`;
}

interface HandPanelProps {
  hand: Card[];
  gameState: GameState;
  uid: string;
  selectedIndex: number | null;
  onSelectCard: (index: number | null) => void;
  placements: Placement[];
  submitting: boolean;
}

export function HandPanel({
  hand, gameState, uid, selectedIndex, onSelectCard,
  placements, submitting,
}: HandPanelProps) {
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

  const handleCardClick = useCallback((index: number) => {
    if (submitting) return;
    onSelectCard(selectedIndex === index ? null : index);
  }, [selectedIndex, submitting, onSelectCard]);

  if (gameState.phase === GamePhase.Waiting) {
    return (
      <div className="bg-gray-900/80 border-t border-gray-700 p-4 text-center">
        <span className="text-gray-400">Round starting soon...</span>
      </div>
    );
  }

  if (hand.length === 0 && !waitingForOthers) return null;

  if (waitingForOthers || submitting) {
    return (
      <div className="bg-gray-900/80 border-t border-gray-700 p-4 text-center">
        <span className="text-gray-400">
          {submitting ? 'Submitting...' : 'Waiting for other players...'}
        </span>
      </div>
    );
  }

  // Don't show cards that will be auto-discarded (only 1 remaining after all placements)
  const allPlaced = placements.length >= requiredPlacements;

  return (
    <div className="bg-gray-900/80 border-t border-gray-700 p-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-sm text-gray-400 mb-2 text-center">
          {isInitialDeal
            ? 'Select a card, then click a row to place it'
            : `Select a card, then click a row (Street ${gameState.street})`}
          {placements.length > 0 && !allPlaced && (
            <span className="ml-2 text-gray-500">
              ({placements.length}/{requiredPlacements} placed)
            </span>
          )}
        </div>

        {!allPlaced && (
          <div className="flex justify-center gap-2 mb-3">
            {remainingHand.map((card, i) => (
              <div key={cardKey(card)} className="relative" data-testid={`hand-card-${i}`}>
                <CardComponent
                  card={card}
                  selected={selectedIndex === i}
                  onClick={() => handleCardClick(i)}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
