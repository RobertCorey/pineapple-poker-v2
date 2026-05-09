import { useState, useRef, useLayoutEffect } from 'react';
import type { GameState, Suit } from '@shared/core/types';
import { Suit as S } from '@shared/core/types';
import { CHARMS } from '@shared/game-logic/charms';
import { MUTATIONS } from '@shared/game-logic/mutations';
import { isFoul } from '@shared/game-logic/scoring';
import { pickCharm, pickMutation, leaveGame } from '../api.ts';
import { useToast } from '../hooks/useToast.ts';
import { Toast } from './Toast.tsx';
import { PlayerBoard } from './PlayerBoard.tsx';

interface CharmPickPageProps {
  gameState: GameState;
  uid: string;
  roomId: string;
  onLeaveRoom: () => void;
}

const SUIT_OPTIONS: { suit: Suit; label: string; color: string }[] = [
  { suit: S.Spades, label: '♠', color: 'text-gray-200' },
  { suit: S.Hearts, label: '♥', color: 'text-red-400' },
  { suit: S.Diamonds, label: '♦', color: 'text-red-400' },
  { suit: S.Clubs, label: '♣', color: 'text-gray-200' },
];

export function CharmPickPage({ gameState, uid, roomId, onLeaveRoom }: CharmPickPageProps) {
  const [pickingCharm, setPickingCharm] = useState(false);
  const [pickingMutation, setPickingMutation] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // For mutations that require a sub-target (suit, rank, etc.), we collect
  // the choice inline. `targetingMutation` is the id of the mutation the user
  // is currently confirming; when set we show suit chips below it.
  const [targetingMutation, setTargetingMutation] = useState<string | null>(null);
  const { message: toast, showToast } = useToast();

  const charmOptions = gameState.charmOptions ?? [];
  const mutationOptions = gameState.mutationOptions ?? [];
  const myCharmPick = gameState.charmPicks?.[uid];
  const myMutationPick = gameState.mutationPicks?.[uid];
  const myCharms = gameState.charms?.[uid] ?? [];
  const myMutations = gameState.mutations?.[uid] ?? [];
  const isObserver = !gameState.playerOrder.includes(uid);

  const players = gameState.playerOrder
    .map((u) => gameState.players[u])
    .filter(Boolean);
  const me = players.find((p) => p.uid === uid);
  const opponents = players.filter((p) => p.uid !== uid);

  const lastResults = gameState.roundResults ?? {};
  const charmBonuses = gameState.charmBonuses ?? {};

  // Compute card width for the boards
  const opponentRef = useRef<HTMLDivElement>(null);
  const myRef = useRef<HTMLDivElement>(null);
  const [opponentCardW, setOpponentCardW] = useState(28);
  const [myCardW, setMyCardW] = useState(28);
  useLayoutEffect(() => {
    const calc = (el: HTMLDivElement | null, setter: (n: number) => void) => {
      if (!el) return;
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w <= 0 || h <= 0) return;
      const fromWidth = (w - 10) / 5.48;
      const fromHeight = (h - 78) / 5.84;
      setter(Math.max(8, Math.floor(Math.min(fromWidth, fromHeight))));
    };
    calc(opponentRef.current, setOpponentCardW);
    calc(myRef.current, setMyCardW);
  }, []);

  const handlePickCharm = async (charmId: string) => {
    if (pickingCharm || myCharmPick) return;
    setPickingCharm(true);
    try {
      await pickCharm({ roomId, charmId });
    } catch (err) {
      console.error('Pick charm failed:', err);
      showToast('Failed to pick charm — try again');
    } finally {
      setPickingCharm(false);
    }
  };

  const handlePickMutation = async (mutationId: string, target?: string) => {
    if (pickingMutation || myMutationPick) return;
    const def = MUTATIONS[mutationId];
    if (def?.requiresTarget === 'suit' && !target) {
      // Open the targeting UI for this mutation
      setTargetingMutation(mutationId);
      return;
    }
    setPickingMutation(true);
    try {
      const args: { roomId: string; mutationId: string; target?: string } = {
        roomId,
        mutationId,
      };
      if (target) args.target = target;
      await pickMutation(args);
      setTargetingMutation(null);
    } catch (err) {
      console.error('Pick mutation failed:', err);
      showToast('Failed to pick mutation — try again');
    } finally {
      setPickingMutation(false);
    }
  };

  const handleLeave = async () => {
    setLeaving(true);
    try {
      await leaveGame({ roomId });
      onLeaveRoom();
    } catch {
      setLeaving(false);
    }
  };

  const charmPickCount = Object.keys(gameState.charmPicks ?? {}).length;
  const mutationPickCount = Object.keys(gameState.mutationPicks ?? {}).length;
  const totalPlayers = gameState.playerOrder.length;
  const allChose = charmPickCount === totalPlayers && mutationPickCount === totalPlayers;

  return (
    <div className="h-[100dvh] bg-black flex justify-center">
      <div className="w-full max-w-[430px] bg-gray-900 text-white font-mono flex flex-col overflow-hidden">
        {/* Compact header */}
        <div className="border-b border-gray-700 px-2 py-1.5 flex items-center justify-between text-[10px] flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-purple-300 font-bold tracking-wider">
              ROUND {gameState.round} / {gameState.totalRounds}
            </span>
            <span className="text-gray-500">{roomId}</span>
          </div>
          <div className="text-gray-400">
            {allChose ? 'starting next round...' : 'pick a charm + mutation'}
          </div>
          <button
            onClick={handleLeave}
            disabled={leaving}
            className="px-2 py-1 bg-red-800 active:bg-red-700 disabled:bg-gray-700 text-white text-[10px] rounded ml-1"
          >
            {leaving ? '...' : 'Leave'}
          </button>
        </div>

        {/* Boards (last round) — compact */}
        <div className="flex-shrink-0 border-b border-gray-800">
          {/* Opponent boards */}
          <div ref={opponentRef} className="px-1 pt-1" style={{ minHeight: 130 }}>
            <div className={`grid gap-1 ${opponents.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {opponents.map((p) => {
                const r = lastResults[p.uid];
                const cb = charmBonuses[p.uid] ?? 0;
                const fouled = r?.fouled || isFoul(p.board);
                return (
                  <div key={p.uid} className="relative">
                    <PlayerBoard
                      board={p.board}
                      playerName={p.displayName}
                      fouled={fouled}
                      cardWidthPx={opponentCardW}
                      score={p.score}
                    />
                    <div className="absolute top-1 right-1 flex flex-col items-end gap-0.5">
                      {r && (
                        <span
                          className={`text-[10px] font-bold px-1 rounded ${
                            r.netScore > 0
                              ? 'text-green-300 bg-green-900/60'
                              : r.netScore < 0
                                ? 'text-red-300 bg-red-900/60'
                                : 'text-gray-300 bg-gray-700/60'
                          }`}
                        >
                          {r.netScore > 0 ? '+' : ''}
                          {r.netScore}
                        </span>
                      )}
                      {cb > 0 && (
                        <span className="text-[9px] text-purple-300 bg-purple-900/60 px-1 rounded">
                          +{cb} chrm
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Your board */}
          {me && (
            <div ref={myRef} className="px-1 pt-1 pb-1" style={{ minHeight: 130 }}>
              <div className="relative">
                <PlayerBoard
                  board={me.board}
                  playerName={`${me.displayName} (You)`}
                  fouled={(lastResults[uid]?.fouled ?? false) || isFoul(me.board)}
                  isCurrentPlayer
                  cardWidthPx={myCardW}
                  score={me.score}
                />
                <div className="absolute top-1 right-1 flex flex-col items-end gap-0.5">
                  {lastResults[uid] && (
                    <span
                      className={`text-[10px] font-bold px-1 rounded ${
                        lastResults[uid]!.netScore > 0
                          ? 'text-green-300 bg-green-900/60'
                          : lastResults[uid]!.netScore < 0
                            ? 'text-red-300 bg-red-900/60'
                            : 'text-gray-300 bg-gray-700/60'
                      }`}
                    >
                      {lastResults[uid]!.netScore > 0 ? '+' : ''}
                      {lastResults[uid]!.netScore}
                    </span>
                  )}
                  {(charmBonuses[uid] ?? 0) > 0 && (
                    <span className="text-[9px] text-purple-300 bg-purple-900/60 px-1 rounded">
                      +{charmBonuses[uid]} chrm
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Picks panel (scrollable) */}
        <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-3">
          {/* Your existing collection */}
          {(myCharms.length > 0 || myMutations.length > 0) && (
            <div className="text-[10px] text-gray-500">
              <div className="flex flex-wrap gap-1">
                {myCharms.map((cid, i) => {
                  const c = CHARMS[cid];
                  if (!c) return null;
                  return (
                    <span
                      key={`c${i}`}
                      title={c.description}
                      className="border border-purple-700 bg-purple-900/30 text-[10px] px-1.5 py-0.5 rounded"
                    >
                      {c.emoji} {c.name}
                    </span>
                  );
                })}
                {myMutations.map((m, i) => {
                  const def = MUTATIONS[m.id];
                  if (!def) return null;
                  return (
                    <span
                      key={`m${i}`}
                      title={def.description}
                      className="border border-amber-700 bg-amber-900/30 text-[10px] px-1.5 py-0.5 rounded"
                    >
                      {def.emoji} {def.name}
                      {m.target ? ` (${m.target})` : ''}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Charm options */}
          {!isObserver && (
            <div>
              <div className="text-purple-300 text-[10px] uppercase tracking-wider mb-1">
                {myCharmPick ? '✓ Charm picked' : 'Pick a charm'}
              </div>
              <div className="space-y-1.5">
                {charmOptions.map((cid) => {
                  const c = CHARMS[cid];
                  if (!c) return null;
                  const isMine = myCharmPick === cid;
                  const lockedOut = !isMine && myCharmPick != null;
                  return (
                    <button
                      key={cid}
                      onClick={() => handlePickCharm(cid)}
                      disabled={pickingCharm || !!myCharmPick}
                      className={`w-full text-left border p-2 transition-colors ${
                        isMine
                          ? 'border-purple-400 bg-purple-900/40'
                          : lockedOut
                            ? 'border-gray-700 bg-gray-800/40 opacity-50'
                            : 'border-gray-700 bg-gray-800/30 hover:border-purple-500 active:bg-purple-900/30'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{c.emoji}</span>
                        <span className="font-bold text-xs text-purple-200">{c.name}</span>
                        {isMine && (
                          <span className="ml-auto text-purple-300 text-[9px]">PICKED</span>
                        )}
                      </div>
                      <p className="text-[10px] text-gray-300 leading-snug mt-0.5">
                        {c.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Mutation options */}
          {!isObserver && (
            <div>
              <div className="text-amber-300 text-[10px] uppercase tracking-wider mb-1">
                {myMutationPick ? '✓ Mutation picked' : 'Pick a deck mutation'}
              </div>
              <div className="space-y-1.5">
                {mutationOptions.map((mid) => {
                  const m = MUTATIONS[mid];
                  if (!m) return null;
                  const isMine = myMutationPick?.id === mid;
                  const lockedOut = !isMine && myMutationPick != null;
                  const isTargeting = targetingMutation === mid && !myMutationPick;
                  return (
                    <div key={mid}>
                      <button
                        onClick={() => handlePickMutation(mid)}
                        disabled={pickingMutation || !!myMutationPick}
                        className={`w-full text-left border p-2 transition-colors ${
                          isMine
                            ? 'border-amber-400 bg-amber-900/40'
                            : lockedOut
                              ? 'border-gray-700 bg-gray-800/40 opacity-50'
                              : 'border-gray-700 bg-gray-800/30 hover:border-amber-500 active:bg-amber-900/30'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{m.emoji}</span>
                          <span className="font-bold text-xs text-amber-200">{m.name}</span>
                          {m.requiresTarget === 'suit' && !isMine && (
                            <span className="ml-1 text-[9px] text-gray-400">(pick a suit)</span>
                          )}
                          {isMine && (
                            <span className="ml-auto text-amber-300 text-[9px]">
                              PICKED
                              {myMutationPick?.target ? ` (${myMutationPick.target})` : ''}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-gray-300 leading-snug mt-0.5">
                          {m.description}
                        </p>
                      </button>
                      {isTargeting && (
                        <div className="flex gap-1 mt-1 ml-4">
                          {SUIT_OPTIONS.map((opt) => (
                            <button
                              key={opt.suit}
                              onClick={() => handlePickMutation(mid, opt.suit)}
                              disabled={pickingMutation}
                              className={`px-3 py-2 text-xl ${opt.color} bg-gray-800 border border-gray-700 hover:border-amber-500 active:bg-amber-900/30 rounded`}
                            >
                              {opt.label}
                            </button>
                          ))}
                          <button
                            onClick={() => setTargetingMutation(null)}
                            className="px-2 py-2 text-[10px] text-gray-400 ml-auto"
                          >
                            cancel
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Status footer */}
          <div className="text-center text-[10px] text-gray-500 pt-1 pb-2">
            {allChose
              ? 'starting next round...'
              : `Charm picks ${charmPickCount}/${totalPlayers} · Mutation picks ${mutationPickCount}/${totalPlayers}`}
          </div>
        </div>
      </div>
      <Toast message={toast} />
    </div>
  );
}
