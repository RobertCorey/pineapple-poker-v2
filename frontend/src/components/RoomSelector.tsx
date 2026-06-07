import { useState } from 'react';
import type { Card } from '@shared/core/types';
import { Suit, Rank } from '@shared/core/types';
import { joinGame } from '../api.ts';
import { trackEvent } from '../firebase.ts';
import { useToast } from '../hooks/useToast.ts';
import { generateRoomCode } from '../utils/roomCode.ts';
import { CardComponent } from './CardComponent.tsx';
import { Toast } from './Toast.tsx';
import { RulesModal } from './RulesModal.tsx';

interface RoomSelectorProps {
  displayName: string;
  setDisplayName: (name: string) => void;
  signIn: () => Promise<void>;
  onRoomJoined: (roomId: string) => void;
}

/** Decorative broadway hand for the hero — shows off the four-color deck. */
const HERO_CARDS: Card[] = [
  { rank: Rank.Ten, suit: Suit.Spades },
  { rank: Rank.Jack, suit: Suit.Clubs },
  { rank: Rank.Queen, suit: Suit.Diamonds },
  { rank: Rank.King, suit: Suit.Hearts },
  { rank: Rank.Ace, suit: Suit.Spades },
];

/** A fanned spread of cards that floats gently above the title. */
function HeroFan() {
  const n = HERO_CARDS.length;
  return (
    <div className="lp-float flex justify-center items-end h-28 mb-2" aria-hidden="true">
      {HERO_CARDS.map((card, i) => {
        const mid = (n - 1) / 2;
        const offset = i - mid;
        const rotate = offset * 9; // degrees
        const lift = Math.abs(offset) * 7; // outer cards sit lower
        return (
          <div
            key={i}
            className="lp-fade-up"
            style={{
              transform: `rotate(${rotate}deg) translateY(${lift}px)`,
              marginLeft: i === 0 ? 0 : -16,
              animationDelay: `${i * 70}ms`,
              filter: 'drop-shadow(0 6px 10px rgba(0,0,0,0.45))',
            }}
          >
            <CardComponent card={card} widthPx={50} />
          </div>
        );
      })}
    </div>
  );
}

export function RoomSelector({ displayName, setDisplayName, signIn, onRoomJoined }: RoomSelectorProps) {
  const [nameInput, setNameInput] = useState(displayName);
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [showRules, setShowRules] = useState(false);
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
    <div className="relative min-h-[100dvh] overflow-hidden bg-gray-950 text-white font-mono flex flex-col items-center justify-center px-4 py-8">
      {/* Poker-felt glow backdrop */}
      <div
        aria-hidden="true"
        className="lp-glow pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(60% 50% at 50% 38%, rgba(21,128,61,0.30) 0%, rgba(21,128,61,0.10) 45%, transparent 75%)',
        }}
      />

      <main className="relative w-full max-w-sm">
        {/* ---- Hero ---- */}
        <div className="text-center mb-6">
          <HeroFan />
          <h1 className="lp-fade-up text-3xl font-black tracking-tight" style={{ animationDelay: '120ms' }}>
            <span aria-hidden="true">🍍 </span>
            <span className="text-green-400">PINEAPPLE</span>{' '}
            <span className="text-white">POKER</span>
          </h1>
          <p className="lp-fade-up text-gray-400 text-sm mt-2 leading-relaxed" style={{ animationDelay: '200ms' }}>
            Open-Face Chinese. Build three winning rows,
            beat the table — live with friends.
          </p>
          <div
            className="lp-fade-up flex items-center justify-center gap-2 text-[11px] text-gray-500 mt-3"
            style={{ animationDelay: '260ms' }}
          >
            <span className="px-2 py-0.5 rounded-full border border-gray-700 bg-gray-900/60">2–8 players</span>
            <span className="px-2 py-0.5 rounded-full border border-gray-700 bg-gray-900/60">real-time</span>
            <span className="px-2 py-0.5 rounded-full border border-gray-700 bg-gray-900/60">no signup</span>
          </div>
        </div>

        {/* ---- Action card ---- */}
        <div
          className="lp-fade-up rounded-xl border border-gray-700/80 bg-gray-900/70 backdrop-blur p-5 shadow-xl shadow-black/40"
          style={{ animationDelay: '320ms' }}
        >
          <label htmlFor="name" className="block text-xs text-gray-500 mb-1">
            Your name
          </label>
          <input
            id="name"
            data-testid="name-input"
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="Enter your name"
            maxLength={20}
            className="w-full px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-600 text-white placeholder-gray-500 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500/40 text-sm"
          />

          <button
            data-testid="create-room-button"
            onClick={handleCreate}
            disabled={!nameInput.trim() || creating}
            className="group mt-3 w-full py-3 rounded-lg bg-green-600 hover:bg-green-500 active:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-bold transition-colors flex items-center justify-center gap-2"
          >
            <span className="text-base leading-none transition-transform group-hover:translate-x-0.5">▶</span>
            {creating ? 'Creating table…' : 'Create a table'}
          </button>

          <div className="flex items-center gap-3 text-gray-600 text-[11px] my-4">
            <div className="flex-1 border-t border-gray-700" />
            or join with a code
            <div className="flex-1 border-t border-gray-700" />
          </div>

          <div className="flex gap-2">
            <input
              data-testid="room-code-input"
              type="text"
              value={roomCodeInput}
              onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              placeholder="ABC123"
              maxLength={6}
              className="flex-1 min-w-0 px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-600 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/40 text-sm uppercase tracking-[0.3em] text-center"
            />
            <button
              data-testid="join-room-button"
              onClick={handleJoin}
              disabled={!nameInput.trim() || !roomCodeInput.trim() || joining}
              className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-bold transition-colors"
            >
              {joining ? '…' : 'Join'}
            </button>
          </div>
        </div>

        {/* ---- Footer ---- */}
        <div
          className="lp-fade-up text-center mt-5"
          style={{ animationDelay: '400ms' }}
        >
          <button
            onClick={() => setShowRules(true)}
            data-testid="how-to-play"
            className="text-xs text-gray-500 hover:text-gray-300 underline underline-offset-2"
          >
            New here? How to play
          </button>
          <p className="text-[10px] text-gray-600 mt-3">Free · plays in your browser · share the link to invite</p>
        </div>
      </main>

      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
      <Toast message={toast} />
    </div>
  );
}
