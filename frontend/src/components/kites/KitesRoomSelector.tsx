import { useState } from 'react';
import { kitesJoinGame } from '../../api-kites.ts';
import { useToast } from '../../hooks/useToast.ts';
import { generateRoomCode } from '../../utils/roomCode.ts';
import { Toast } from '../Toast.tsx';

interface Props {
  displayName: string;
  setDisplayName: (name: string) => void;
  signIn: () => Promise<void>;
  onRoomJoined: (roomId: string) => void;
  onSwitchGame?: () => void;
}

export function KitesRoomSelector({ displayName, setDisplayName, signIn, onRoomJoined, onSwitchGame }: Props) {
  const [nameInput, setNameInput] = useState(displayName);
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const { message: toast, showToast } = useToast();

  const handleCreate = async () => {
    if (!nameInput.trim()) return;
    setCreating(true);
    try {
      setDisplayName(nameInput.trim());
      await signIn();
      const roomId = generateRoomCode();
      await kitesJoinGame({ roomId, displayName: nameInput.trim(), create: true });
      onRoomJoined(roomId);
    } catch (err) {
      console.error('Failed to create room:', err);
      showToast('Failed to create room — try again');
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async () => {
    if (!nameInput.trim() || !roomCodeInput.trim()) return;
    setJoining(true);
    try {
      setDisplayName(nameInput.trim());
      await signIn();
      const roomId = roomCodeInput.trim().toUpperCase();
      await kitesJoinGame({ roomId, displayName: nameInput.trim() });
      onRoomJoined(roomId);
    } catch (err) {
      console.error('Failed to join room:', err);
      showToast('Room not found or failed to join');
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-900 to-sky-950 text-white flex items-center justify-center font-sans">
      <div className="border border-sky-700/60 bg-sky-950/80 backdrop-blur p-6 rounded-lg max-w-sm w-full mx-4 shadow-2xl shadow-sky-500/10">
        <h1 className="text-3xl font-bold text-center mb-1 tracking-wide">Kites</h1>
        <p className="text-sky-300 text-center text-xs mb-5">Cooperative · Real-time · 2–6 pilots</p>

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
              placeholder="Pilot name"
              maxLength={20}
              className="w-full px-3 py-2 bg-sky-900/50 border border-sky-700 text-white placeholder-sky-600 focus:outline-none focus:border-cyan-400 text-sm rounded"
            />
          </div>

          <button
            onClick={handleCreate}
            disabled={!nameInput.trim() || creating}
            className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-bold rounded"
          >
            {creating ? 'Creating...' : 'Create Room'}
          </button>

          <div className="flex items-center gap-2 text-sky-600 text-xs">
            <div className="flex-1 border-t border-sky-800" />
            or join
            <div className="flex-1 border-t border-sky-800" />
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={roomCodeInput}
              onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              placeholder="Room code"
              maxLength={6}
              className="flex-1 px-3 py-2 bg-sky-900/50 border border-sky-700 text-white placeholder-sky-600 focus:outline-none focus:border-cyan-400 text-sm uppercase tracking-widest rounded"
            />
            <button
              onClick={handleJoin}
              disabled={!nameInput.trim() || !roomCodeInput.trim() || joining}
              className="px-4 py-2 bg-sky-700 hover:bg-sky-600 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-bold rounded"
            >
              {joining ? '...' : 'Join'}
            </button>
          </div>
        </div>

        {onSwitchGame && (
          <div className="mt-4 pt-3 border-t border-sky-800 flex justify-center">
            <button
              onClick={onSwitchGame}
              className="text-xs text-sky-400 hover:text-sky-200"
            >
              ← Switch to Pineapple Poker
            </button>
          </div>
        )}
      </div>
      <Toast message={toast} />
    </div>
  );
}
