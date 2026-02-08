import type { Firestore } from 'firebase-admin/firestore';
import { GamePhase as GP } from '../../shared/types';
import { INTER_ROUND_DELAY_MS } from '../../shared/constants';
import {
  maybeStartRound,
  scoreRound,
  resetForNextRound,
  handlePhaseTimeout,
  checkAndAdvance,
} from './game-engine';

const GAME_DOC = 'games/current';

function isPlacementPhase(phase: string): boolean {
  return (
    phase === GP.InitialDeal ||
    phase === GP.Street2 ||
    phase === GP.Street3 ||
    phase === GP.Street4 ||
    phase === GP.Street5
  );
}

export class Dealer {
  private db: Firestore;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private processing = false;
  private unsubscribe: (() => void) | null = null;

  constructor(db: Firestore) {
    this.db = db;
  }

  start(): void {
    console.log('[Dealer] Starting — listening to games/current');
    this.unsubscribe = this.db.doc(GAME_DOC).onSnapshot(
      (snap) => {
        this.onGameSnapshot(snap).catch((err) => {
          console.error('[Dealer] Error handling snapshot:', err);
        });
      },
      (err) => {
        console.error('[Dealer] Snapshot listener error:', err);
      },
    );
  }

  stop(): void {
    console.log('[Dealer] Stopping');
    this.clearTimer();
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private pendingSnapshot: FirebaseFirestore.DocumentSnapshot | null = null;

  private async onGameSnapshot(snap: FirebaseFirestore.DocumentSnapshot): Promise<void> {
    // Clear any pending timer — we'll re-evaluate from scratch
    this.clearTimer();

    if (!snap.exists) {
      console.log('[Dealer] No game document');
      return;
    }

    // Re-entrancy guard: if processing, stash the snapshot for later
    if (this.processing) {
      this.pendingSnapshot = snap;
      return;
    }

    const game = snap.data()!;
    const playerOrder = game.playerOrder as string[];

    console.log(`[Dealer] Snapshot: phase=${game.phase}, street=${game.street}, players=${playerOrder.length}`);

    await this.evaluate(game);
  }

  private async evaluate(game: Record<string, unknown>): Promise<void> {
    const phase = game.phase as string;
    const playerOrder = game.playerOrder as string[];
    const phaseDeadline = game.phaseDeadline as number | null;

    try {
      this.processing = true;

      if (phase === GP.Waiting) {
        if (playerOrder.length >= 2) {
          console.log('[Dealer] 2+ players in Waiting — starting round');
          await maybeStartRound(this.db);
        } else {
          console.log('[Dealer] Waiting — not enough players');
        }
        return;
      }

      if (isPlacementPhase(phase)) {
        // Check if all active players have placed
        const players = game.players as Record<string, { currentHand: { length: number }; fouled: boolean }>;
        const allPlaced = playerOrder.every((uid) => {
          const p = players[uid];
          return !p || p.fouled || p.currentHand.length === 0;
        });

        if (allPlaced) {
          console.log(`[Dealer] All placed in ${phase} — advancing`);
          await checkAndAdvance(this.db);
          return;
        }

        // Not all placed — set timer for deadline
        if (phaseDeadline) {
          const delay = Math.max(0, phaseDeadline - Date.now());
          console.log(`[Dealer] Waiting for placements — timeout in ${Math.round(delay / 1000)}s`);
          this.timer = setTimeout(() => {
            this.onTimeout().catch((err) => {
              console.error('[Dealer] Timeout handler error:', err);
            });
          }, delay);
        }
        return;
      }

      if (phase === GP.Scoring) {
        console.log('[Dealer] Scoring round');
        await scoreRound(this.db);
        return;
      }

      if (phase === GP.Complete) {
        const delay = INTER_ROUND_DELAY_MS;
        console.log(`[Dealer] Complete — next round in ${delay / 1000}s`);
        this.timer = setTimeout(() => {
          this.onInterRoundTimer().catch((err) => {
            console.error('[Dealer] Inter-round timer error:', err);
          });
        }, delay);
        return;
      }
    } finally {
      this.processing = false;
      await this.drainPending();
    }
  }

  private async drainPending(): Promise<void> {
    while (this.pendingSnapshot) {
      const snap = this.pendingSnapshot;
      this.pendingSnapshot = null;
      if (!snap.exists) return;
      const game = snap.data()!;
      const playerOrder = game.playerOrder as string[];
      console.log(`[Dealer] Deferred snapshot: phase=${game.phase}, street=${game.street}, players=${playerOrder.length}`);
      await this.evaluate(game);
    }
  }

  private async onTimeout(): Promise<void> {
    console.log('[Dealer] Timeout fired — auto-fouling');
    this.processing = true;
    try {
      await handlePhaseTimeout(this.db);
      // After fouling, checkAndAdvance will be triggered by the next snapshot
      // But we call it directly to avoid waiting for snapshot round-trip
      await checkAndAdvance(this.db);
    } finally {
      this.processing = false;
      await this.drainPending();
    }
  }

  private async onInterRoundTimer(): Promise<void> {
    console.log('[Dealer] Inter-round timer fired — resetting for next round');
    this.processing = true;
    try {
      await resetForNextRound(this.db);
      await maybeStartRound(this.db);
    } finally {
      this.processing = false;
      await this.drainPending();
    }
  }
}
