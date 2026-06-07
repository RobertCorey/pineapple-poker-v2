import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { SoundEngine } from '../../audio/SoundEngine.ts';
import { useSoundEffects } from '../../audio/useSoundEffects.ts';
import { useTickSound } from '../../audio/useTickSound.ts';
import type { Card, Row, Board } from '@shared/core/types';
import { GamePhase } from '@shared/core/types';
import { INITIAL_DEAL_COUNT, STREET_PLACE_COUNT } from '@shared/core/constants';
import { isFoul } from '@shared/game-logic/scoring';
import { CHARMS } from '@shared/game-logic/charms';
import { MUTATIONS } from '@shared/game-logic/mutations';
import { placeCards, leaveGame } from '../../api.ts';
import { trackEvent } from '../../firebase.ts';
import { useCountdown } from '../../hooks/useCountdown.ts';
import { useToast } from '../../hooks/useToast.ts';
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

  // Reset placement state when phase changes
  const [prevPhase, setPrevPhase] = useState(gameState.phase);
  if (prevPhase !== gameState.phase) {
    setPrevPhase(gameState.phase);
    setPlacements([]);
    setSelectedIndex(null);
    setSubmitting(false);
  }

  // Track placements by their stable hand index, NOT by card identity. Run-mode
  // mutations (Pair Party, Mono Suit, Spike, Royal Inflation, Ace Rush) can
  // produce hands with duplicate (rank, suit) cards — a plain rank+suit key
  // collides duplicates and breaks React keys + state.
  const placedHandIndices = new Set(placements.map((p) => p.handIndex));
  const availableHand = hand
    .map((card, handIndex) => ({ card, handIndex }))
    .filter(({ handIndex }) => !placedHandIndices.has(handIndex));

  const player = gameState.players[uid];
  // Only merge optimistic placements onto the board while the server still
  // shows cards in our hand. Once the server has accepted the placeCards call,
  // currentHand becomes empty and player.board contains the placements — at
  // that point merging would double-count duplicate cards.
  const showOptimisticPlacements = !!player && (player.currentHand?.length ?? 0) > 0;
  const mergedBoard = ((): Board => {
    if (!player) return { top: [], middle: [], bottom: [] };
    const board: Board = {
      top: [...player.board.top],
      middle: [...player.board.middle],
      bottom: [...player.board.bottom],
    };
    if (showOptimisticPlacements) {
      for (const p of placements) {
        board[p.row] = [...board[p.row], p.card];
      }
    }
    return board;
  })();

  // Cards placed this turn but not yet submitted are takeable-back. Expose the
  // count per row so PlayerBoard can mark them tap-to-undo.
  const canUndo = showOptimisticPlacements && !submitting;
  const pendingByRow = {
    top: canUndo ? placements.filter((p) => p.row === 'top').length : 0,
    middle: canUndo ? placements.filter((p) => p.row === 'middle').length : 0,
    bottom: canUndo ? placements.filter((p) => p.row === 'bottom').length : 0,
  };

  const handleRowClick = async (row: Row) => {
    if (selectedIndex === null || submitting) return;
    // selectedIndex is a position into `availableHand`
    const selected = availableHand[selectedIndex];
    if (!selected) return;

    const currentRowSize = mergedBoard[row].length;
    const maxSize = row === 'top' ? 3 : 5;
    if (currentRowSize >= maxSize) return;

    const newPlacements = [
      ...placements,
      { card: selected.card, row, handIndex: selected.handIndex },
    ];
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

        const placedIdxSet = new Set(newPlacements.map((p) => p.handIndex));
        // Discard = the one card we didn't place this street, identified by
        // its hand index so duplicates don't break the lookup.
        const discardEntry = isStreet
          ? hand
              .map((c, idx) => ({ card: c, idx }))
              .find(({ idx }) => !placedIdxSet.has(idx))
          : null;
        const discard = discardEntry?.card ?? null;

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

  // Take a just-placed (not-yet-submitted) card back to hand.
  const handleUndoCard = (row: Row, pendingIndex: number) => {
    if (submitting) return;
    const inRow = placements.filter((p) => p.row === row);
    const target = inRow[pendingIndex];
    if (!target) return;
    setPlacements(placements.filter((p) => p !== target));
    setSelectedIndex(null);
    SoundEngine.get().playCardPlace();
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
    <div className="w-full max-w-[430px] bg-gray-900 text-white font-mono flex flex-col overflow-hidden">
      {/* Compact mobile header */}
      <div className="border-b border-gray-700 px-2 py-1.5 flex items-center justify-between text-[10px] flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-green-400 font-bold tracking-wider">{roomId}</span>
          {showTimer && (
            <span className={`font-bold ${countdown <= 10 ? 'text-red-400 animate-pulse text-sm' : 'text-yellow-400'}`}>
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

      {/* Observer banner */}
      {isObserver && (
        <div className="bg-blue-900/80 border-b border-blue-700 px-2 py-0.5 text-center text-[10px] text-blue-300 flex-shrink-0">
          Observing — join next match
        </div>
      )}

      {/* Run mode: charm + mutation strip */}
      {gameState.runMode && (() => {
        const myCharms = gameState.charms?.[uid] ?? [];
        const myMutations = gameState.mutations?.[uid] ?? [];
        if (myCharms.length === 0 && myMutations.length === 0) return null;
        return (
          <div className="bg-purple-900/30 border-b border-purple-700 px-2 py-1 flex items-center gap-1 text-[10px] flex-shrink-0 overflow-x-auto">
            {myCharms.length > 0 && (
              <>
                <span className="text-purple-300 uppercase tracking-wider mr-1 flex-shrink-0">Charms:</span>
                {myCharms.map((cid, i) => {
                  const c = CHARMS[cid];
                  if (!c) return null;
                  return (
                    <span
                      key={`c${i}`}
                      title={`${c.name}: ${c.description}`}
                      className="flex-shrink-0"
                    >
                      {c.emoji}
                    </span>
                  );
                })}
              </>
            )}
            {myMutations.length > 0 && (
              <>
                <span className="text-amber-300 uppercase tracking-wider ml-2 mr-1 flex-shrink-0">Deck:</span>
                {myMutations.map((m, i) => {
                  const def = MUTATIONS[m.id];
                  if (!def) return null;
                  return (
                    <span
                      key={`m${i}`}
                      title={`${def.name}: ${def.description}${m.target ? ` (${m.target})` : ''}`}
                      className="flex-shrink-0"
                    >
                      {def.emoji}
                    </span>
                  );
                })}
              </>
            )}
          </div>
        );
      })()}

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
                pendingByRow={pendingByRow}
                onUndoCard={canUndo ? handleUndoCard : undefined}
                cardWidthPx={playerCardW}
                score={currentPlayer.score}
                rank={playerRank}
              />
            )}
          </div>

          {/* Low-time warning — placement is easy to lose track of; make the
              impending auto-place unmissable when the player still has cards. */}
          {showTimer && countdown > 0 && countdown <= 10 && !isObserver && hand.length > 0 && !submitting && (
            <div className="bg-red-700 text-white text-center text-xs font-bold py-1 animate-pulse flex-shrink-0">
              ⏰ {countdown}s left — place your cards!
            </div>
          )}

          {/* Hand area */}
          <MobileHandArea
            hand={hand}
            availableHand={availableHand}
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
          onLeaveRoom={onLeaveRoom}
        />
      )}

      <Toast message={toast} />
    </div>
    </div>
  );
}
