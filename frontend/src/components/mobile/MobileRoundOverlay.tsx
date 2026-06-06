import type { GameState } from '@shared/core/types';
import { compareRows } from '@shared/game-logic/hand-evaluation';
import { calculateRoyalties } from '@shared/game-logic/scoring';
import { formatScore } from '../../utils/scoring-display.ts';
import { useScoreCountUp } from '../../hooks/useScoreCountUp.ts';

interface MobileRoundOverlayProps {
  gameState: GameState;
  currentUid: string;
}

/** A win/lose/tie chip for one row in the per-opponent breakdown. */
function RowChip({ label, result }: { label: string; result: -1 | 0 | 1 }) {
  const cls =
    result > 0
      ? 'bg-green-900/60 text-green-300'
      : result < 0
        ? 'bg-red-900/60 text-red-300'
        : 'bg-gray-700/60 text-gray-400';
  const sym = result > 0 ? '▲' : result < 0 ? '▼' : '–';
  return <span className={`px-1 rounded ${cls}`}>{label}{sym}</span>;
}

export function MobileRoundOverlay({ gameState, currentUid }: MobileRoundOverlayProps) {
  const roundResults = gameState.roundResults ?? {};
  const myRoundScore = roundResults[currentUid]?.netScore ?? 0;
  const { displayValue, done } = useScoreCountUp(myRoundScore);

  // Everyone's results this round, ranked — the reveal should be shared, not solo.
  const ranked = gameState.playerOrder
    .map((uid) => ({ uid, p: gameState.players[uid], r: roundResults[uid] }))
    .filter((x) => x.p)
    .sort((a, b) => (b.r?.netScore ?? 0) - (a.r?.netScore ?? 0));

  const me = gameState.players[currentUid];
  const myFouled = roundResults[currentUid]?.fouled ?? false;
  const opponents = gameState.playerOrder.filter(
    (u) => u !== currentUid && gameState.players[u],
  );

  const boardComplete = (b: { top: unknown[]; middle: unknown[]; bottom: unknown[] }) =>
    b.top.length === 3 && b.middle.length === 5 && b.bottom.length === 5;

  return (
    <div
      data-testid="round-results"
      className="fixed inset-0 bg-gray-900 z-50 flex flex-col items-center px-4 pt-8 pb-6 font-mono overflow-y-auto"
    >
      <h2 className="text-lg font-bold text-white mb-4">
        Round {gameState.round} of {gameState.totalRounds} Complete
      </h2>

      {/* Hero: your round score, animated */}
      <div className="flex flex-col items-center mb-5">
        <span className="text-xs text-gray-500 mb-1">Your round score</span>
        <span
          className={`text-5xl font-black tabular-nums transition-colors duration-100 ${
            displayValue > 0 ? 'text-green-400' : displayValue < 0 ? 'text-red-400' : 'text-gray-300'
          }`}
        >
          {formatScore(displayValue)}
        </span>
      </div>

      {/* Everyone's results — shared reveal */}
      <div className="w-full max-w-[360px] space-y-1 mb-4">
        {ranked.map(({ uid, p, r }, i) => {
          const net = r?.netScore ?? 0;
          const isMe = uid === currentUid;
          return (
            <div
              key={uid}
              className={`flex items-center justify-between text-sm px-2 py-1 rounded ${
                isMe ? 'bg-green-900/30 border border-green-700' : 'bg-gray-800/50'
              }`}
            >
              <span className="flex items-center gap-1 truncate min-w-0">
                <span className="w-5 flex-shrink-0 text-yellow-400 text-center">
                  {i === 0 ? '\u{1F451}' : `#${i + 1}`}
                </span>
                <span className="truncate">{p.displayName}{isMe ? ' (You)' : ''}</span>
                {r?.fouled && <span className="text-red-400 text-[10px] flex-shrink-0">FOUL</span>}
              </span>
              <span className="flex items-center gap-2 flex-shrink-0">
                <span
                  className={`font-bold tabular-nums ${
                    net > 0 ? 'text-green-400' : net < 0 ? 'text-red-400' : 'text-gray-400'
                  }`}
                >
                  {formatScore(net)}
                </span>
                <span className="text-[10px] text-gray-500 tabular-nums">tot {formatScore(p.score)}</span>
              </span>
            </div>
          );
        })}
      </div>

      {/* Where your points came from — per-opponent row breakdown */}
      {opponents.length > 0 && me && (
        <div className="w-full max-w-[360px] text-[11px] space-y-1">
          <div className="text-gray-500 uppercase tracking-wider text-[10px] mb-1">
            Where it came from
          </div>
          {opponents.map((ouid) => {
            const opp = gameState.players[ouid];
            const oFouled = roundResults[ouid]?.fouled ?? false;
            const playable = !myFouled && !oFouled && boardComplete(me.board) && boardComplete(opp.board);
            return (
              <div key={ouid} className="flex items-center justify-between bg-gray-800/40 rounded px-2 py-1 gap-2">
                <span className="text-gray-400 truncate">vs {opp.displayName}</span>
                {playable ? (
                  <span className="flex items-center gap-1 flex-shrink-0">
                    <RowChip label="T" result={compareRows(me.board.top, opp.board.top, true)} />
                    <RowChip label="M" result={compareRows(me.board.middle, opp.board.middle, false)} />
                    <RowChip label="B" result={compareRows(me.board.bottom, opp.board.bottom, false)} />
                    {(() => {
                      const roy = calculateRoyalties(me.board).total - calculateRoyalties(opp.board).total;
                      return roy !== 0 ? (
                        <span className={roy > 0 ? 'text-green-300' : 'text-red-300'}>roy {formatScore(roy)}</span>
                      ) : null;
                    })()}
                  </span>
                ) : (
                  <span className="text-gray-500 flex-shrink-0">
                    {myFouled ? 'you fouled' : oFouled ? `${opp.displayName} fouled` : '–'}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {done && <p className="mt-5 text-xs text-gray-500 animate-pulse">Next round starting...</p>}
    </div>
  );
}
