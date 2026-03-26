import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { SoundEngine } from '../../audio/SoundEngine.ts';
import { useSoundEffects } from '../../audio/useSoundEffects.ts';
import { useTickSound } from '../../audio/useTickSound.ts';
import type { Card, Row, Board } from '@shared/core/types';
import { GamePhase } from '@shared/core/types';
import { INITIAL_DEAL_COUNT, STREET_PLACE_COUNT } from '@shared/core/constants';
import { isFoul } from '@shared/game-logic/scoring';
import { placeCards, leaveGame } from '../../api.ts';
import { trackEvent } from '../../firebase.ts';
import { useCountdown } from '../../hooks/useCountdown.ts';
import { useToast } from '../../hooks/useToast.ts';
import { cardKey } from '../../utils/card-utils.ts';
import type { Placement } from '../../utils/card-utils.ts';
import { PlayerBoard } from '../PlayerBoard.tsx';
import { Toast } from '../Toast.tsx';
import { MobileOpponentGrid } from './MobileOpponentGrid.tsx';
import { MobileHandArea } from './MobileHandArea.tsx';
import { MobileRoundOverlay } from './MobileRoundOverlay.tsx';
import { MobileMatchOverlay } from './MobileMatchOverlay.tsx';

const STREET_PHASES = new Set<string>([
  GamePhase.Street2,
  GamePhase.Street3,
  GamePhase.Street4,
  GamePhase.Street5,
]);

// --- Card size computation ---

function computePlayerCardWidth(w: number, h: number): number {
  if (w <= 0 || h <= 0) return 0;
  const fromWidth = (w - 10) / 5.48;
  const fromHeight = (h - 78) / 5.84;
  return Math.max(8, Math.floor(Math.min(fromWidth, fromHeight)));
}

/** Per-board width: 5 cards + 4 gaps(0.06*cw) + padding(0.24*cw) + row px-1(8) + border(4) + buffer */
const BOARD_W_COEFF = 5.48;
const BOARD_W_FIXED = 16;
/** Per-board height: 3 rows + header + padding + border + row margins */
const BOARD_H_COEFF = 4.44;
const BOARD_H_FIXED = 42;
/** Gap between boards as fraction of cw */
const BOARD_GAP_COEFF = 0.15;

interface OpponentGridLayout {
  cols: number;
  rows: number;
  cardWidth: number;
}

function computeOpponentGridLayout(w: number, h: number, n: number): OpponentGridLayout {
  if (w <= 0 || h <= 0 || n <= 0) return { cols: 1, rows: 1, cardWidth: 0 };

  let best: OpponentGridLayout = { cols: 1, rows: n, cardWidth: 0 };

  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const wCoeff = cols * BOARD_W_COEFF + (cols - 1) * BOARD_GAP_COEFF;
    const fromWidth = (w - cols * BOARD_W_FIXED) / wCoeff;
    const hCoeff = rows * BOARD_H_COEFF + (rows - 1) * BOARD_GAP_COEFF;
    const fromHeight = (h - rows * BOARD_H_FIXED) / hCoeff;
    const cw = Math.floor(Math.min(fromWidth, fromHeight));
    if (cw > best.cardWidth) {
      best = { cols, rows, cardWidth: cw };
    }
  }

  best.cardWidth = Math.max(4, best.cardWidth);
  return best;
}

function useContainerSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

// --- Component ---

interface MobileGamePageProps {
  gameState: import('@shared/core/types').GameState;
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
  const [muted, setMuted] = useState(() => SoundEngine.get().muted);
  const { message: toast, showToast } = useToast();
  useSoundEffects(gameState, uid);

  useEffect(() => {
    const handler = () => SoundEngine.get().init();
    document.addEventListener('touchstart', handler, { once: true });
    document.addEventListener('click', handler, { once: true });
    return () => {
      document.removeEventListener('touchstart', handler);
      document.removeEventListener('click', handler);
    };
  }, []);

  const opponentRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const opponentSize = useContainerSize(opponentRef);
  const playerSize = useContainerSize(playerRef);

