import { useState, useCallback, useEffect, useMemo } from 'react';
import { httpsCallable } from 'firebase/functions';
import type { GameState, Card, Row, Board } from '@shared/core/types';
import { GamePhase } from '@shared/core/types';
import { functions } from '../firebase.ts';
import { PlayerGrid } from './PlayerGrid.tsx';
import { HandPanel } from './HandPanel.tsx';
import { RoundResults } from './RoundResults.tsx';
import { useCountdown } from '../hooks/useCountdown.ts';

const leaveGameFn = httpsCallable(functions, 'leaveGame');
const joinGameFn = httpsCallable(functions, 'joinGame');
const placeCardsFn = httpsCallable(functions, 'placeCards');

function cardKey(c: Card): string {
  return `${c.rank}-${c.suit}`;
}

export interface Placement {
  card: Card;
  row: Row;
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
  const [submitting, setSubmitting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [rejoining, setRejoining] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Auto-dismiss toast after 3 seconds
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const countdown = useCountdown(gameState.phaseDeadline);
  const showTimer = (
    gameState.phase === GamePhase.InitialDeal ||
    gameState.phase === GamePhase.Street2 ||
    gameState.phase === GamePhase.Street3 ||
    gameState.phase === GamePhase.Street4 ||
    gameState.phase === GamePhase.Street5
  );

  const isComplete = gameState.phase === GamePhase.Complete || gameState.phase === GamePhase.Scoring;

  const isInitialDeal = gameState.phase === GamePhase.InitialDeal;
  const isStreet = !isInitialDeal && gameState.phase !== GamePhase.Waiting &&
    gameState.phase !== GamePhase.Scoring && gameState.phase !== GamePhase.Complete;
  const requiredPlacements = isInitialDeal ? 5 : 2;

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
    setSubmitting(false);
  }, [hand.length, gameState.phase]);

  const placedCardKeys = new Set(placements.map((p) => cardKey(p.card)));
  const remainingHand = hand.filter((c) => !placedCardKeys.has(cardKey(c)));

  // Compute merged board: Firestore board + local placements
  const mergedBoard = useMemo((): Board => {
    const player = gameState.players[uid];
    if (!player) return { top: [], middle: [], bottom: [] };
    const board: Board = {
      top: [...player.board.top],
      middle: [...player.board.middle],
      bottom: [...player.board.bottom],
    };
    for (const p of placements) {
      board[p.row] = [...board[p.row], p.card];
    }
    return board;
  }, [gameState.players, uid, placements]);

  const handleRowClick = useCallback(async (row: Row) => {
    if (selectedIndex === null || submitting) return;
    const card = remainingHand[selectedIndex];
    if (!card) return;

    // Check row capacity
    const currentRowSize = mergedBoard[row].length;
    const maxSize = row === 'top' ? 3 : 5;
    if (currentRowSize >= maxSize) return;

    const newPlacements = [...placements, { card, row }];
    setPlacements(newPlacements);
    setSelectedIndex(null);

    // Auto-submit when all required placements are made
    if (newPlacements.length === requiredPlacements) {
      setSubmitting(true);
      try {
        const placementData = newPlacements.map((p) => ({
          card: p.card,
          row: p.row,
        }));

        // For streets 2-5, find the remaining card to discard
        const newPlacedKeys = new Set(newPlacements.map((p) => cardKey(p.card)));
        const discard = isStreet
          ? hand.find((c) => !newPlacedKeys.has(cardKey(c))) ?? null
          : null;

        await placeCardsFn({ placements: placementData, discard });
      } catch (err) {
        console.error('Failed to place cards:', err);
        setToast('Failed to place cards — try again');
        setPlacements([]);
        setSubmitting(false);
      }
    }
  }, [selectedIndex, remainingHand, mergedBoard, placements, submitting, requiredPlacements, isStreet, hand]);

  const handleCloseResults = useCallback(() => {
    setShowResults(false);
  }, []);

  const handleLeave = useCallback(async () => {
    setLeaving(true);
    try {
      await leaveGameFn();
    } catch (err) {
      console.error('Failed to leave:', err);
      setToast('Failed to leave game');
      setLeaving(false);
    }
  }, []);

  const handleRejoin = useCallback(async () => {
    setRejoining(true);
    try {
      await joinGameFn({ displayName: gameState.players[uid]?.displayName });
    } catch (err) {
      console.error('Failed to rejoin:', err);
      setToast('Failed to rejoin game');
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
          currentPlayerBoard={mergedBoard}
          onRowClick={selectedIndex !== null && !submitting ? handleRowClick : undefined}
          hasCardSelected={selectedIndex !== null && !submitting}
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
        submitting={submitting}
      />

      {/* Round results modal */}
      {showResults && isComplete && (
        <RoundResults
          gameState={gameState}
          currentUid={uid}
          onClose={handleCloseResults}
        />
      )}
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-red-900 border border-red-700 px-4 py-2 text-xs text-red-300 shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
