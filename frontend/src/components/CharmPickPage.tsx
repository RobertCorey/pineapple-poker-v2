import { useState } from 'react';
import type { GameState } from '@shared/core/types';
import { CHARMS } from '@shared/game-logic/charms';
import { pickCharm } from '../api.ts';
import { useToast } from '../hooks/useToast.ts';
import { Toast } from './Toast.tsx';

interface CharmPickPageProps {
  gameState: GameState;
  uid: string;
  roomId: string;
}

export function CharmPickPage({ gameState, uid, roomId }: CharmPickPageProps) {
  const [picking, setPicking] = useState(false);
  const { message: toast, showToast } = useToast();

  const options = gameState.charmOptions ?? [];
  const myPick = gameState.charmPicks?.[uid];
  const myCharms = gameState.charms?.[uid] ?? [];
  const isObserver = !gameState.playerOrder.includes(uid);

  const players = gameState.playerOrder
    .map((u) => gameState.players[u])
    .filter(Boolean);

  const handlePick = async (charmId: string) => {
    if (picking || myPick) return;
    setPicking(true);
    try {
      await pickCharm({ roomId, charmId });
    } catch (err) {
      console.error('Pick charm failed:', err);
      showToast('Failed to pick charm — try again');
    } finally {
      setPicking(false);
    }
  };

  const lastResults = gameState.roundResults ?? {};
  const charmBonuses = gameState.charmBonuses ?? {};

  return (
    <div className="min-h-screen bg-gray-900 text-white font-mono flex flex-col items-center px-3 py-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-3">
          <div className="text-purple-300 text-xs tracking-widest uppercase">
            Pineapple Run
          </div>
          <div className="text-2xl font-bold mt-1">
            Round {gameState.round} Complete
          </div>
          <div className="text-gray-400 text-xs mt-1">
            Pick a charm. {gameState.totalRounds - gameState.round} round
            {gameState.totalRounds - gameState.round === 1 ? '' : 's'} remaining.
          </div>
        </div>

        {/* Last round summary */}
        <div className="border border-gray-700 p-3 mb-4 text-xs">
          <div className="text-gray-500 mb-2 uppercase tracking-wide text-[10px]">
            Last Round
          </div>
          {players.map((p) => {
            const r = lastResults[p.uid];
            const cb = charmBonuses[p.uid] ?? 0;
            const net = r?.netScore ?? 0;
            const fouled = r?.fouled;
            return (
              <div key={p.uid} className="flex items-center justify-between py-1">
                <span className="text-gray-300">
                  {p.displayName}
                  {p.uid === uid && ' (you)'}
                </span>
                <div className="flex items-center gap-2">
                  {fouled && <span className="text-red-400 text-[10px]">FOUL</span>}
                  {cb > 0 && (
                    <span className="text-purple-300 text-[10px]">
                      +{cb} charms
                    </span>
                  )}
                  <span
                    className={`font-bold ${
                      net > 0
                        ? 'text-green-400'
                        : net < 0
                          ? 'text-red-400'
                          : 'text-gray-400'
                    }`}
                  >
                    {net > 0 ? '+' : ''}
                    {net}
                  </span>
                  <span className="text-gray-500 text-[10px]">
                    (total {p.score})
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Your charms */}
        {myCharms.length > 0 && (
          <div className="mb-4">
            <div className="text-gray-500 text-[10px] uppercase tracking-wide mb-1">
              Your Charms
            </div>
            <div className="flex flex-wrap gap-1">
              {myCharms.map((cid, i) => {
                const c = CHARMS[cid];
                if (!c) return null;
                return (
                  <span
                    key={i}
                    title={c.description}
                    className="border border-purple-700 bg-purple-900/30 text-[10px] px-1.5 py-0.5 rounded"
                  >
                    {c.emoji} {c.name}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Charm options */}
        {!isObserver && (
          <div className="space-y-2">
            <div className="text-gray-500 text-[10px] uppercase tracking-wide mb-1">
              {myPick ? 'You picked' : 'Pick one'}
            </div>
            {options.map((cid) => {
              const c = CHARMS[cid];
              if (!c) return null;
              const isMine = myPick === cid;
              const someoneElsePicked = !isMine && myPick != null;
              return (
                <button
                  key={cid}
                  onClick={() => handlePick(cid)}
                  disabled={picking || !!myPick}
                  className={`w-full text-left border p-3 transition-colors ${
                    isMine
                      ? 'border-purple-400 bg-purple-900/40'
                      : someoneElsePicked
                        ? 'border-gray-700 bg-gray-800/40 opacity-50'
                        : 'border-gray-700 hover:border-purple-500 hover:bg-purple-900/20 active:bg-purple-900/40'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-2xl">{c.emoji}</span>
                    <span className="font-bold text-sm text-purple-200">{c.name}</span>
                    {isMine && (
                      <span className="ml-auto text-purple-300 text-[10px]">PICKED</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-300 leading-snug">
                    {c.description}
                  </p>
                </button>
              );
            })}
          </div>
        )}

        {/* Status */}
        <div className="mt-4 text-center text-xs text-gray-500">
          {(() => {
            const pickCount = Object.keys(gameState.charmPicks ?? {}).length;
            const total = gameState.playerOrder.length;
            if (pickCount === total) return 'Starting next round...';
            return `Waiting for picks (${pickCount}/${total})`;
          })()}
        </div>
      </div>
      <Toast message={toast} />
    </div>
  );
}
