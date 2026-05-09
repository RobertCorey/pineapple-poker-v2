import { z } from 'zod';
import type {
  KitesCard,
  KitesGameState,
  KitesHandDoc,
  KitesDeckDoc,
} from './types';

const KitesCardColorSchema = z.enum(['red', 'orange', 'yellow', 'blue', 'purple']);
const KitesAnyColorSchema = z.enum(['red', 'orange', 'yellow', 'white', 'blue', 'purple']);

export const KitesCardSchema = z.object({
  id: z.string(),
  symbols: z.array(KitesCardColorSchema).min(1).max(2),
});

const KitesTimerSchema = z.object({
  color: KitesAnyColorSchema,
  durationMs: z.number().int().positive(),
  flippedAt: z.number().nullable(),
});

const KitesPlayerSchema = z.object({
  uid: z.string(),
  displayName: z.string(),
  handSize: z.number().int().min(0),
  disconnected: z.boolean(),
  isBot: z.boolean().optional(),
});

const KitesPlayedCardSchema = z.object({
  id: z.string(),
  uid: z.string(),
  symbols: z.array(KitesCardColorSchema).min(1).max(2),
  seq: z.number().int().min(0),
});

export const KitesGameStateSchema = z.object({
  gameId: z.string(),
  gameType: z.literal('kites'),
  phase: z.enum(['lobby', 'playing', 'won', 'lost']),
  hostUid: z.string(),
  players: z.record(z.string(), KitesPlayerSchema),
  playerOrder: z.array(z.string()),
  timers: z.array(KitesTimerSchema),
  drawPileSize: z.number().int().min(0),
  recentPlays: z.array(KitesPlayedCardSchema),
  totalPlayed: z.number().int().min(0),
  endedAt: z.number().nullable(),
  finalScore: z.number().nullable(),
  endReason: z.enum(['win', 'timer_expired']).nullable(),
  expiredTimerColor: KitesAnyColorSchema.nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const KitesHandDocSchema = z.object({
  cards: z.array(KitesCardSchema),
});

export const KitesDeckDocSchema = z.object({
  cards: z.array(KitesCardSchema),
});

export function parseKitesGameState(data: unknown): KitesGameState {
  return KitesGameStateSchema.parse(data) as unknown as KitesGameState;
}

export function parseKitesHandDoc(data: unknown): KitesHandDoc {
  return KitesHandDocSchema.parse(data) as unknown as KitesHandDoc;
}

export function parseKitesDeckDoc(data: unknown): KitesDeckDoc {
  return KitesDeckDocSchema.parse(data) as unknown as KitesDeckDoc;
}

export function parseKitesCard(data: unknown): KitesCard {
  return KitesCardSchema.parse(data) as unknown as KitesCard;
}
