import type { Firestore } from 'firebase-admin/firestore';
import { GamePhase as GP } from '../../shared/core/types';
import {
  maybeStartRound,
  scoreRound,
  resetForNextRound,
  handlePhaseTimeout,
  checkAndAdvance,
} from './game-engine';

function isPlacementPhase(phase: string): boolean {
  return (
    phase === GP.InitialDeal ||
    phase === GP.Street2 ||
    phase === GP.Street3 ||
    phase === GP.Street4 ||
    phase === GP.Street5
  );
}

interface RoomState {
  timer: ReturnType<typeof setTimeout> | null;
  currentDeadline: number | null;
}

export class Dealer {
  private db: Firestore;
  private unsubscribe: (() => void) | null = null;
  private rooms: Map<string, RoomState> = new Map();

  constructor(db: Firestore) {
    this.db = db;
  }

  get roomCount(): number { return this.rooms.size; }

  start(): void {
    console.log('[Dealer] Starting — listening to games collection');
    this.unsubscribe = this.db.collection('games').onSnapshot(
      (snap) => {
        for (const change of snap.docChanges()) {
          const roomId = change.doc.id;
          if (change.type === 'removed') {
            this.removeRoom(roomId);
          } else {
            this.onGameSnapshot(roomId, change.doc);
          }
        }
      },
      (err) => console.error('[Dealer] Snapshot listener error:', err),
    );
  }

  stop(): void {
    console.log('[Dealer] Stopping');
    for (const [roomId] of this.rooms) {
      this.removeRoom(roomId);
    }
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  private removeRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (room?.timer) {
      clearTimeout(room.timer);
    }
    this.rooms.delete(roomId);
    console.log(`[Dealer] Room ${roomId} removed`);
  }

  private getOrCreateRoom(roomId: string): RoomState {
    let room = this.rooms.get(roomId);
    if (!room) {
      room = { timer: null, currentDeadline: null };
      this.rooms.set(roomId, room);
    }
    return room;
  }

  private onGameSnapshot(roomId: string, doc: FirebaseFirestore.QueryDocumentSnapshot): void {
    const game = doc.data();
    const phase = game.phase as string;
    const phaseDeadline = (game.phaseDeadline as number | null) ?? null;
    const playerOrder = game.playerOrder as string[];

    console.log(`[Dealer] [${roomId}] Snapshot: phase=${phase}, street=${game.street}, players=${playerOrder.length}`);

    this.maybeUpdateTimer(roomId, phaseDeadline, phase);

    this.reactToPhase(roomId, game).catch((err) => {
      console.error(`[Dealer] [${roomId}] Error reacting to phase:`, err);
    });
  }

  private maybeUpdateTimer(roomId: string, newDeadline: number | null, phase: string): void {
    const room = this.getOrCreateRoom(roomId);

    if (newDeadline === room.currentDeadline) return;

    // Deadline changed — clear old timer
    if (room.timer) {
      clearTimeout(room.timer);
      room.timer = null;
    }
    room.currentDeadline = newDeadline;

    if (newDeadline === null) return;

    const delay = Math.max(0, newDeadline - Date.now());

    if (isPlacementPhase(phase)) {
      console.log(`[Dealer] [${roomId}] Timer set: placement timeout in ${Math.round(delay / 1000)}s`);
      room.timer = setTimeout(() => {
        room.currentDeadline = null;
        room.timer = null;
        this.onPlacementTimeout(roomId);
      }, delay);
    } else if (phase === GP.Complete) {
      console.log(`[Dealer] [${roomId}] Timer set: next round in ${Math.round(delay / 1000)}s`);
      room.timer = setTimeout(() => {
        room.currentDeadline = null;
        room.timer = null;
        this.onInterRoundTimeout(roomId);
      }, delay);
    }
  }

  private async reactToPhase(roomId: string, game: Record<string, unknown>): Promise<void> {
    const phase = game.phase as string;
    const playerOrder = game.playerOrder as string[];

    if (phase === GP.Lobby) {
      const round = game.round as number;
      if (round >= 1 && playerOrder.length >= 2) {
        console.log(`[Dealer] [${roomId}] Lobby with round >= 1 and 2+ players — starting round`);
        await maybeStartRound(this.db, roomId);
      }
      return;
    }

    if (phase === GP.MatchComplete) {
      // Wait for host to click "Play Again"
      return;
    }

    if (isPlacementPhase(phase)) {
      const players = game.players as Record<
        string,
        { currentHand: { length: number }; fouled: boolean }
      >;
      const allPlaced = playerOrder.every((uid) => {
        const p = players[uid];
        return !p || p.fouled || p.currentHand.length === 0;
      });
      if (allPlaced) {
        console.log(`[Dealer] [${roomId}] All placed in ${phase} — advancing`);
        await checkAndAdvance(this.db, roomId);
      }
      return;
    }

    if (phase === GP.Scoring) {
      console.log(`[Dealer] [${roomId}] Scoring round`);
      await scoreRound(this.db, roomId);
      return;
    }

    // GP.Complete: timer handles inter-round delay
  }

  private onPlacementTimeout(roomId: string): void {
    console.log(`[Dealer] [${roomId}] Placement timeout fired — auto-fouling`);
    (async () => {
      await handlePhaseTimeout(this.db, roomId);
      await checkAndAdvance(this.db, roomId);
    })().catch((err) => {
      console.error(`[Dealer] [${roomId}] Timeout handler error:`, err);
    });
  }

  private onInterRoundTimeout(roomId: string): void {
    console.log(`[Dealer] [${roomId}] Inter-round timer fired — resetting`);
    (async () => {
      await resetForNextRound(this.db, roomId);
      await maybeStartRound(this.db, roomId);
    })().catch((err) => {
      console.error(`[Dealer] [${roomId}] Inter-round handler error:`, err);
    });
  }
}
