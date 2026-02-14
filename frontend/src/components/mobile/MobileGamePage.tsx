import { useState, useCallback, useEffect, useMemo } from 'react';
import { httpsCallable } from 'firebase/functions';
import type { GameState, Card, Row, Board } from '@shared/core/types';
import { GamePhase } from '@shared/core/types';
import { functions } from '../../firebase.ts';
import { PlayerBoard } from '../PlayerBoard.tsx';
import { useCountdown } from '../../hooks/useCountdown.ts';
import { MobileOpponentGrid } from './MobileOpponentGrid.tsx';
import { MobileHandArea } from './MobileHandArea.tsx';
import { MobileRoundOverlay } from './MobileRoundOverlay.tsx';
import { MobileMatchOverlay } from './MobileMatchOverlay.tsx';

function cardKey(c: Card): string {
  return `${c.rank}-${c.suit}`;
}

interface Placement {
  card: Card;
  row: Row;
}

interface MobileGamePageProps {
  gameState: GameState;
  hand: Card[];
  uid: string;
  roomId: string;
  onLeaveRoom: () => void;
}

export function MobileGamePage({ gameState, hand, uid, roomId, onLeaveRoom }: MobileGamePageProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Auto-dismiss toast
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

  const isRoundComplete = gameState.phase === GamePhase.Complete;
  const isMatchComplete = gameState.phase === GamePhase.MatchComplete;

  const isInitialDeal = gameState.phase === GamePhase.InitialDeal;
  const isStreet = !isInitialDeal && gameState.phase !== GamePhase.Lobby &&
    gameState.phase !== GamePhase.Scoring && gameState.phase !== GamePhase.Complete &&
    gameState.phase !== GamePhase.MatchComplete;
  const requiredPlacements = isInitialDeal ? 5 : 2;

  // Show round results as full-screen takeover — auto-shows when round completes,
  // auto-hides when phase changes away from Complete (no dismiss button)
  const showRoundOverlay = isRoundComplete && !isMatchComplete;

  // Reset placement state when phase changes
  const [prevPhase, setPrevPhase] = useState(gameState.phase);
  if (prevPhase !== gameState.phase) {
    setPrevPhase(gameState.phase);
    setPlacements([]);
    setSelectedIndex(null);
    setSubmitting(false);
  }

  const placedCardKeys = new Set(placements.map((p) => cardKey(p.card)));
  const remainingHand = hand.filter((c) => !placedCardKeys.has(cardKey(c)));

  const mergedBoard = useMemo((): Board => {
    const player = gameState.players[uid];
    if (!player) return { top: [], middle: [], bottom: [] };
    const board: Board = {
      top: [...player.board.top],
      middle: [...player.board.middle],
      bottom: [...player.board.bottom],
    };
    for (const p of placements) {
      const alreadyOnBoard = board[p.row].some(
        (c) => c.rank === p.card.rank && c.suit === p.card.suit
      );
      if (!alreadyOnBoard) {
        board[p.row] = [...board[p.row], p.card];
      }
    }
    return board;
  }, [gameState.players, uid, placements]);

  const handleRowClick = useCallback(async (row: Row) => {
    if (selectedIndex === null || submitting) return;
    const card = remainingHand[selectedIndex];
    if (!card) return;

    const currentRowSize = mergedBoard[row].length;
    const maxSize = row === 'top' ? 3 : 5;
    if (currentRowSize >= maxSize) return;

    const newPlacements = [...placements, { card, row }];
    setPlacements(newPlacements);
    setSelectedIndex(null);

    if (newPlacements.length === requiredPlacements) {
      setSubmitting(true);
      try {
        const placementData = newPlacements.map((p) => ({
          card: p.card,
          row: p.row,
        }));

        const newPlacedKeys = new Set(newPlacements.map((p) => cardKey(p.card)));
        const discard = isStreet
          ? hand.find((c) => !newPlacedKeys.has(cardKey(c))) ?? null
          : null;

        const placeCardsFn = httpsCallable(functions, 'placeCards');
        await placeCardsFn({ roomId, placements: placementData, discard });
      } catch (err) {
        console.error('Failed to place cards:', err);
        setToast('Failed to place cards');
        setPlacements([]);
        setSubmitting(false);
      }
    }
  }, [selectedIndex, remainingHand, mergedBoard, placements, submitting, requiredPlacements, isStreet, hand, roomId]);

  const handleLeave = useCallback(async () => {
    setLeaving(true);
    try {
      const leaveGameFn = httpsCallable(functions, 'leaveGame');
      await leaveGameFn({ roomId });
      onLeaveRoom();
    } catch (err) {
      console.error('Failed to leave:', err);
      setToast('Failed to leave game');
      setLeaving(false);
    }
  }, [roomId, onLeaveRoom]);

  const isObserver = !gameState.playerOrder.includes(uid);
  const currentPlayer = gameState.players[uid];

  return (
    <div className="h-[100dvh] bg-gray-900 text-white font-mono flex flex-col overflow-hidden">
      {/* Compact mobile header */}
      <div className="border-b border-gray-700 px-2 py-1.5 flex items-center justify-between text-[10px] flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-green-400 font-bold tracking-wider">{roomId}</span>
          {showTimer && (
            <span className={`font-bold ${countdown < 10 ? 'text-red-400' : 'text-yellow-400'}`}>
              {countdown}s
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-500">
            R{gameState.round}/{gameState.totalRounds} S{gameState.street}
          </span>
          <button
            onClick={handleLeave}
            disabled={leaving}
            className="px-2 py-1 bg-red-800 active:bg-red-700 disabled:bg-gray-700 text-white text-[10px] rounded"
          >
            {leaving ? '...' : 'Leave'}
          </button>
        </div>
      </div>

      {/* Observer banner */}
      {isObserver && (
        <div className="bg-blue-900/80 border-b border-blue-700 px-2 py-0.5 text-center text-[10px] text-blue-300 flex-shrink-0">
          Observing — join next match
        </div>
      )}

      {/* Main content: opponents top, player board middle, hand bottom */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Top section: opponent grid */}
        <div className="flex-shrink-0 border-b border-gray-800" style={{ maxHeight: '35%' }}>
          <MobileOpponentGrid gameState={gameState} currentUid={uid} />
        </div>

        {/* Middle section: player's board */}
        <div className="flex-1 min-h-0 overflow-auto flex items-center justify-center p-2">
          {currentPlayer && (
            <PlayerBoard
              board={mergedBoard}
              playerName={`${currentPlayer.displayName} (You)`}
              fouled={currentPlayer.fouled}
              isCurrentPlayer
              onRowClick={selectedIndex !== null && !submitting ? handleRowClick : undefined}
              hasCardSelected={selectedIndex !== null && !submitting}
              cardSize="sm"
              score={currentPlayer.score}
              hasPlaced={currentPlayer.hasPlaced}
            />
          )}
        </div>

        {/* Bottom section: hand area */}
        <MobileHandArea
          hand={hand}
          gameState={gameState}
          uid={uid}
          selectedIndex={selectedIndex}
          onSelectCard={setSelectedIndex}
          placements={placements}
          submitting={submitting}
        />
      </div>

      {/* Full-screen round results overlay (auto-dismiss, no close button) */}
      {showRoundOverlay && (
        <MobileRoundOverlay
          gameState={gameState}
          currentUid={uid}
        />
      )}

      {/* Full-screen match results overlay */}
      {isMatchComplete && (
        <MobileMatchOverlay
          gameState={gameState}
          currentUid={uid}
          roomId={roomId}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 bg-red-900 border border-red-700 px-3 py-1.5 text-[10px] text-red-300 shadow-lg z-50 rounded">
          {toast}
        </div>
      )}
    </div>
  );
}
