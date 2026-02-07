import { useState, useCallback, useEffect } from 'react';
import type { GameState, Card, Row } from '../../shared/types.ts';
import { GamePhase } from '../../shared/types.ts';
import type { ScoreEntry } from '../hooks/useScoreboard.ts';
import { PlayerGrid } from './PlayerGrid.tsx';
import { HandPanel, type Placement } from './HandPanel.tsx';
import { Scoreboard } from './Scoreboard.tsx';
import { RoundResults } from './RoundResults.tsx';

function cardKey(c: Card): string {
  return `${c.rank}-${c.suit}`;
}

interface GamePageProps {
  gameState: GameState;
  hand: Card[];
  scores: ScoreEntry[];
  uid: string;
}

export function GamePage({ gameState, hand, scores, uid }: GamePageProps) {
  const [showResults, setShowResults] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [discardIndex, setDiscardIndex] = useState<number | null>(null);

  const isComplete = gameState.phase === GamePhase.Complete || gameState.phase === GamePhase.Scoring;

  // Auto-show results when game completes
  useEffect(() => {
    if (isComplete) {
      setShowResults(true);
    }
  }, [isComplete]);

  // Reset placement state when hand changes (new street dealt)
  useEffect(() => {
    setPlacements([]);
    setSelectedIndex(null);
    setDiscardIndex(null);
  }, [hand.length, gameState.phase]);

  const placedCardKeys = new Set(placements.map((p) => cardKey(p.card)));
  const remainingHand = hand.filter((c) => !placedCardKeys.has(cardKey(c)));

  const handleSlotClick = useCallback((row: Row, index: number) => {
    if (selectedIndex === null) return;
    const card = remainingHand[selectedIndex];
    if (!card) return;

    setPlacements((prev) => [...prev, { card, row, index }]);
    setSelectedIndex(null);
  }, [selectedIndex, remainingHand]);

  const handleUndo = useCallback(() => {
    setDiscardIndex(null);
    setPlacements((prev) => prev.slice(0, -1));
    setSelectedIndex(null);
  }, []);

  const handleCloseResults = useCallback(() => {
    setShowResults(false);
  }, []);

  const phaseLabel: Record<string, string> = {
    [GamePhase.InitialDeal]: 'Initial Deal - Place 5 Cards',
    [GamePhase.Street2]: 'Street 2',
    [GamePhase.Street3]: 'Street 3',
    [GamePhase.Street4]: 'Street 4',
    [GamePhase.Street5]: 'Street 5',
    [GamePhase.Scoring]: 'Scoring...',
    [GamePhase.Complete]: 'Round Complete',
  };

  return (
    <div className="min-h-screen bg-green-900 flex flex-col">
      {/* Header */}
      <div className="bg-gray-900/60 border-b border-gray-700 px-4 py-2 flex items-center justify-between">
        <h1 className="text-lg font-bold text-white">Pineapple Poker</h1>
        <span className="text-sm text-green-400 font-medium">
          {phaseLabel[gameState.phase] ?? gameState.phase}
        </span>
      </div>

      {/* Main area */}
      <div className="flex-1 flex">
        <div className="flex-1 p-4 overflow-auto">
          <PlayerGrid
            gameState={gameState}
            currentUid={uid}
            onSlotClick={selectedIndex !== null ? handleSlotClick : undefined}
          />
        </div>

        <div className="w-56 p-3 border-l border-gray-700/50 hidden lg:block">
          <Scoreboard scores={scores} currentUid={uid} />
        </div>
      </div>

      {/* Hand panel */}
      <HandPanel
        hand={hand}
        gameState={gameState}
        uid={uid}
        selectedIndex={selectedIndex}
        onSelectCard={setSelectedIndex}
        placements={placements}
        onUndo={handleUndo}
        discardIndex={discardIndex}
        onDiscard={setDiscardIndex}
      />

      {/* Round results modal */}
      {showResults && isComplete && (
        <RoundResults
          gameState={gameState}
          currentUid={uid}
          scores={scores}
          onClose={handleCloseResults}
        />
      )}
    </div>
  );
}
