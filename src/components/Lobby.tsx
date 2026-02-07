import { useState, useCallback } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase.ts';
import type { GameState } from '../../shared/types.ts';

interface LobbyProps {
  uid: string;
  displayName: string;
  setDisplayName: (name: string) => void;
  signIn: () => Promise<void>;
  gameState: GameState | null;
}

export function Lobby({ uid, displayName, setDisplayName, signIn, gameState }: LobbyProps) {
  const [nameInput, setNameInput] = useState(displayName);
  const [joining, setJoining] = useState(false);
  const [readying, setReadying] = useState(false);

  const hasJoined = gameState?.players[uid] !== undefined;
  const isReady = gameState?.players[uid]?.ready ?? false;
  const players = gameState ? Object.values(gameState.players) : [];

  const handleJoin = useCallback(async () => {
    if (!nameInput.trim()) return;
    setJoining(true);
    try {
      setDisplayName(nameInput.trim());
      await signIn();
      const joinGame = httpsCallable(functions, 'joinGame');
      await joinGame({ displayName: nameInput.trim() });
    } catch (err) {
      console.error('Failed to join:', err);
    } finally {
      setJoining(false);
    }
  }, [nameInput, setDisplayName, signIn]);

  const handleReady = useCallback(async () => {
    setReadying(true);
    try {
      const readyUp = httpsCallable(functions, 'readyUp');
      await readyUp({});
    } catch (err) {
      console.error('Failed to ready up:', err);
    } finally {
      setReadying(false);
    }
  }, []);

  return (
    <div className="min-h-screen bg-green-900 flex items-center justify-center">
      <div className="bg-gray-900/80 border border-gray-700 rounded-xl p-8 max-w-md w-full mx-4">
        <h1 className="text-3xl font-bold text-white text-center mb-2">
          Pineapple Poker
        </h1>
        <p className="text-gray-400 text-center text-sm mb-6">Open Face Chinese</p>

        {!hasJoined ? (
          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm text-gray-400 mb-1">
                Display Name
              </label>
              <input
                id="name"
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                placeholder="Enter your name"
                maxLength={20}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-green-500"
              />
            </div>
            <button
              onClick={handleJoin}
              disabled={!nameInput.trim() || joining}
              className="w-full py-3 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg font-semibold transition-colors"
            >
              {joining ? 'Joining...' : 'Join Game'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Player list */}
            <div>
              <h3 className="text-sm font-semibold text-gray-400 mb-2">Players</h3>
              <div className="space-y-1">
                {players.map((p) => (
                  <div
                    key={p.uid}
                    className="flex items-center justify-between px-3 py-2 bg-gray-800/60 rounded-lg"
                  >
                    <span className={`text-sm ${p.uid === uid ? 'text-yellow-300' : 'text-gray-300'}`}>
                      {p.displayName}
                      {p.uid === uid && ' (You)'}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      p.ready ? 'bg-green-600/30 text-green-400' : 'bg-gray-700 text-gray-500'
                    }`}>
                      {p.ready ? 'Ready' : 'Waiting'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {!isReady && (
              <button
                onClick={handleReady}
                disabled={readying}
                className="w-full py-3 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 text-white rounded-lg font-semibold transition-colors"
              >
                {readying ? 'Readying...' : 'Ready for Next Round'}
              </button>
            )}

            {isReady && (
              <div className="text-center text-green-400 text-sm py-3">
                Waiting for other players to ready up...
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