  const countdown = useCountdown(gameState.phaseDeadline);
  const isPlacementPhase = gameState.phase === GamePhase.InitialDeal || STREET_PHASES.has(gameState.phase);
  useTickSound(countdown, isPlacementPhase && !submitting);
  const showTimer = (
    gameState.phase === GamePhase.InitialDeal || STREET_PHASES.has(gameState.phase)
  );

  const isRoundComplete = gameState.phase === GamePhase.Complete;
  const isMatchComplete = gameState.phase === GamePhase.MatchComplete;

  const isInitialDeal = gameState.phase === GamePhase.InitialDeal;
  const isStreet = STREET_PHASES.has(gameState.phase);
  const requiredPlacements = isInitialDeal ? INITIAL_DEAL_COUNT : STREET_PLACE_COUNT;

  const showRoundOverlay = isRoundComplete && !isMatchComplete;

  // Auto-place toast: detect when phase changes away from placement and player had unsubmitted cards
  const [prevPhase, setPrevPhase] = useState(gameState.phase);
  const [autoPlaceToast, setAutoPlaceToast] = useState<string | null>(null);
  const prevWasPlacement = prevPhase === GamePhase.InitialDeal || STREET_PHASES.has(prevPhase);
  if (prevPhase !== gameState.phase) {
    // Show toast if player had unsubmitted placements or unplaced hand cards during a placement phase
    if (prevWasPlacement && !submitting && hand.length > 0) {
      setAutoPlaceToast("Time's up! Cards placed automatically.");
    }
    setPrevPhase(gameState.phase);
    setPlacements([]);
    setSelectedIndex(null);
    setSubmitting(false);
  }

  // Auto-dismiss the auto-place toast after 4 seconds
  useEffect(() => {
    if (!autoPlaceToast) return;
    const t = setTimeout(() => setAutoPlaceToast(null), 4000);
    return () => clearTimeout(t);
  }, [autoPlaceToast]);

  // Countdown progress bar: store computed percentage in state, updated by interval
  const [progressPct, setProgressPct] = useState(1);
  useEffect(() => {
    if (!isPlacementPhase || !gameState.phaseDeadline || !gameState.settings?.turnTimeoutMs) {
      return;
    }
    const totalMs = gameState.settings.turnTimeoutMs;
    const deadline = gameState.phaseDeadline;
    const interval = setInterval(() => {
      const remainMs = Math.max(0, deadline - Date.now());
      setProgressPct(remainMs / totalMs);
    }, 100);
    return () => {
      clearInterval(interval);
      setProgressPct(1);
    };
  }, [isPlacementPhase, gameState.phaseDeadline, gameState.settings?.turnTimeoutMs]);

  const placedCardKeys = new Set(placements.map((p) => cardKey(p.card)));
  const remainingHand = hand.filter((c) => !placedCardKeys.has(cardKey(c)));

  const mergedBoard = ((): Board => {
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
  })();

