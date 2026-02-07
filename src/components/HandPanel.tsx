import { useCallback } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase.ts';
import type { Card, Row, GameState } from '../../shared/types.ts';
import { GamePhase } from '../../shared/types.ts';
import { CardComponent } from './CardComponent.tsx';

export interface Placement {
  card: Card;
  row: Row;
  index: number;
}

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
  onUndo: () => void;
  discardIndex: number | null;
  onDiscard: (index: number) => void;
}

export function HandPanel({
  hand, gameState, uid, selectedIndex, onSelectCard,
  placements, onUndo, discardIndex, onDiscard,
}: HandPanelProps) {
  const isInitialDeal = gameState.phase === GamePhase.InitialDeal;
  const isStreet = !isInitialDeal && gameState.phase !== GamePhase.Waiting &&
    gameState.phase !== GamePhase.Scoring && gameState.phase !== GamePhase.Complete;
  const needsDiscard = isStreet;

  const requiredPlacements = isInitialDeal ? 5 : 2;
  const placedCardKeys = new Set(placements.map((p) => cardKey(p.card)));
  const remainingHand = hand.filter((c) => !placedCardKeys.has(cardKey(c)));

  const canSubmit = placements.length === requiredPlacements &&
    (!needsDiscard || discardIndex !== null);

  const player = gameState.players[uid];
  const alreadyPlaced = player
    ? player.board.top.length + player.board.middle.length + player.board.bottom.length
    : 0;
  const waitingForOthers = isInitialDeal
    ? alreadyPlaced >= 5 && hand.length === 0
    : alreadyPlaced > 0 && hand.length === 0;

  const handleCardClick = useCallback((index: number) => {
    if (needsDiscard && placements.length === requiredPlacements) {
      onDiscard(index);
      return;
    }
    onSelectCard(selectedIndex === index ? null : index);
  }, [selectedIndex, needsDiscard, placements.length, requiredPlacements, onSelectCard, onDiscard]);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    try {
      const placeCards = httpsCallable(functions, 'placeCards');
      const placementData = placements.map((p) => ({
        card: p.card,
        row: p.row,
        index: p.index,
      }));
      const discard = needsDiscard && discardIndex !== null
        ? remainingHand[discardIndex]
        : null;

      await placeCards({
        placements: placementData,
        discard,
      });
    } catch (err) {
      console.error('Failed to place cards:', err);
    }
  }, [canSubmit, placements, needsDiscard, discardIndex, remainingHand]);

  if (hand.length === 0 && !waitingForOthers) return null;

  if (waitingForOthers) {
    return (
      <div className="bg-gray-900/80 border-t border-gray-700 p-4 text-center">
        <span className="text-gray-400">Waiting for other players...</span>
      </div>
    );
  }

  return (
    <div className="bg-gray-900/80 border-t border-gray-700 p-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-sm text-gray-400 mb-2 text-center">
          {isInitialDeal
            ? 'Place all 5 cards on your board'
            : `Place 2 cards, discard 1 (Street ${gameState.street})`}
          {placements.length > 0 && (
            <span className="ml-2 text-gray-500">
              ({placements.length}/{requiredPlacements} placed)
            </span>
          )}
        </div>

        <div className="flex justify-center gap-2 mb-3">
          {remainingHand.map((card, i) => {
            const isMarkedDiscard = discardIndex === i;
            return (
              <div key={cardKey(card)} className="relative">
                <CardComponent
                  card={card}
                  selected={selectedIndex === i}
                  onClick={() => handleCardClick(i)}
                />
                {isMarkedDiscard && (
                  <div className="absolute inset-0 bg-red-600/40 rounded-lg flex items-center justify-center">
                    <span className="text-xs font-bold text-white bg-red-600 px-1 rounded">
                      DISCARD
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex justify-center gap-3">
          {placements.length > 0 && (
            <button
              onClick={onUndo}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm transition-colors"
            >
              Undo
            </button>
          )}
          {canSubmit && (
            <button
              onClick={handleSubmit}
              className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-semibold transition-colors"
            >
              Confirm
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
