import { useState, useCallback, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import type { GameState, Card, Row } from '../../shared/types.ts';
import { GamePhase } from '../../shared/types.ts';
import { functions } from '../firebase.ts';
import { PlayerGrid } from './PlayerGrid.tsx';
import { HandPanel, type Placement } from './HandPanel.tsx';
import { RoundResults } from './RoundResults.tsx';
import { useCountdown } from '../hooks/useCountdown.ts';

const leaveGameFn = httpsCallable(functions, 'leaveGame');
const joinGameFn = httpsCallable(functions, 'joinGame');

function cardKey(c: Card): string {
  return `${c.rank}-${c.suit}`;
}

interface GamePageProps {
  gameState: GameState;
  hand: Card[];
  uid: string;
}

export function GamePage({ gameState, hand, uid }: GamePageProps) {
  const [showResults, setShowResults] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [discardIndex, setDiscardIndex] = useState<number | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [rejoining, setRejoining] = useState(false);

  const countdown = useCountdown(gameState.phaseDeadline);
  const showTimer = (
    gameState.phase === GamePhase.InitialDeal ||
    gameState.phase === GamePhase.Street2 ||
    gameState.phase === GamePhase.Street3 ||
    gameState.phase === GamePhase.Street4 ||
    gameState.phase === GamePhase.Street5
  );

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

  const handleLeave = useCallback(async () => {
    setLeaving(true);
    try {
      await leaveGameFn();
    } catch (err) {
      console.error('Failed to leave:', err);
      setLeaving(false);
    }
  }, []);

  const handleRejoin = useCallback(async () => {
    setRejoining(true);
    try {
      await joinGameFn({ displayName: gameState.players[uid]?.displayName });
    } catch (err) {
      console.error('Failed to rejoin:', err);
      setRejoining(false);
    }
  }, [gameState.players, uid]);

  const isSittingOut = gameState.players[uid]?.sittingOut === true;
  const isObserver = !gameState.playerOrder.includes(uid);

  return (
    <div className="min-h-screen bg-gray-900 text-white font-mono flex flex-col">
      {/* Header bar */}
      <div className="border-b border-gray-700 px-3 py-2 flex items-center justify-between text-xs">
        <span className="font-bold">Pineapple Poker</span>
        <div className="flex items-center gap-3">
          {showTimer && (
            <span className={countdown < 10 ? 'text-red-400' : 'text-yellow-400'}>
              {countdown}s
            </span>
          )}
          <span data-testid="phase-label" className="text-green-400">
            {gameState.phase} | street {gameState.street}
          </span>
          <span className="text-gray-500">
            {gameState.playerOrder.length} playing, {Object.keys(gameState.players).length} total
          </span>
          <button
            onClick={handleLeave}
            disabled={leaving}
            className="px-2 py-1 bg-red-800 hover:bg-red-700 disabled:bg-gray-700 text-white text-xs"
          >
            {leaving ? '...' : 'Leave'}
          </button>
        </div>
      </div>

      {/* Sitting-out banner */}
      {isSittingOut && (
        <div className="bg-amber-900 border-b border-amber-700 px-3 py-2 text-center text-xs text-amber-300 flex items-center justify-center gap-3">
          <span>You timed out and are sitting out.</span>
          <button
            onClick={handleRejoin}
            disabled={rejoining}
            className="px-3 py-1 bg-amber-700 hover:bg-amber-600 disabled:bg-gray-700 text-white text-xs font-bold"
          >
            {rejoining ? '...' : 'Rejoin'}
          </button>
        </div>
      )}

      {/* Observer banner (not sitting out) */}
      {isObserver && !isSittingOut && (
        <div className="bg-blue-900 border-b border-blue-700 px-3 py-1 text-center text-xs text-blue-300">
          Observing — you'll join the next round
        </div>
      )}

      {/* Main area */}
      <div className="flex-1 p-3 overflow-auto">
        <PlayerGrid
          gameState={gameState}
          currentUid={uid}
          onSlotClick={selectedIndex !== null ? handleSlotClick : undefined}
        />
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
          onClose={handleCloseResults}
        />
      )}
    </div>
  );
}
