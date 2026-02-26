import { useState, useEffect, useRef } from 'react';
import type { GameState } from '@shared/core/types';
import { playAgain } from '../../api.ts';
import { trackEvent } from '../../firebase.ts';
import { formatScore } from '../../utils/scoring-display.ts';
import { SoundEngine } from '../../audio/SoundEngine.ts';
import { useMatchCompleteAmbience } from '../../audio/useMatchCompleteAmbience.ts';

interface MobileMatchOverlayProps {
  gameState: GameState;
  currentUid: string;
  roomId: string;
}

/** Stagger delay before each rank row appears */
const RANK_STAGGER_MS = 600;
/** Extra delay before the winner row appears (dramatic pause) */
const WINNER_EXTRA_DELAY_MS = 800;

export function MobileMatchOverlay({ gameState, currentUid, roomId }: MobileMatchOverlayProps) {
  const [restarting, setRestarting] = useState(false);
  const [revealedCount, setRevealedCount] = useState(0);
  const isHost = gameState.hostUid === currentUid;
  const soundPlayedRef = useRef(new Set<number>());

  const standings = gameState.playerOrder
    .map((uid) => gameState.players[uid])
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  // Reveal rankings one at a time, bottom rank first
  useEffect(() => {
    if (standings.length === 0) return;

    const timers: ReturnType<typeof setTimeout>[] = [];
    // Reveal from last place to first
    for (let i = 0; i < standings.length; i++) {
      const isWinner = i === standings.length - 1;
      const baseDelay = (i + 1) * RANK_STAGGER_MS;
      const delay = isWinner ? baseDelay + WINNER_EXTRA_DELAY_MS : baseDelay;
      timers.push(
        setTimeout(() => setRevealedCount(i + 1), delay),
      );
    }

    return () => timers.forEach(clearTimeout);
  }, [standings.length]);

  // Play sounds as each rank is revealed
  useEffect(() => {
    if (revealedCount === 0) return;
    if (soundPlayedRef.current.has(revealedCount)) return;
    soundPlayedRef.current.add(revealedCount);

    const isWinnerReveal = revealedCount === standings.length;
    if (isWinnerReveal) {
      SoundEngine.get().playMatchWinnerFanfare();
    } else {
      SoundEngine.get().playMatchLoserReveal();
    }
  }, [revealedCount, standings.length]);

  const allRevealed = revealedCount >= standings.length;
  useMatchCompleteAmbience(allRevealed);

  // Build the display list: reversed standings (last place first in reveal order)
  const displayOrder = [...standings].reverse();

  const handlePlayAgain = async () => {
    setRestarting(true);
    try {
      await playAgain({ roomId });
      trackEvent('play_again', { roomId });
    } catch (err) {
      console.error('Failed to restart:', err);
      setRestarting(false);
    }
  };

  return (
    <div data-testid="match-results" className="fixed inset-0 bg-gray-900 z-50 flex flex-col items-center justify-center px-6 font-mono overflow-y-auto">
      <div className="py-8 w-full max-w-sm">
        <h2 className="text-xl font-bold text-white mb-8 text-center">Match Complete</h2>

        {/* Rankings — revealed bottom-up */}
        <div className="flex flex-col-reverse gap-2 mb-8">
          {displayOrder.map((player, displayIdx) => {
            // displayIdx 0 = last place, displayIdx N-1 = 1st place
            const rank = standings.length - displayIdx;
            const isWinner = rank === 1;
            const isRevealed = displayIdx < revealedCount;
            const isYou = player.uid === currentUid;

            return (
              <div
                key={player.uid}
                className={`
                  transition-all duration-500 ease-out
                  ${isRevealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
                  ${isWinner && isRevealed ? 'scale-105' : ''}
                `}
              >
                  {/* Winner celebration */}
                {isWinner && isRevealed && (
                  <div className="text-center mb-1 animate-bounce">
                    <span className="text-xs text-yellow-400/80 font-bold tracking-wider uppercase">
                      Champion
                    </span>
                  </div>
                )}

              <div
                  className={`
                    flex items-center gap-3 px-4 py-3 rounded-lg border
                    ${isWinner
                      ? 'bg-yellow-900/30 border-yellow-500/60 shadow-lg shadow-yellow-500/20'
                      : rank === standings.length
                        ? 'bg-red-900/20 border-red-800/40'
                        : 'bg-gray-800/50 border-gray-700/50'
                    }
                    ${isYou ? 'ring-2 ring-blue-400/50' : ''}
                  `}
                >
                  {/* Rank badge */}
                  <div className={`
                    flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm
                    ${isWinner
                      ? 'bg-yellow-500 text-black'
                      : rank === 2
                        ? 'bg-gray-400 text-black'
                        : rank === 3
                          ? 'bg-amber-700 text-white'
                          : 'bg-gray-700 text-gray-400'
                    }
                  `}>
                    {isWinner ? '\u{1F451}' : `#${rank}`}
                  </div>

                  {/* Name */}
                  <div className="flex-1 min-w-0">
                    <div className={`truncate font-bold ${isWinner ? 'text-yellow-300' : 'text-gray-200'}`}>
                      {player.displayName}
                      {isYou && <span className="text-blue-400 text-xs ml-1">(you)</span>}
                    </div>
                  </div>

                  {/* Score */}
                  <div className={`
                    flex-shrink-0 font-black text-lg tabular-nums
                    ${player.score > 0
                      ? 'text-green-400'
                      : player.score < 0
                        ? 'text-red-400'
                        : 'text-gray-400'
                    }
                  `}>
                    {formatScore(player.score)}
                  </div>
                </div>

                {/* Last place commiseration */}
                {rank === standings.length && standings.length > 1 && isRevealed && (
                  <div className="text-center mt-0.5">
                    <span className="text-[10px] text-gray-600 italic">
                      better luck next time
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Play Again (only after all revealed) */}
        {allRevealed && (
          <div className="flex justify-center animate-fade-in">
            {isHost ? (
              <button
                data-testid="play-again-button"
                onClick={handlePlayAgain}
                disabled={restarting}
                className="px-8 py-3 bg-green-700 hover:bg-green-600 active:bg-green-800 disabled:bg-gray-700 text-white text-sm font-bold rounded-lg transition-colors"
              >
                {restarting ? '...' : 'Play Again'}
              </button>
            ) : (
              <span className="text-sm text-gray-500">Waiting for host...</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
