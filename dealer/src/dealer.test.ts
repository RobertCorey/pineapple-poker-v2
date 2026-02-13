import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Dealer } from './dealer';

// ---- Mock game-engine ----

const mockMaybeStartRound = vi.fn().mockResolvedValue(true);
const mockScoreRound = vi.fn().mockResolvedValue(undefined);
const mockResetForNextRound = vi.fn().mockResolvedValue(undefined);
const mockHandlePhaseTimeout = vi.fn().mockResolvedValue(undefined);
const mockCheckAndAdvance = vi.fn().mockResolvedValue(undefined);

vi.mock('./game-engine', () => ({
  maybeStartRound: (...args: unknown[]) => mockMaybeStartRound(...args),
  scoreRound: (...args: unknown[]) => mockScoreRound(...args),
  resetForNextRound: (...args: unknown[]) => mockResetForNextRound(...args),
  handlePhaseTimeout: (...args: unknown[]) => mockHandlePhaseTimeout(...args),
  checkAndAdvance: (...args: unknown[]) => mockCheckAndAdvance(...args),
}));

// ---- Fake Firestore (collection listener) ----

type DocChange = {
  type: 'added' | 'modified' | 'removed';
  doc: { id: string; data: () => Record<string, unknown> };
};
type CollectionSnapshotCallback = (snap: { docChanges: () => DocChange[] }) => void;

const ROOM = 'TESTROOM';

function createMockFirestore() {
  let snapshotCb: CollectionSnapshotCallback | null = null;

  const mockDb = {
    collection: (_path: string) => ({
      onSnapshot: (cb: CollectionSnapshotCallback, _errCb: (err: Error) => void) => {
        snapshotCb = cb;
        return () => { snapshotCb = null; };
      },
    }),

    // Test helper: emit a doc change for a room
    emitChange(roomId: string, data: Record<string, unknown> | null, type?: 'added' | 'modified' | 'removed') {
      if (!snapshotCb) throw new Error('No snapshot listener registered');
      if (data === null) {
        snapshotCb({
          docChanges: () => [{
            type: type ?? 'removed',
            doc: { id: roomId, data: () => ({}) },
          }],
        });
      } else {
        snapshotCb({
          docChanges: () => [{
            type: type ?? 'modified',
            doc: { id: roomId, data: () => data },
          }],
        });
      }
    },
  };

  return mockDb;
}

// ---- Helpers ----

function gameState(overrides: Partial<{
  phase: string;
  street: number;
  round: number;
  totalRounds: number;
  playerOrder: string[];
  players: Record<string, unknown>;
  phaseDeadline: number | null;
}> = {}): Record<string, unknown> {
  return {
    phase: 'lobby',
    street: 0,
    round: 0,
    totalRounds: 3,
    playerOrder: [],
    players: {},
    phaseDeadline: null,
    ...overrides,
  };
}

function placementPhaseState(opts: {
  phase?: string;
  allPlaced?: boolean;
  deadline?: number | null;
} = {}) {
  const phase = opts.phase ?? 'initial_deal';
  const deadline = opts.deadline ?? Date.now() + 30_000;
  const hand = opts.allPlaced ? [] : [{ rank: 14, suit: 's' }];
  return gameState({
    phase,
    street: 1,
    round: 1,
    playerOrder: ['p1', 'p2'],
    players: {
      p1: { uid: 'p1', currentHand: hand, fouled: false, board: { top: [], middle: [], bottom: [] } },
      p2: { uid: 'p2', currentHand: [], fouled: false, board: { top: [], middle: [], bottom: [] } },
    },
    phaseDeadline: deadline,
  });
}

// ---- Tests ----

