// Kites: cooperative real-time game.
// Players play kite cards from their hands; each card flips one or more sand
// timers. The team loses if any timer runs out, wins when all cards are played.

export const KitesColor = {
  Red: 'red',
  Orange: 'orange',
  Yellow: 'yellow',
  White: 'white',
  Blue: 'blue',
  Purple: 'purple',
} as const;
export type KitesColor = (typeof KitesColor)[keyof typeof KitesColor];

/** The 5 colors that appear on Kite cards. White is timer-only. */
export type KitesCardColor = Exclude<KitesColor, 'white'>;

export const KitesPhase = {
  Lobby: 'lobby',
  Playing: 'playing',
  Won: 'won',
  Lost: 'lost',
} as const;
export type KitesPhase = (typeof KitesPhase)[keyof typeof KitesPhase];

/** A single kite card. Cards have 1 or 2 colored symbols. */
export interface KitesCard {
  /** Unique id within the deck — used for stable references. */
  id: string;
  /** 1 = single-symbol (can also flip white timer); 2 = double-symbol. */
  symbols: KitesCardColor[];
}

/** A sand timer. Server-authoritative; clients compute remaining time. */
export interface KitesTimer {
  color: KitesColor;
  /** Total sand duration in ms. */
  durationMs: number;
  /**
   * Wall-clock timestamp when the timer was last flipped (sand reset to full).
   * Remaining time = durationMs - (now - flippedAt).
   * `null` means the timer is on its side (paused / not yet started).
   */
  flippedAt: number | null;
}

export interface KitesPlayer {
  uid: string;
  displayName: string;
  /** Cards currently in this player's hand. Subcollection holds the cards. */
  handSize: number;
  disconnected: boolean;
  isBot?: boolean;
}

/** A card played to the table (face-up in front of a player). */
export interface KitesPlayedCard {
  id: string;
  uid: string;
  symbols: KitesCardColor[];
  /** Sequence number — strictly increasing to determine display order. */
  seq: number;
}

export interface KitesGameState {
  gameId: string;
  gameType: 'kites';
  phase: KitesPhase;
  hostUid: string;
  players: Record<string, KitesPlayer>;
  /** Order of active players. Late joiners (post-start) are not added. */
  playerOrder: string[];
  timers: KitesTimer[];
  drawPileSize: number;
  /** Most-recent N played cards (capped to keep doc size sane). */
  recentPlays: KitesPlayedCard[];
  /** Total cards played so far this game (used for seq + UI stats). */
  totalPlayed: number;
  /** Set when phase enters Won/Lost. */
  endedAt: number | null;
  /** Final score (lower is better). Cards remaining when game ends. */
  finalScore: number | null;
  /** Reason for ending in lost state. */
  endReason: 'win' | 'timer_expired' | null;
  /** Color of the timer that ran out, when endReason === 'timer_expired'. */
  expiredTimerColor: KitesColor | null;
  createdAt: number;
  updatedAt: number;
}

/** Subcollection: kitesGames/{roomId}/hands/{uid} */
export interface KitesHandDoc {
  cards: KitesCard[];
}

/** Subcollection (server-only): kitesGames/{roomId}/deck/main */
export interface KitesDeckDoc {
  cards: KitesCard[];
}
