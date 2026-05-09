import { useState } from 'react';
import type { KitesGameState } from '@shared/kites/types';
import { KITES_MIN_PLAYERS } from '@shared/kites/constants';
import { kitesJoinGame, kitesLeaveGame, kitesStartGame } from '../../api-kites.ts';
import { useToast } from '../../hooks/useToast.ts';
import { Toast } from '../Toast.tsx';

interface Props {
  uid: string;
  displayName: string;
  setDisplayName: (name: string) => void;
  signIn: () => Promise<void>;
  gameState: KitesGameState | null;
  isInGame: boolean;
  roomId: string;
  onLeaveRoom: () => void;
}

export function KitesLobby({
  uid,
  displayName,
  setDisplayName,
  signIn,
  gameState,
  isInGame,
  roomId,
  onLeaveRoom,
}: Props) {
  const [nameInput, setNameInput] = useState(displayName);
  const [joining, setJoining] = useState(false);
  const [starting, setStarting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const { message: toast, showToast } = useToast();

  const players = gameState ? Object.values(gameState.players) : [];
  const isHost = gameState?.hostUid === uid;
  const canStart = isHost && (gameState?.playerOrder.length ?? 0) >= KITES_MIN_PLAYERS;

  const handleJoin = async () => {
    if (!nameInput.trim()) return;
    setJoining(true);
    try {
      setDisplayName(nameInput.trim());
      await signIn();
      await kitesJoinGame({ roomId, displayName: nameInput.trim(), create: !gameState });
    } catch (err) {
      console.error('Failed to join:', err);
      showToast('Failed to join game — try again');
    } finally {
      setJoining(false);
    }
  };

  const handleStart = async () => {
    setStarting(true);
    try {
      await kitesStartGame({ roomId });
    } catch (err) {
      console.error('Failed to start game:', err);
      showToast('Failed to start game');
      setStarting(false);
    }
  };

  const handleLeave = async () => {
    setLeaving(true);
    try {
      await kitesLeaveGame({ roomId });
      onLeaveRoom();
    } catch (err) {
      console.error('Failed to leave:', err);
      showToast('Failed to leave');
      setLeaving(false);
    }
  };

  if (isInGame && gameState) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-sky-900 to-sky-950 text-white flex items-center justify-center font-sans">
        <div className="border border-sky-700/60 bg-sky-950/80 backdrop-blur p-6 rounded-lg max-w-sm w-full mx-4 shadow-2xl shadow-sky-500/10">
          <h1 className="text-2xl font-bold text-center mb-1 tracking-wide">Kites</h1>
          <p className="text-sky-300 text-center text-xs mb-1">Cooperative real-time</p>
          <p className="text-cyan-300 text-center text-xs mb-4 tracking-widest">Room: {roomId}</p>

          <div className="mb-4">
            <div className="text-xs text-sky-400 mb-2">Pilots ({players.length})</div>
            {players.map((p) => (
              <div key={p.uid} className="text-sm py-0.5 flex items-center gap-2">
                {p.uid === gameState.hostUid && <span className="text-yellow-300">★</span>}
                <span className="text-sky-100">{p.displayName}</span>
                {p.uid === uid && <span className="text-sky-500 text-xs">(you)</span>}
              </div>
            ))}
          </div>

          <div className="space-y-2">
            {isHost ? (
              <button
                onClick={handleStart}
                disabled={!canStart || starting}
                className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-bold rounded"
              >
                {starting ? 'Lifting off...' : canStart ? 'Start Flying' : `Need ${KITES_MIN_PLAYERS}+ pilots`}
              </button>
            ) : (
              <div className="w-full py-2 text-center text-sky-400 text-sm">
                Waiting for host to start...
              </div>
            )}
            <button
              onClick={handleLeave}
              disabled={leaving}
              className="w-full py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-gray-300 text-sm rounded"
            >
              {leaving ? '...' : 'Leave'}
            </button>
          </div>
        </div>
        <Toast message={toast} />
      </div>
    );
  }

  // Not in game — join form
  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-900 to-sky-950 text-white flex items-center justify-center font-sans">
      <div className="border border-sky-700/60 bg-sky-950/80 backdrop-blur p-6 rounded-lg max-w-sm w-full mx-4 shadow-2xl shadow-sky-500/10">
        <h1 className="text-2xl font-bold text-center mb-1 tracking-wide">Kites</h1>
        <p className="text-sky-300 text-center text-xs mb-1">Cooperative real-time</p>
        <p className="text-cyan-300 text-center text-xs mb-4 tracking-widest">Room: {roomId}</p>

        <div className="space-y-3">
          <div>
            <label htmlFor="kites-name" className="block text-xs text-sky-400 mb-1">
              Display Name
            </label>
            <input
              id="kites-name"
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              placeholder="Pilot name"
              maxLength={20}
              className="w-full px-3 py-2 bg-sky-900/50 border border-sky-700 text-white placeholder-sky-600 focus:outline-none focus:border-cyan-400 text-sm rounded"
            />
          </div>
          <button
            onClick={handleJoin}
            disabled={!nameInput.trim() || joining}
            className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-bold rounded"
          >
            {joining ? 'Joining...' : 'Join Game'}
          </button>
        </div>

        {players.length > 0 && (
          <div className="mt-4 pt-3 border-t border-sky-800">
            <div className="text-xs text-sky-400 mb-2">Pilots at table ({players.length})</div>
            {players.map((p) => (
              <div key={p.uid} className="text-xs text-sky-200 py-0.5">
                {p.displayName}
                {p.uid === uid && ' (you)'}
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 pt-3 border-t border-sky-800 flex justify-center">
          <button onClick={onLeaveRoom} className="text-xs text-sky-500 hover:text-sky-300">
            ← Back
          </button>
        </div>
      </div>
      <Toast message={toast} />
    </div>
  );
}
