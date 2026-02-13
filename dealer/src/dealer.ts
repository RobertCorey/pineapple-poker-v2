import type { Firestore } from 'firebase-admin/firestore';
import { GamePhase as GP } from '../../shared/core/types';
import { GAME_DOC } from '../../shared/core/firestore-paths';
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

export class Dealer {
  private db: Firestore;
  private unsubscribe: (() => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private currentDeadline: number | null = null;

  constructor(db: Firestore) {
    this.db = db;
  }

  start(): void {
    console.log('[Dealer] Starting — listening to games/current');
    this.unsubscribe = this.db.doc(GAME_DOC).onSnapshot(
      (snap) => this.onGameSnapshot(snap),
      (err) => console.error('[Dealer] Snapshot listener error:', err),
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
    this.currentDeadline = null;
  }

  /**
   * Called on every Firestore snapshot. Two independent concerns:
   * 1. Update timer if deadline changed
   * 2. React to current phase (fire-and-forget)
   *
   * No processing guard needed — game-engine functions are transactional
   * and idempotent, so concurrent/redundant calls are safe.
   */
  private onGameSnapshot(snap: FirebaseFirestore.DocumentSnapshot): void {
    if (!snap.exists) {
      console.log('[Dealer] No game document');
      this.clearTimer();
      return;
    }

    const game = snap.data()!;
    const phase = game.phase as string;
    const phaseDeadline = (game.phaseDeadline as number | null) ?? null;
    const playerOrder = game.playerOrder as string[];

    console.log(`[Dealer] Snapshot: phase=${phase}, street=${game.street}, players=${playerOrder.length}`);

    this.maybeUpdateTimer(phaseDeadline, phase);

    this.reactToPhase(game).catch((err) => {
      console.error('[Dealer] Error reacting to phase:', err);
    });
  }

  /**
   * Only clear/reset the timer when the deadline actually changes.
   * When a player places cards, the snapshot fires but phaseDeadline
   * is unchanged — so the timer stays alive.
   */
  private maybeUpdateTimer(newDeadline: number | null, phase: string): void {
    if (newDeadline === this.currentDeadline) return;

    // Deadline changed — clear old timer
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.currentDeadline = newDeadline;

    if (newDeadline === null) return;

    const delay = Math.max(0, newDeadline - Date.now());

    if (isPlacementPhase(phase)) {
      console.log(`[Dealer] Timer set: placement timeout in ${Math.round(delay / 1000)}s`);
      this.timer = setTimeout(() => {
        this.currentDeadline = null;
        this.timer = null;
        this.onPlacementTimeout();
      }, delay);
    } else if (phase === GP.Complete) {
      console.log(`[Dealer] Timer set: next round in ${Math.round(delay / 1000)}s`);
      this.timer = setTimeout(() => {
        this.currentDeadline = null;
        this.timer = null;
        this.onInterRoundTimeout();
      }, delay);
    }
  }

  /**
   * Look at the current phase and take action if needed.
   * All game-engine calls are transactional and idempotent —
   * redundant or concurrent calls are harmless (they noop).
   */
  private async reactToPhase(game: Record<string, unknown>): Promise<void> {
    const phase = game.phase as string;
    const playerOrder = game.playerOrder as string[];

    if (phase === GP.Waiting) {
      if (playerOrder.length >= 2) {
        console.log('[Dealer] 2+ players in Waiting — starting round');
        await maybeStartRound(this.db);
      }
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
        console.log(`[Dealer] All placed in ${phase} — advancing`);
        await checkAndAdvance(this.db);
      }
      return;
    }

    if (phase === GP.Scoring) {
      console.log('[Dealer] Scoring round');
      await scoreRound(this.db);
      return;
    }

    // GP.Complete: timer handles inter-round delay
  }

  private onPlacementTimeout(): void {
    console.log('[Dealer] Placement timeout fired — auto-fouling');
    (async () => {
      await handlePhaseTimeout(this.db);
      await checkAndAdvance(this.db);
    })().catch((err) => {
      console.error('[Dealer] Timeout handler error:', err);
    });
  }

  private onInterRoundTimeout(): void {
    console.log('[Dealer] Inter-round timer fired — resetting');
    (async () => {
      await resetForNextRound(this.db);
      await maybeStartRound(this.db);
    })().catch((err) => {
      console.error('[Dealer] Inter-round handler error:', err);
    });
  }
}
