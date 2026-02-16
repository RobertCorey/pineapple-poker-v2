import { useState } from 'react';
import { joinGame } from '../api.ts';
import { trackEvent } from '../firebase.ts';
import { useToast } from '../hooks/useToast.ts';
import { generateRoomCode } from '../utils/roomCode.ts';
import { Toast } from './Toast.tsx';

interface RoomSelectorProps {
  displayName: string;
  setDisplayName: (name: string) => void;
  signIn: () => Promise<void>;
  onRoomJoined: (roomId: string) => void;
}

export function RoomSelector({ displayName, setDisplayName, signIn, onRoomJoined }: RoomSelectorProps) {
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
      await joinGame({ roomId, displayName: nameInput.trim(), create: true });
      trackEvent('create_room', { roomId });
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
      await joinGame({ roomId, displayName: nameInput.trim() });
      trackEvent('join_room', { roomId });
      onRoomJoined(roomId);
    } catch (err) {
      console.error('Failed to join room:', err);
      showToast('Room not found or failed to join');
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center font-mono">
      <div className="border border-gray-700 p-6 max-w-sm w-full mx-4">
        <h1 className="text-xl font-bold text-center mb-1">Pineapple Poker</h1>
        <p className="text-gray-500 text-center text-xs mb-4">Open Face Chinese</p>

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
              placeholder="Enter your name"
              maxLength={20}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-600 text-white placeholder-gray-500 focus:outline-none focus:border-green-500 text-sm"
            />
          </div>

          <button
            data-testid="create-room-button"
            onClick={handleCreate}
            disabled={!nameInput.trim() || creating}
            className="w-full py-2 bg-green-700 hover:bg-green-600 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-bold"
          >
            {creating ? 'Creating...' : 'Create Room'}
          </button>

          <div className="flex items-center gap-2 text-gray-600 text-xs">
            <div className="flex-1 border-t border-gray-700" />
            or join
            <div className="flex-1 border-t border-gray-700" />
          </div>

          <div className="flex gap-2">
            <input
              data-testid="room-code-input"
              type="text"
              value={roomCodeInput}
              onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              placeholder="Room code"
              maxLength={6}
              className="flex-1 px-3 py-2 bg-gray-800 border border-gray-600 text-white placeholder-gray-500 focus:outline-none focus:border-green-500 text-sm uppercase tracking-widest"
            />
            <button
              data-testid="join-room-button"
              onClick={handleJoin}
              disabled={!nameInput.trim() || !roomCodeInput.trim() || joining}
              className="px-4 py-2 bg-blue-700 hover:bg-blue-600 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-bold"
            >
              {joining ? '...' : 'Join'}
            </button>
          </div>
        </div>
      </div>
      <Toast message={toast} />
    </div>
  );
}
