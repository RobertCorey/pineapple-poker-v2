import { useMemo } from 'react';
import type { GameState, PlayerState, PairwiseResult } from '@shared/core/types';
import { scorePairwise } from '@shared/game-logic/scoring';
import { compareRows } from '@shared/game-logic/hand-evaluation';
import { formatScore } from '../../utils/scoring-display.ts';
import { useScoreCountUp } from '../../hooks/useScoreCountUp.ts';
import { useScoringAnimation } from '../../hooks/useScoringAnimation.ts';
import { PlayerBoard } from '../PlayerBoard.tsx';

interface MobileRoundOverlayProps {
  gameState: GameState;
  currentUid: string;
}

interface PairDetail {
  playerA: PlayerState;
  playerB: PlayerState;
  result: PairwiseResult;
  rowResults: { top: -1 | 0 | 1; middle: -1 | 0 | 1; bottom: -1 | 0 | 1 };
}

function computePairDetails(
  playerOrder: string[],
  players: Record<string, PlayerState>,
  roundResults: Record<string, { netScore: number; fouled: boolean }>,
): PairDetail[] {
  const details: PairDetail[] = [];
  for (let i = 0; i < playerOrder.length; i++) {
    for (let j = i + 1; j < playerOrder.length; j++) {
      const pA = players[playerOrder[i]];
      const pB = players[playerOrder[j]];
      if (!pA || !pB) continue;
      const aFouled = roundResults[pA.uid]?.fouled ?? false;
      const bFouled = roundResults[pB.uid]?.fouled ?? false;
      const result = scorePairwise(pA.uid, aFouled, pA.board, pB.uid, bFouled, pB.board);

      let rowResults = { top: 0 as -1 | 0 | 1, middle: 0 as -1 | 0 | 1, bottom: 0 as -1 | 0 | 1 };
      if (!aFouled && !bFouled) {
        rowResults = {
          top: compareRows(pA.board.top, pB.board.top, true),
          middle: compareRows(pA.board.middle, pB.board.middle, false),
          bottom: compareRows(pA.board.bottom, pB.board.bottom, false),
        };
      }

      details.push({ playerA: pA, playerB: pB, result, rowResults });
    }
  }
  return details;
}

function RowIndicator({ value }: { value: -1 | 0 | 1 }) {
  if (value === 1) return <span className="text-green-400 font-bold">W</span>;
  if (value === -1) return <span className="text-red-400 font-bold">L</span>;
  return <span className="text-gray-500 font-bold">-</span>;
}

/** Count-up display for a single player's score */
function PlayerScoreRow({ name, score, isCurrent }: { name: string; score: number; isCurrent: boolean }) {
  const { displayValue } = useScoreCountUp(score);
  const color = displayValue > 0 ? 'text-green-400' : displayValue < 0 ? 'text-red-400' : 'text-gray-300';
  return (
    <div className={`flex items-center justify-between gap-2 px-3 py-1 rounded ${isCurrent ? 'bg-green-900/30 ring-1 ring-green-600/50' : ''}`}>
      <span className="text-gray-300 text-sm truncate">{name}{isCurrent ? ' (You)' : ''}</span>
      <span className={`text-2xl font-black tabular-nums ${color}`}>{formatScore(displayValue)}</span>
    </div>
  );
}