  const handleRowClick = async (row: Row) => {
    if (selectedIndex === null || submitting) return;
    const card = remainingHand[selectedIndex];
    if (!card) return;

    const currentRowSize = mergedBoard[row].length;
    const maxSize = row === 'top' ? 3 : 5;
    if (currentRowSize >= maxSize) return;

    const newPlacements = [...placements, { card, row }];
    setPlacements(newPlacements);
    SoundEngine.get().playCardPlace();
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

        await placeCards({ roomId, placements: placementData, discard });
        trackEvent('place_cards', { roomId, street: gameState.street });
      } catch (err) {
        console.error('Failed to place cards:', err);
        showToast('Failed to place cards');
        setPlacements([]);
        setSubmitting(false);
      }
    }
  };

  const handleLeave = async () => {
    setLeaving(true);
    try {
      await leaveGame({ roomId });
      trackEvent('leave_game', { roomId });
      onLeaveRoom();
    } catch (err) {
      console.error('Failed to leave:', err);
      showToast('Failed to leave game');
      setLeaving(false);
    }
  };

  const isObserver = !gameState.playerOrder.includes(uid);
  const currentPlayer = gameState.players[uid];
  const numOpponents = gameState.playerOrder.filter((id) => id !== uid).length;

  // Compute current player's rank by score
  const playerRank = (() => {
    const sorted = gameState.playerOrder
      .map((id) => gameState.players[id])
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);
    return sorted.findIndex((p) => p.uid === uid) + 1;
  })();
  const opponentLayout = computeOpponentGridLayout(opponentSize.w, opponentSize.h, numOpponents);
  const playerCardW = computePlayerCardWidth(playerSize.w, playerSize.h);

  return (
    <div className="h-full bg-black flex justify-center">
    <div className={`w-full max-w-[430px] bg-gray-900 text-white font-mono flex flex-col overflow-hidden ${countdown <= 3 && countdown > 0 && isPlacementPhase ? 'ring-2 ring-red-500/60' : ''}`}>
      {/* Compact mobile header */}
      <div className="border-b border-gray-700 px-2 py-1.5 flex items-center justify-between text-[10px] flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-green-400 font-bold tracking-wider">{roomId}</span>
          {showTimer && (
            <span className={`font-bold ${countdown < 10 ? 'text-red-400' : 'text-yellow-400'} ${countdown <= 5 && countdown > 0 ? 'animate-pulse' : ''}`}>
              {countdown}s
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-500" data-testid="phase-label">
            R{gameState.round}/{gameState.totalRounds} S{gameState.street} {gameState.phase}
          </span>
          <button
            onClick={() => { const m = SoundEngine.get().toggleMute(); setMuted(m); }}
            className="text-gray-400 active:text-white"
            aria-label={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? '\u{1F507}' : '\u{1F50A}'}
          </button>
          <button
            onClick={handleLeave}
            disabled={leaving}
            className="px-2 py-1 bg-red-800 active:bg-red-700 disabled:bg-gray-700 text-white text-[10px] rounded"
          >
            {leaving ? '...' : 'Leave'}
          </button>
        </div>
      </div>

      {/* Countdown progress bar */}
      {isPlacementPhase && (
        <div className="w-full h-1.5 bg-gray-800 flex-shrink-0">
          <div
            className={`h-full transition-all duration-100 ease-linear ${
              progressPct > 0.5 ? 'bg-green-500' : progressPct > 0.25 ? 'bg-yellow-500' : 'bg-red-500'
            }`}
            style={{ width: `${(progressPct * 100).toFixed(1)}%` }}
          />
        </div>
      )}

      {/* Observer banner */}
      {isObserver && (
        <div className="bg-blue-900/80 border-b border-blue-700 px-2 py-0.5 text-center text-[10px] text-blue-300 flex-shrink-0">
          Observing — join next match
        </div>
      )}

      {/* Main content: 50/50 split */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Top half: opponents */}
        <div ref={opponentRef} className="h-1/2 border-b border-gray-800">
          <MobileOpponentGrid gameState={gameState} currentUid={uid} cardWidthPx={opponentLayout.cardWidth} cols={opponentLayout.cols} />
        </div>

        {/* Bottom half: player board + hand */}
        <div ref={playerRef} className="h-1/2 flex flex-col">
          <div className="flex-1 min-h-0 flex items-center justify-center" data-testid="my-board">
            {currentPlayer && playerCardW > 0 && (
              <PlayerBoard
                board={mergedBoard}
                playerName={`${currentPlayer.displayName} (You)`}
                fouled={currentPlayer.fouled || isFoul(mergedBoard)}
                isCurrentPlayer
                onRowClick={selectedIndex !== null && !submitting ? handleRowClick : undefined}
                hasCardSelected={selectedIndex !== null && !submitting}
                cardWidthPx={playerCardW}
                score={currentPlayer.score}
                rank={playerRank}
              />
            )}
          </div>

          {/* Hand area */}
          <MobileHandArea
            hand={hand}
            gameState={gameState}
            uid={uid}
            selectedIndex={selectedIndex}
            onSelectCard={setSelectedIndex}
            placements={placements}
            submitting={submitting}
            cardWidthPx={playerCardW}
          />
        </div>
      </div>

      {/* Full-screen round results overlay */}
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

      <Toast message={toast} />

      {/* Auto-place toast */}
      {autoPlaceToast && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 bg-black/80 border border-yellow-600 px-4 py-2 text-xs text-white shadow-lg z-50 rounded animate-fade-in">
          {autoPlaceToast}
        </div>
      )}
    </div>
    </div>
  );
}
