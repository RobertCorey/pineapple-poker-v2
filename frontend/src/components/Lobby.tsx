import { useState, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions, trackEvent } from '../firebase.ts';
import type { GameState, MatchSettings } from '@shared/core/types';
import { DEFAULT_MATCH_SETTINGS } from '@shared/core/constants';

interface LobbyProps {
  uid: string;
  displayName: string;
  setDisplayName: (name: string) => void;
  signIn: () => Promise<void>;
  gameState: GameState | null;
  isInGame: boolean;
  roomId: string;
  onLeaveRoom: () => void;
}

export function Lobby({ uid, displayName, setDisplayName, signIn, gameState, isInGame, roomId, onLeaveRoom }: LobbyProps) {
  const [nameInput, setNameInput] = useState(displayName);
  const [joining, setJoining] = useState(false);
  const [starting, setStarting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [addingBot, setAddingBot] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Match settings — host can configure before starting
  const getInitialTimeout = (): number => {
    if (import.meta.env.DEV) {
      const params = new URLSearchParams(window.location.search);
      const t = params.get('timeout');
      if (t && !isNaN(Number(t))) return Number(t);
    }
    return DEFAULT_MATCH_SETTINGS.turnTimeoutMs;
  };
  const [turnTimeoutMs, setTurnTimeoutMs] = useState<number>(getInitialTimeout);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const players = gameState ? Object.values(gameState.players) : [];
  const isHost = gameState?.hostUid === uid;
  const canStart = isHost && (gameState?.playerOrder.length ?? 0) >= 2;

  const handleJoin = async () => {
    if (!nameInput.trim()) return;
    setJoining(true);
    try {
      setDisplayName(nameInput.trim());
      await signIn();
      const joinGame = httpsCallable(functions, 'joinGame');
      await joinGame({ roomId, displayName: nameInput.trim(), create: !gameState });
      trackEvent('join_room', { roomId });
    } catch (err) {
      console.error('Failed to join:', err);
      setToast('Failed to join game — try again');
    } finally {
      setJoining(false);
    }
  };

  const handleStart = async () => {
    setStarting(true);
    try {
      const startMatchFn = httpsCallable(functions, 'startMatch');
      const settings: MatchSettings = {
        turnTimeoutMs,
        interRoundDelayMs: DEFAULT_MATCH_SETTINGS.interRoundDelayMs,
      };
      await startMatchFn({ roomId, settings });
      trackEvent('start_match', { roomId });
    } catch (err) {
      console.error('Failed to start match:', err);
      setToast('Failed to start match');
      setStarting(false);
    }
  };

  const handleLeave = async () => {
    setLeaving(true);
    try {
      const leaveGameFn = httpsCallable(functions, 'leaveGame');
      await leaveGameFn({ roomId });
      trackEvent('leave_game', { roomId });
      onLeaveRoom();
    } catch (err) {
      console.error('Failed to leave:', err);
      setToast('Failed to leave game');
      setLeaving(false);
    }
  };

  const handleAddBot = async () => {
    setAddingBot(true);
    try {
      const addBotFn = httpsCallable(functions, 'addBot');
      await addBotFn({ roomId });
    } catch (err) {
      console.error('Failed to add bot:', err);
      setToast('Failed to add bot');
    } finally {
      setAddingBot(false);
    }
  };

  const handleRemoveBot = async (botUid: string) => {
    try {
      const removeBotFn = httpsCallable(functions, 'removeBot');
      await removeBotFn({ roomId, botUid });
    } catch (err) {
      console.error('Failed to remove bot:', err);
      setToast('Failed to remove bot');
    }
  };

  // In-game lobby view (waiting for host to start)
  if (isInGame && gameState) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center font-mono">
        <div className="border border-gray-700 p-6 max-w-sm w-full mx-4">
          <h1 className="text-xl font-bold text-center mb-1">Pineapple Poker</h1>
          <p className="text-gray-500 text-center text-xs mb-1">Match Lobby</p>
          <p className="text-green-400 text-center text-xs mb-4 tracking-widest">Room: {roomId}</p>

          <div className="mb-4">
            <div className="text-xs text-gray-500 mb-2">Players ({players.length})</div>
            {players.map((p) => (
              <div key={p.uid} className="text-xs text-gray-400 py-0.5 flex items-center gap-1">
                {p.uid === gameState.hostUid && <span className="text-yellow-400">&#9733;</span>}
                {p.displayName}
                {p.uid === uid && ' (you)'}
                {p.isBot && <span className="text-cyan-400 text-[10px] border border-cyan-700 px-1 rounded">BOT</span>}
                {p.isBot && isHost && (
                  <button
                    onClick={() => handleRemoveBot(p.uid)}
                    className="text-red-500 hover:text-red-400 text-[10px] ml-1"
                    title="Remove bot"
                  >
                    x
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Match settings */}
          <div className="mb-4">
            <div className="text-xs text-gray-500 mb-2">Match Settings</div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-400">Turn Timer</span>
              {isHost ? (
                <select
                  data-testid="turn-timeout-select"
                  value={turnTimeoutMs}
                  onChange={(e) => setTurnTimeoutMs(Number(e.target.value))}
                  className="bg-gray-800 border border-gray-600 text-white text-xs px-2 py-1 focus:outline-none focus:border-green-500"
                >
                  <option value={5000}>5s</option>
                  <option value={10000}>10s</option>
                  <option value={20000}>20s</option>
                  <option value={30000}>30s</option>
                  <option value={45000}>45s</option>
                  <option value={60000}>60s</option>
                </select>
              ) : (
                <span className="text-gray-400">{turnTimeoutMs / 1000}s</span>
              )}
            </div>
          </div>

          <div className="space-y-2">
            {isHost && (
              <button
                onClick={handleAddBot}
                disabled={addingBot}
                className="w-full py-2 bg-cyan-800 hover:bg-cyan-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm"
              >
                {addingBot ? 'Adding...' : '+ Add Bot'}
              </button>
            )}
            {isHost ? (
              <button
                data-testid="start-match-button"
                onClick={handleStart}
                disabled={!canStart || starting}
                className="w-full py-2 bg-green-700 hover:bg-green-600 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-bold"
              >
                {starting ? 'Starting...' : canStart ? 'Start Match' : 'Need 2+ players'}
              </button>
            ) : (
              <div className="w-full py-2 text-center text-gray-500 text-sm">
                Waiting for host to start...
              </div>
            )}
            <button
              onClick={handleLeave}
              disabled={leaving}
              className="w-full py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-gray-300 text-sm"
            >
              {leaving ? '...' : 'Leave'}
            </button>
          </div>
        </div>
        {toast && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-red-900 border border-red-700 px-4 py-2 text-xs text-red-300 shadow-lg z-50">
            {toast}
          </div>
        )}
      </div>
    );
  }

  // Not in game — join form
  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center font-mono">
      <div className="border border-gray-700 p-6 max-w-sm w-full mx-4">
        <h1 className="text-xl font-bold text-center mb-1">Pineapple Poker</h1>
        <p className="text-gray-500 text-center text-xs mb-1">Open Face Chinese</p>
        <p className="text-green-400 text-center text-xs mb-4 tracking-widest">Room: {roomId}</p>

        <div className="space-y-3">
          <div>
            <label htmlFor="name" className="block text-xs text-gray-500 mb-1">
              Display Name
            </label>
            <input
              id="name"
              data-testid="name-input"
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              placeholder="Enter your name"
              maxLength={20}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-600 text-white placeholder-gray-500 focus:outline-none focus:border-green-500 text-sm"
            />
          </div>
          <button
            data-testid="join-button"
            onClick={handleJoin}
            disabled={!nameInput.trim() || joining}
            className="w-full py-2 bg-green-700 hover:bg-green-600 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-bold"
          >
            {joining ? 'Joining...' : 'Join Game'}
          </button>
        </div>

        {players.length > 0 && (
          <div className="mt-4 pt-3 border-t border-gray-700">
            <div className="text-xs text-gray-500 mb-2">Players at table ({players.length})</div>
            {players.map((p) => (
              <div key={p.uid} className="text-xs text-gray-400 py-0.5 flex items-center gap-1">
                {p.displayName}
                {p.uid === uid && ' (you)'}
                {p.isBot && <span className="text-cyan-400 text-[10px] border border-cyan-700 px-1 rounded">BOT</span>}
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 pt-3 border-t border-gray-700 flex justify-center">
          <button
            onClick={onLeaveRoom}
            className="text-xs text-gray-500 hover:text-gray-300"
          >
            &larr; Back
          </button>
        </div>
      </div>
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-red-900 border border-red-700 px-4 py-2 text-xs text-red-300 shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
