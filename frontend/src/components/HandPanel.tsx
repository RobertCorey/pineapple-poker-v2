import type { Card, GameState } from '@shared/core/types';
import { GamePhase } from '@shared/core/types';
import { RANK_NAMES } from '@shared/core/constants';
import { CardComponent } from './CardComponent.tsx';
import type { Placement } from './GamePage.tsx';

const SUIT_SYMBOLS: Record<string, string> = { h: '\u2665', d: '\u2666', c: '\u2663', s: '\u2660' };

function cardKey(c: Card): string {
  return `${c.rank}-${c.suit}`;
}

function cardText(c: Card): string {
  return `${RANK_NAMES[c.rank]}${SUIT_SYMBOLS[c.suit]}`;
}

const ROW_SHORT: Record<string, string> = { top: 'top', middle: 'mid', bottom: 'bot' };

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

  const handleCardClick = (index: number) => {
    if (submitting) return;
    onSelectCard(selectedIndex === index ? null : index);
  };

  const allPlaced = placements.length >= requiredPlacements;

  // Determine what to show inside the fixed-height container
  let statusMessage: string | null = null;
  let showCards = false;

  if (gameState.phase === GamePhase.Lobby) {
    statusMessage = gameState.round === 0 ? 'Waiting for host to start match...' : 'Next round starting...';
  } else if (hand.length === 0 && !waitingForOthers) {
    statusMessage = null; // between phases — still reserve space
  } else if (waitingForOthers || submitting) {
    statusMessage = submitting ? 'Submitting...' : 'Waiting for other players...';
  } else {
    showCards = true;
  }

  return (
    <div className="bg-gray-900/80 border-t border-gray-700 px-4 py-2 flex-shrink-0">
      {/* Fixed-height card area — always reserves space for a row of md cards (h-14 = 56px + selection lift) */}
      <div className="h-[4.5rem] flex items-center justify-center">
        {showCards && !allPlaced ? (
          <div className="flex justify-center gap-2">
            {remainingHand.map((card, i) => (
              <div key={cardKey(card)} className="relative" data-testid={`hand-card-${i}`}>
                <CardComponent
                  card={card}
                  size="md"
                  selected={selectedIndex === i}
                  onClick={() => handleCardClick(i)}
                />
              </div>
            ))}
          </div>
        ) : (
          <span className="text-gray-400 text-sm">
            {statusMessage ?? '\u00a0'}
          </span>
        )}
      </div>

      {/* Instruction / summary line */}
      <div className="text-[10px] text-gray-500 text-center mt-1 h-4">
        {showCards && !allPlaced && (
          <>
            {isInitialDeal
              ? 'Select a card, then click a row'
              : `Select a card, then click a row (Street ${gameState.street})`}
            {placements.length > 0 && (
              <span className="ml-2 text-gray-600">
                ({placements.length}/{requiredPlacements} placed)
              </span>
            )}
          </>
        )}
        {hand.length > 0 && (
          <span className="text-gray-600">
            {showCards ? ' \u2022 ' : ''}
            {hand.map(cardText).join(' ')}
            {placements.length > 0 && (
              <> | {placements.map((p) => `${cardText(p.card)}\u2192${ROW_SHORT[p.row]}`).join(' ')}</>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
