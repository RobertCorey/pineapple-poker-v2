import type { Firestore } from 'firebase-admin/firestore';
import type { Card, Board, Row } from '../../shared/core/types';

const AUTH_URL = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key';
const FUNCTIONS_BASE = 'http://127.0.0.1:5001/pineapple-poker-8f3/us-central1';

export class BotPlayer {
  readonly name: string;
  private db: Firestore;
  private roomId: string;
  private _uid = '';
  private idToken = '';
  private unsubscribe: (() => void) | null = null;
  private placing = false;
  private lastPlacedDeadline: number | null = null;
  private currentHand: Card[] = [];

  constructor(name: string, db: Firestore, roomId: string) {
    this.name = name;
    this.db = db;
    this.roomId = roomId;
  }

  get uid(): string {
    return this._uid;
  }

  /** Create anonymous auth via emulator REST API. */
  async init(): Promise<void> {
    const res = await fetch(AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnSecureToken: true }),
    });
    if (!res.ok) throw new Error(`Auth signup failed: ${res.status}`);
    const data = (await res.json()) as { localId: string; idToken: string };
    this._uid = data.localId;
    this.idToken = data.idToken;
  }

  /** Join the room (first bot passes create=true to become host). */
  async join(create = false): Promise<void> {
    await this.callFunction('joinGame', {
      roomId: this.roomId,
      displayName: this.name,
      create,
    });
  }

  /** Start listening to game state and hand subcollection, auto-placing cards. */
  listen(): void {
    const gameRef = this.db.doc(`games/${this.roomId}`);
    const gameUnsub = gameRef.onSnapshot((snap) => {
      if (!snap.exists) return;
      this.onGameUpdate(snap.data()!).catch((err: Error) => {
        console.error(`[${this.name}] Update handler error: ${err.message}`);
      });
    });

    // Listen to hand subcollection for dealt cards
    const handRef = this.db.doc(`games/${this.roomId}/hands/${this._uid}`);
    const handUnsub = handRef.onSnapshot((snap) => {
      if (!snap.exists) {
        this.currentHand = [];
        return;
      }
      const data = snap.data() as { cards?: Card[] };
      this.currentHand = data?.cards ?? [];
    });

    this.unsubscribe = () => {
      gameUnsub();
      handUnsub();
    };
  }

  async startMatch(): Promise<void> {
    await this.callFunction('startMatch', { roomId: this.roomId });
  }

  async playAgain(): Promise<void> {
    await this.callFunction('playAgain', { roomId: this.roomId });
  }

  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  // ── Private ──────────────────────────────────────────────────────────

  private async onGameUpdate(game: Record<string, unknown>): Promise<void> {
    const phase = game.phase as string;
    const players = game.players as Record<string, Record<string, unknown>>;
    const player = players[this._uid];
    if (!player) return;

    // Only act in placement phases
    const placementPhases = ['initial_deal', 'street_2', 'street_3', 'street_4', 'street_5'];
    if (!placementPhases.includes(phase)) return;

    const hand = this.currentHand;
    if (hand.length === 0) return;

    // Guards against double-placing
    const deadline = game.phaseDeadline as number | null;
    if (deadline != null && deadline === this.lastPlacedDeadline) return;
    if (this.placing) return;

    this.placing = true;
    this.lastPlacedDeadline = deadline;

    try {
      const board = player.board as Board;
      const isInitial = phase === 'initial_deal';
      const { placements, discard } = this.decidePlacements(hand, board, isInitial);

      const data: Record<string, unknown> = { roomId: this.roomId, placements };
      if (discard) data.discard = discard;

      await this.callFunction('placeCards', data);
      console.log(`[${this.name}] Placed cards (${phase})`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[${this.name}] Place failed: ${msg}`);
    } finally {
      this.placing = false;
    }
  }

  /**
   * Deterministic placement: fill bottom → middle → top.
   * Initial deal: 2 bottom, 2 middle, 1 top.
   * Streets 2-5: greedy fill, discard 3rd card.
   */
  private decidePlacements(
    hand: Card[],
    board: Board,
    isInitial: boolean,
  ): { placements: { card: Card; row: Row }[]; discard?: Card } {
    if (isInitial) {
      return {
        placements: [
          { card: hand[0], row: 'bottom' },
          { card: hand[1], row: 'bottom' },
          { card: hand[2], row: 'middle' },
          { card: hand[3], row: 'middle' },
          { card: hand[4], row: 'top' },
        ],
      };
    }

    // Streets 2-5: 3 cards dealt, place 2, discard 1
    const rows: { name: Row; space: number }[] = [
      { name: 'bottom', space: 5 - board.bottom.length },
      { name: 'middle', space: 5 - board.middle.length },
      { name: 'top', space: 3 - board.top.length },
    ];

    const placements: { card: Card; row: Row }[] = [];
    let cardIdx = 0;
    for (const { name, space } of rows) {
      if (placements.length >= 2) break;
      const toPlace = Math.min(space, 2 - placements.length);
      for (let i = 0; i < toPlace; i++) {
        placements.push({ card: hand[cardIdx++], row: name });
      }
    }

    return { placements, discard: hand[2] };
  }

  private async callFunction(name: string, data: Record<string, unknown>): Promise<unknown> {
    const res = await fetch(`${FUNCTIONS_BASE}/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.idToken}`,
      },
      body: JSON.stringify({ data }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${name} (${res.status}): ${text}`);
    }
    const result = (await res.json()) as { result: unknown };
    return result.result;
  }
}