describe('Dealer', () => {
  let db: ReturnType<typeof createMockFirestore>;
  let dealer: Dealer;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    db = createMockFirestore();
    dealer = new Dealer(db as unknown as import('firebase-admin/firestore').Firestore);
    dealer.start();
  });

  afterEach(() => {
    dealer.stop();
    vi.useRealTimers();
  });

  // ---- Timer management (maybeUpdateTimer) ----

  describe('maybeUpdateTimer', () => {
    it('does not reset timer when deadline is unchanged', async () => {
      const deadline = Date.now() + 20_000;
      db.emitChange(ROOM, placementPhaseState({ deadline }));
      await vi.advanceTimersByTimeAsync(0); // flush microtasks

      vi.clearAllMocks();

      // Same deadline, different snapshot (e.g. player placed a card)
      db.emitChange(ROOM, placementPhaseState({ allPlaced: false, deadline }));
      await vi.advanceTimersByTimeAsync(0);

      // Timer should still be alive — advance to deadline
      await vi.advanceTimersByTimeAsync(20_000);
      expect(mockHandlePhaseTimeout).toHaveBeenCalledTimes(1);
    });

    it('resets timer when deadline changes', async () => {
      const deadline1 = Date.now() + 20_000;
      db.emitChange(ROOM, placementPhaseState({ deadline: deadline1 }));
      await vi.advanceTimersByTimeAsync(0);

      vi.clearAllMocks();

      // New deadline (e.g. new street)
      const deadline2 = Date.now() + 15_000;
      db.emitChange(ROOM, placementPhaseState({ phase: 'street_2', deadline: deadline2 }));
      await vi.advanceTimersByTimeAsync(0);

      // Old timer should NOT fire at 20s
      await vi.advanceTimersByTimeAsync(14_999);
      expect(mockHandlePhaseTimeout).not.toHaveBeenCalled();

      // New timer fires at 15s
      await vi.advanceTimersByTimeAsync(1);
      expect(mockHandlePhaseTimeout).toHaveBeenCalledTimes(1);
    });

    it('clears timer when deadline becomes null', async () => {
      db.emitChange(ROOM, placementPhaseState({ deadline: Date.now() + 20_000 }));
      await vi.advanceTimersByTimeAsync(0);

      // Deadline cleared (e.g. phase changed to scoring)
      db.emitChange(ROOM, gameState({ phase: 'scoring', phaseDeadline: null }));
      await vi.advanceTimersByTimeAsync(0);

      vi.clearAllMocks();

      // Original timer should NOT fire
      await vi.advanceTimersByTimeAsync(30_000);
      expect(mockHandlePhaseTimeout).not.toHaveBeenCalled();
    });

    it('sets inter-round timer for complete phase', async () => {
      const deadline = Date.now() + 5_000;
      db.emitChange(ROOM, gameState({ phase: 'complete', phaseDeadline: deadline }));
      await vi.advanceTimersByTimeAsync(0);

      vi.clearAllMocks();

      await vi.advanceTimersByTimeAsync(5_000);
      expect(mockResetForNextRound).toHaveBeenCalledTimes(1);
      expect(mockMaybeStartRound).toHaveBeenCalledTimes(1);
    });

    it('fires immediately when deadline is in the past', async () => {
      const pastDeadline = Date.now() - 1_000;
      db.emitChange(ROOM, placementPhaseState({ deadline: pastDeadline }));
      await vi.advanceTimersByTimeAsync(0);

      expect(mockHandlePhaseTimeout).toHaveBeenCalledTimes(1);
    });
  });

  // ---- Phase reactions (reactToPhase) ----

  describe('reactToPhase', () => {
    it('calls maybeStartRound when lobby with round >= 1 and 2+ players', async () => {
      db.emitChange(ROOM, gameState({
        phase: 'lobby',
        round: 1,
        playerOrder: ['p1', 'p2'],
      }));
      await vi.advanceTimersByTimeAsync(0);

      expect(mockMaybeStartRound).toHaveBeenCalledTimes(1);
      expect(mockMaybeStartRound).toHaveBeenCalledWith(expect.anything(), ROOM);
    });

    it('does nothing when lobby with round === 0 (pre-start)', async () => {
      db.emitChange(ROOM, gameState({
        phase: 'lobby',
        round: 0,
        playerOrder: ['p1', 'p2'],
      }));
      await vi.advanceTimersByTimeAsync(0);

      expect(mockMaybeStartRound).not.toHaveBeenCalled();
    });

    it('does nothing when lobby with <2 players', async () => {
      db.emitChange(ROOM, gameState({
        phase: 'lobby',
        round: 1,
        playerOrder: ['p1'],
      }));
      await vi.advanceTimersByTimeAsync(0);

      expect(mockMaybeStartRound).not.toHaveBeenCalled();
    });

    it('does nothing for match_complete phase', async () => {
      db.emitChange(ROOM, gameState({ phase: 'match_complete' }));
      await vi.advanceTimersByTimeAsync(0);

      expect(mockMaybeStartRound).not.toHaveBeenCalled();
      expect(mockResetForNextRound).not.toHaveBeenCalled();
    });

    it('calls checkAndAdvance when all players placed', async () => {
      db.emitChange(ROOM, placementPhaseState({ allPlaced: true }));
      await vi.advanceTimersByTimeAsync(0);

      expect(mockCheckAndAdvance).toHaveBeenCalledTimes(1);
      expect(mockCheckAndAdvance).toHaveBeenCalledWith(expect.anything(), ROOM);
    });

    it('does not call checkAndAdvance when not all placed', async () => {
      db.emitChange(ROOM, placementPhaseState({ allPlaced: false }));
      await vi.advanceTimersByTimeAsync(0);

      expect(mockCheckAndAdvance).not.toHaveBeenCalled();
    });

    it('calls scoreRound for scoring phase', async () => {
      db.emitChange(ROOM, gameState({ phase: 'scoring' }));
      await vi.advanceTimersByTimeAsync(0);

      expect(mockScoreRound).toHaveBeenCalledTimes(1);
      expect(mockScoreRound).toHaveBeenCalledWith(expect.anything(), ROOM);
    });

    it('does nothing for complete phase (timer handles it)', async () => {
      db.emitChange(ROOM, gameState({ phase: 'complete', phaseDeadline: Date.now() + 5_000 }));
      await vi.advanceTimersByTimeAsync(0);

      expect(mockMaybeStartRound).not.toHaveBeenCalled();
      expect(mockResetForNextRound).not.toHaveBeenCalled();
    });
  });

  // ---- Timeout callbacks ----

  describe('timeout callbacks', () => {
    it('placement timeout calls handlePhaseTimeout then checkAndAdvance with roomId', async () => {
      db.emitChange(ROOM, placementPhaseState({ deadline: Date.now() + 1_000 }));
      await vi.advanceTimersByTimeAsync(1_000);

      expect(mockHandlePhaseTimeout).toHaveBeenCalledTimes(1);
      expect(mockHandlePhaseTimeout).toHaveBeenCalledWith(expect.anything(), ROOM);
      expect(mockCheckAndAdvance).toHaveBeenCalledTimes(1);
      expect(mockCheckAndAdvance).toHaveBeenCalledWith(expect.anything(), ROOM);

      // Verify order: handlePhaseTimeout before checkAndAdvance
      const timeoutOrder = mockHandlePhaseTimeout.mock.invocationCallOrder[0];
      const advanceOrder = mockCheckAndAdvance.mock.invocationCallOrder[0];
      expect(timeoutOrder).toBeLessThan(advanceOrder);
    });

    it('inter-round timeout calls resetForNextRound then maybeStartRound with roomId', async () => {
      db.emitChange(ROOM, gameState({ phase: 'complete', phaseDeadline: Date.now() + 5_000 }));
      await vi.advanceTimersByTimeAsync(5_000);

      expect(mockResetForNextRound).toHaveBeenCalledTimes(1);
      expect(mockResetForNextRound).toHaveBeenCalledWith(expect.anything(), ROOM);
      expect(mockMaybeStartRound).toHaveBeenCalledTimes(1);
      expect(mockMaybeStartRound).toHaveBeenCalledWith(expect.anything(), ROOM);
    });
  });

  // ---- Multi-room ----

  describe('multi-room', () => {
    it('manages independent timers for different rooms', async () => {
      const roomA = 'ROOM_A';
      const roomB = 'ROOM_B';

      // Room A: placement timeout in 10s
      db.emitChange(roomA, placementPhaseState({ deadline: Date.now() + 10_000 }));
      // Room B: placement timeout in 20s
      db.emitChange(roomB, placementPhaseState({ deadline: Date.now() + 20_000 }));
      await vi.advanceTimersByTimeAsync(0);

      vi.clearAllMocks();

      // At 10s, only room A fires
      await vi.advanceTimersByTimeAsync(10_000);
      expect(mockHandlePhaseTimeout).toHaveBeenCalledTimes(1);
      expect(mockHandlePhaseTimeout).toHaveBeenCalledWith(expect.anything(), roomA);

      vi.clearAllMocks();

      // At 20s, room B fires
      await vi.advanceTimersByTimeAsync(10_000);
      expect(mockHandlePhaseTimeout).toHaveBeenCalledTimes(1);
      expect(mockHandlePhaseTimeout).toHaveBeenCalledWith(expect.anything(), roomB);
    });

    it('removes room timer when doc is removed', async () => {
      db.emitChange(ROOM, placementPhaseState({ deadline: Date.now() + 10_000 }));
      await vi.advanceTimersByTimeAsync(0);

      // Room removed
      db.emitChange(ROOM, null, 'removed');
      vi.clearAllMocks();

      // Timer should not fire
      await vi.advanceTimersByTimeAsync(20_000);
      expect(mockHandlePhaseTimeout).not.toHaveBeenCalled();
    });
  });

  // ---- Edge cases ----

  describe('edge cases', () => {
    it('clears all room timers on stop', async () => {
      db.emitChange('ROOM1', placementPhaseState({ deadline: Date.now() + 20_000 }));
      db.emitChange('ROOM2', placementPhaseState({ deadline: Date.now() + 20_000 }));
      await vi.advanceTimersByTimeAsync(0);

      dealer.stop();
      vi.clearAllMocks();

      await vi.advanceTimersByTimeAsync(20_000);
      expect(mockHandlePhaseTimeout).not.toHaveBeenCalled();
    });
  });
});
