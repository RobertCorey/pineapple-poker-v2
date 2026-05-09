import type { Firestore } from 'firebase-admin/firestore';
import type { KitesGameState } from '../../../shared/kites/types';
import { KitesPhase } from '../../../shared/kites/types';
import { parseKitesGameState } from '../../../shared/kites/schemas';
import { nextTimerToExpire, cardsRemaining } from '../../../shared/kites/game-logic';

interface RoomState {
  // Timestamp the timer is currently armed for.
  armedExpiresAt: number | null;
  timer: ReturnType<typeof setTimeout> | null;
}

/**
 * Listens to the kitesGames collection and arms a single setTimeout per room
 * for the soonest-expiring sand timer. When it fires, the dealer transitions
 * the room to Lost.
 */
export class KitesDealer {
  private db: Firestore;
  private unsubscribe: (() => void) | null = null;
  private rooms: Map<string, RoomState> = new Map();

  constructor(db: Firestore) {
    this.db = db;
  }

  get roomCount(): number { return this.rooms.size; }

  start(): void {
    console.log('[KitesDealer] Starting — listening to kitesGames collection');
    this.unsubscribe = this.db.collection('kitesGames').onSnapshot(
      (snap) => {
        for (const change of snap.docChanges()) {
          const roomId = change.doc.id;
          if (change.type === 'removed') {
            this.removeRoom(roomId);
          } else {
            this.onSnapshot(roomId, change.doc);
          }
        }
      },
      (err) => console.error('[KitesDealer] Snapshot listener error:', err),
    );
  }

  stop(): void {
    console.log('[KitesDealer] Stopping');
    for (const [roomId] of this.rooms) this.removeRoom(roomId);
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  private removeRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (room?.timer) clearTimeout(room.timer);
    this.rooms.delete(roomId);
  }

  private getOrCreateRoom(roomId: string): RoomState {
    let room = this.rooms.get(roomId);
    if (!room) {
      room = { armedExpiresAt: null, timer: null };
      this.rooms.set(roomId, room);
    }
    return room;
  }

  private onSnapshot(roomId: string, doc: FirebaseFirestore.QueryDocumentSnapshot): void {
    let game: KitesGameState;
    try {
      game = parseKitesGameState(doc.data());
    } catch (err) {
      console.error(`[KitesDealer] [${roomId}] Skipping unparseable doc:`, err);
      return;
    }

    if (game.phase !== KitesPhase.Playing) {
      this.disarmTimer(roomId);
      return;
    }

    const next = nextTimerToExpire(game);
    if (!next) {
      this.disarmTimer(roomId);
      return;
    }
    this.armTimer(roomId, next.expiresAt);
  }

  private disarmTimer(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    if (room.timer) {
      clearTimeout(room.timer);
      room.timer = null;
    }
    room.armedExpiresAt = null;
  }

  private armTimer(roomId: string, expiresAt: number): void {
    const room = this.getOrCreateRoom(roomId);
    if (room.armedExpiresAt === expiresAt) return;
    if (room.timer) {
      clearTimeout(room.timer);
      room.timer = null;
    }
    room.armedExpiresAt = expiresAt;
    const delay = Math.max(0, expiresAt - Date.now());
    console.log(`[KitesDealer] [${roomId}] Armed timer for ${Math.round(delay / 1000)}s`);
    room.timer = setTimeout(() => {
      room.timer = null;
      room.armedExpiresAt = null;
      this.onTimerExpired(roomId).catch((err) =>
        console.error(`[KitesDealer] [${roomId}] expiry handler error:`, err),
      );
    }, delay);
  }

  private async onTimerExpired(roomId: string): Promise<void> {
    const ref = this.db.doc(`kitesGames/${roomId}`);
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const game = parseKitesGameState(snap.data());
      if (game.phase !== KitesPhase.Playing) return;

      const now = Date.now();
      const next = nextTimerToExpire(game);
      if (!next) return;
      // Re-check: has the soonest-expiring timer actually expired now?
      // (A flip we missed could have pushed it later.)
      if (next.expiresAt > now) return;

      const finalScore = cardsRemaining(game);
      tx.update(ref, {
        phase: KitesPhase.Lost,
        endedAt: now,
        endReason: 'timer_expired',
        expiredTimerColor: next.timer.color,
        finalScore,
        updatedAt: now,
      });
      console.log(`[KitesDealer] [${roomId}] ${next.timer.color} timer expired — game lost (score=${finalScore})`);
    });
  }
}