export function MobileRoundOverlay({ gameState, currentUid }: MobileRoundOverlayProps) {
  const roundResults = gameState.roundResults ?? {};
  const activePlayers = gameState.playerOrder
    .map((uid) => gameState.players[uid])
    .filter(Boolean);

  const pairDetails = useMemo(
    () => computePairDetails(gameState.playerOrder, gameState.players, roundResults),
    [gameState.playerOrder, gameState.players, roundResults],
  );

  const { phase, pairIndex } = useScoringAnimation(pairDetails.length);

  // Sort players by round score for the scores phase
  const sortedPlayers = useMemo(
    () => [...activePlayers].sort((a, b) => (roundResults[b.uid]?.netScore ?? 0) - (roundResults[a.uid]?.netScore ?? 0)),
    [activePlayers, roundResults],
  );

  // Board card width: small to fit multiple boards on mobile
  const boardCardWidth = activePlayers.length <= 2 ? 38 : 32;

  return (
    <div data-testid="round-results" className="fixed inset-0 bg-gray-900 z-50 flex flex-col items-center px-3 py-4 font-mono overflow-y-auto">
      <h2 className="text-base font-bold text-white mb-3 flex-shrink-0">
        Round {gameState.round} of {gameState.totalRounds} Complete
      </h2>

      {/* Phase A: All player boards */}
      <div className="flex flex-wrap justify-center gap-2 mb-3 flex-shrink-0 animate-[fadeIn_0.4s_ease-out]">
        {activePlayers.map((player) => {
          const isCurrent = player.uid === currentUid;
          const isFouled = roundResults[player.uid]?.fouled ?? false;
          return (
            <div
              key={player.uid}
              className={`rounded transition-all duration-300 ${isCurrent ? 'ring-2 ring-green-500' : ''}`}
            >
              <PlayerBoard
                board={player.board}
                playerName={player.displayName}
                fouled={isFouled}
                isCurrentPlayer={isCurrent}
                cardWidthPx={boardCardWidth}
              />
            </div>
          );
        })}
      </div>

      {/* Phase B: Pairwise breakdown */}
      {(phase === 'pairwise' || phase === 'scores') && (
        <div className="w-full max-w-[400px] mb-3 flex-shrink-0">
          <div className="text-xs text-gray-400 font-bold mb-1.5 text-center uppercase tracking-wider">
            Pairwise Results
          </div>
          <div className="space-y-1.5">
            {pairDetails.map((pair, idx) => {
              const visible = idx <= pairIndex || phase === 'scores';
              if (!visible) return null;
              const aFouled = roundResults[pair.playerA.uid]?.fouled ?? false;
              const bFouled = roundResults[pair.playerB.uid]?.fouled ?? false;
              return (
                <div
                  key={`${pair.playerA.uid}-${pair.playerB.uid}`}
                  className="bg-gray-800/60 rounded px-3 py-1.5 animate-[fadeSlideIn_0.3s_ease-out]"
                >
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-gray-300 truncate">
                      {pair.playerA.displayName} vs {pair.playerB.displayName}
                    </span>
                    <span className={`font-bold tabular-nums ${pair.result.total > 0 ? 'text-green-400' : pair.result.total < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                      {formatScore(pair.result.total)}
                    </span>
                  </div>
                  {aFouled || bFouled ? (
                    <div className="text-[10px] text-red-400">
                      {aFouled && bFouled ? 'Both fouled' : `${aFouled ? pair.playerA.displayName : pair.playerB.displayName} fouled`}
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 text-[10px]">
                      <span className="text-gray-500">Top:</span>
                      <RowIndicator value={pair.rowResults.top} />
                      <span className="text-gray-500">Mid:</span>
                      <RowIndicator value={pair.rowResults.middle} />
                      <span className="text-gray-500">Bot:</span>
                      <RowIndicator value={pair.rowResults.bottom} />
                      {pair.result.scoopBonus !== 0 && (
                        <span className={`ml-auto font-bold ${pair.result.scoopBonus > 0 ? 'text-green-400' : 'text-red-400'}`}>
                          Scoop {formatScore(pair.result.scoopBonus)}
                        </span>
                      )}
                      {pair.result.royalties !== 0 && (
                        <span className={`font-bold ${pair.result.royalties > 0 ? 'text-green-400' : 'text-red-400'}`}>
                          Roy {formatScore(pair.result.royalties)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Phase C: Net scores for all players */}
      {phase === 'scores' && (
        <div className="w-full max-w-[400px] flex-shrink-0 animate-[fadeSlideIn_0.3s_ease-out]">
          <div className="text-xs text-gray-400 font-bold mb-1.5 text-center uppercase tracking-wider">
            Round Scores
          </div>
          <div className="space-y-1">
            {sortedPlayers.map((player) => (
              <PlayerScoreRow
                key={player.uid}
                name={player.displayName}
                score={roundResults[player.uid]?.netScore ?? 0}
                isCurrent={player.uid === currentUid}
              />
            ))}
          </div>

          {/* Cumulative match scores */}
          <div className="mt-3 pt-2 border-t border-gray-700">
            <div className="text-xs text-gray-400 font-bold mb-1 text-center uppercase tracking-wider">
              Match Total
            </div>
            <div className="space-y-0.5">
              {sortedPlayers.map((player) => {
                const cumulative = player.score;
                const color = cumulative > 0 ? 'text-green-400' : cumulative < 0 ? 'text-red-400' : 'text-gray-400';
                return (
                  <div key={player.uid} className="flex items-center justify-between px-3 text-xs">
                    <span className="text-gray-500 truncate">{player.displayName}</span>
                    <span className={`font-bold tabular-nums ${color}`}>{formatScore(cumulative)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <p className="mt-3 text-xs text-gray-500 animate-pulse text-center">Next round starting...</p>
        </div>
      )}
    </div>
  );
}
