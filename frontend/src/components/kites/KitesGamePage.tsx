import { useEffect, useMemo, useState } from 'react';
import type { KitesCard, KitesColor, KitesGameState } from '@shared/kites/types';
import { KITES_TIMER_ORDER, kitesScoreLabel } from '@shared/kites/constants';
import { kitesLeaveGame, kitesPlayAgain, kitesPlayCard } from '../../api-kites.ts';
import { useToast } from '../../hooks/useToast.ts';
import { Toast } from '../Toast.tsx';
import { KitesSandTimer } from './KitesSandTimer.tsx';
import { KitesCardView } from './KitesCardView.tsx';

interface Props {
  gameState: KitesGameState;
  hand: KitesCard[];
  uid: string;
  roomId: string;
  onLeaveRoom: () => void;
}

export function KitesGamePage({ gameState, hand, uid, roomId, onLeaveRoom }: Props) {
  const [selectedCard, setSelectedCard] = useState<KitesCard | null>(null);
  const [pendingFlip, setPendingFlip] = useState<KitesColor[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const { message: toast, showToast } = useToast();

  // Reset selection when hand changes (eg. after submitting).
  useEffect(() => {
    setSelectedCard(null);
    setPendingFlip(null);
  }, [hand.length, gameState.totalPlayed]);

  const isHost = gameState.hostUid === uid;
  const isObserver = !gameState.players[uid];

  const onCardClick = (card: KitesCard) => {
    if (gameState.phase !== 'playing' || isObserver) return;
    if (selectedCard?.id === card.id) {
      setSelectedCard(null);
      setPendingFlip(null);
      return;
    }
    setSelectedCard(card);
    if (card.symbols.length === 2) {
      // No choice for 2-symbol cards — flip both.
      setPendingFlip([card.symbols[0], card.symbols[1]]);
    } else {
      setPendingFlip(null);
    }
  };

  const onTimerSelect = (color: KitesColor) => {
    if (!selectedCard || selectedCard.symbols.length !== 1) return;
    if (color !== selectedCard.symbols[0] && color !== 'white') return;
    setPendingFlip([color]);
  };

  const onConfirmPlay = async () => {
    if (!selectedCard || !pendingFlip) return;
    setSubmitting(true);
    try {
      await kitesPlayCard({
        roomId,
        card: selectedCard,
        flipColors: pendingFlip,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Play failed';
      showToast(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRestart = async () => {
    setRestarting(true);
    try {
      await kitesPlayAgain({ roomId });
    } catch (err) {
      console.error('Restart failed:', err);
      showToast('Restart failed');
    } finally {
      setRestarting(false);
    }
  };

  const handleLeave = async () => {
    try {
      await kitesLeaveGame({ roomId });
    } catch {
      // ignore
    }
    onLeaveRoom();
  };

  const timersByColor = useMemo(() => {
    const m = new Map<KitesColor, (typeof gameState.timers)[number]>();
    for (const t of gameState.timers) m.set(t.color as KitesColor, t);
    return m;
  }, [gameState]);

  const totalRemaining =
    gameState.drawPileSize +
    Object.values(gameState.players).reduce((acc, p) => acc + p.handSize, 0);

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-sky-800 via-sky-900 to-sky-950 text-white font-sans flex flex-col">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-sky-800/60 bg-sky-950/40">
        <div className="text-cyan-300 text-xs tracking-widest">Room {roomId}</div>
        <div className="text-xs text-sky-300">
          Cards left: <span className="font-bold text-sky-100">{totalRemaining}</span>
          <span className="text-sky-500 mx-1">·</span>
          Played: <span className="font-bold text-sky-100">{gameState.totalPlayed}</span>
        </div>
        <button onClick={handleLeave} className="text-xs text-sky-400 hover:text-sky-200">
          Leave
        </button>
      </div>

      {/* Timers strip */}
      <div className="px-2 py-3 border-b border-sky-800/60 bg-sky-900/30">
        <div className="flex justify-center gap-3 sm:gap-5">
          {KITES_TIMER_ORDER.map((color) => {
            const t = timersByColor.get(color);
            if (!t) return null;
            const selectable =
              !!selectedCard &&
              selectedCard.symbols.length === 1 &&
              (color === selectedCard.symbols[0] || color === 'white');
            const selected = pendingFlip?.includes(color) ?? false;
            return (
              <KitesSandTimer
                key={color}
                timer={t}
                selectable={selectable}
                selected={selected}
                onClick={() => onTimerSelect(color)}
              />
            );
          })}
        </div>
      </div>

      {/* Recent plays */}
      <div className="flex-1 px-3 py-3 overflow-y-auto">
        <div className="text-xs text-sky-400 mb-2">Recent plays</div>
        {gameState.recentPlays.length === 0 ? (
          <div className="text-xs text-sky-600 italic">No cards played yet</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {gameState.recentPlays.slice().reverse().map((play) => {
              const player = gameState.players[play.uid];
              return (
                <div key={play.id + play.seq} className="flex flex-col items-center gap-1">
                  <KitesCardView card={{ id: play.id, symbols: play.symbols }} size="sm" />
                  <span className="text-[10px] text-sky-400 max-w-12 truncate">
                    {player?.displayName ?? '?'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Status / End-of-game banner */}
      {gameState.phase === 'won' && (
        <EndBanner
          title="All kites soaring!"
          subtitle={`${kitesScoreLabel(gameState.finalScore ?? 0)}`}
          score={gameState.finalScore}
          isHost={isHost}
          onRestart={handleRestart}
          restarting={restarting}
          variant="win"
        />
      )}
      {gameState.phase === 'lost' && (
        <EndBanner
          title={`The ${gameState.expiredTimerColor ?? '?'} kite fell.`}
          subtitle={kitesScoreLabel(gameState.finalScore ?? 0)}
          score={gameState.finalScore}
          isHost={isHost}
          onRestart={handleRestart}
          restarting={restarting}
          variant="loss"
        />
      )}

      {/* Hand + action bar */}
      {gameState.phase === 'playing' && !isObserver && (
        <div className="border-t border-sky-800/60 bg-sky-950/70 backdrop-blur p-3">
          <div className="text-xs text-sky-400 mb-2">Your hand</div>
          {hand.length === 0 ? (
            <div className="text-sky-500 text-sm italic">Empty hand — others must keep flying.</div>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {hand.map((c) => (
                <KitesCardView
                  key={c.id}
                  card={c}
                  size="md"
                  selectable
                  selected={selectedCard?.id === c.id}
                  onClick={() => onCardClick(c)}
                />
              ))}
            </div>
          )}

          {selectedCard && (
            <div className="mt-3 flex items-center justify-between gap-2">
              <div className="text-xs text-sky-300">
                {selectedCard.symbols.length === 2
                  ? `Flip both ${selectedCard.symbols.join(' + ')} timers.`
                  : pendingFlip
                  ? `Will flip ${pendingFlip[0]} timer.`
                  : `Tap a timer above (${selectedCard.symbols[0]} or white).`}
              </div>
              <button
                onClick={onConfirmPlay}
                disabled={!pendingFlip || submitting}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 disabled:text-gray-500 rounded text-sm font-bold"
              >
                {submitting ? '...' : 'Play'}
              </button>
            </div>
          )}
        </div>
      )}

      {gameState.phase === 'playing' && isObserver && (
        <div className="border-t border-sky-800/60 bg-sky-950/70 p-3 text-center text-sm text-sky-400">
          You're watching — late joiners can't play this match.
        </div>
      )}

      <Toast message={toast} />
    </div>
  );
}

interface EndBannerProps {
  title: string;
  subtitle: string;
  score: number | null;
  isHost: boolean;
  onRestart: () => void;
  restarting: boolean;
  variant: 'win' | 'loss';
}

function EndBanner({ title, subtitle, score, isHost, onRestart, restarting, variant }: EndBannerProps) {
  const accent =
    variant === 'win'
      ? 'border-emerald-400 bg-emerald-900/40 text-emerald-100'
      : 'border-rose-400 bg-rose-900/40 text-rose-100';
  return (
    <div className={`mx-3 my-3 p-4 rounded-lg border ${accent} text-center`}>
      <div className="text-lg font-bold mb-1">{title}</div>
      <div className="text-sm mb-2">{subtitle}</div>
      <div className="text-xs opacity-80 mb-3">
        Score: <span className="font-bold">{score ?? 0}</span> {variant === 'win' ? '(perfect = 0)' : '(cards left in deck + hands)'}
      </div>
      {isHost && (
        <button
          onClick={onRestart}
          disabled={restarting}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 rounded text-sm font-bold"
        >
          {restarting ? '...' : 'Play Again'}
        </button>
      )}
      {!isHost && <div className="text-xs opacity-70">Waiting for host to start a new game…</div>}
    </div>
  );
}
