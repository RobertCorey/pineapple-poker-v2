/**
 * Zod schemas for all Firestore documents.
 *
 * These schemas serve as the runtime validation layer at the Firestore boundary.
 * Every piece of data read from Firestore passes through one of these schemas
 * before entering application code — eliminating the need for `as` casts.
 *
 * The parse functions return the existing TypeScript types from types.ts.
 * The `as` casts inside parse functions are safe: Zod has already validated the
 * data at runtime, so the shape is guaranteed to match.
 */
import { z } from 'zod';
import type {
  PlayerState,
  GameState,
  RoundResult,
  HandDoc,
  DeckDoc,
} from './types';

// ---- Primitive schemas ----

const SuitSchema = z.enum(['c', 'd', 'h', 's']);

const RankSchema = z.number().int().min(2).max(14);

export const CardSchema = z.object({
  suit: SuitSchema,
  rank: RankSchema,
});

export const BoardSchema = z.object({
  top: z.array(CardSchema),
  middle: z.array(CardSchema),
  bottom: z.array(CardSchema),
});

// ---- Game phase ----

const GAME_PHASE_VALUES = [
  'lobby',
  'initial_deal',
  'street_2',
  'street_3',
  'street_4',
  'street_5',
  'scoring',
  'complete',
  'match_complete',
] as const;

const GamePhaseSchema = z.enum(GAME_PHASE_VALUES);

// ---- Player state (what lives inside the game doc players map) ----

export const PlayerStateSchema = z.object({
  uid: z.string(),
  displayName: z.string(),
  board: BoardSchema,
  currentHand: z.array(CardSchema),
  disconnected: z.boolean(),
  fouled: z.boolean(),
  score: z.number(),
});

// ---- Round results ----

export const RoundResultSchema = z.object({
  netScore: z.number(),
  fouled: z.boolean(),
});

// ---- Game state (the games/{roomId} document) ----

export const GameStateSchema = z.object({
  gameId: z.string(),
  phase: GamePhaseSchema,
  players: z.record(z.string(), PlayerStateSchema),
  playerOrder: z.array(z.string()),
  street: z.number().int(),
  round: z.number().int(),
  totalRounds: z.number().int(),
  hostUid: z.string(),
  roundResults: z.record(z.string(), RoundResultSchema).optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
  phaseDeadline: z.number().nullable(),
});

// ---- Subcollection documents ----

export const HandDocSchema = z.object({
  cards: z.array(CardSchema),
});

export const DeckDocSchema = z.object({
  cards: z.array(CardSchema),
});

// ---- Parse functions ----
// Single safe cast point, backed by runtime validation.
// Zod validates the shape; the cast bridges Zod's inferred type (e.g. rank: number)
// to the existing narrow TypeScript type (e.g. rank: Rank).

export function parseGameState(data: unknown): GameState {
  return GameStateSchema.parse(data) as unknown as GameState;
}

export function parsePlayerState(data: unknown): PlayerState {
  return PlayerStateSchema.parse(data) as unknown as PlayerState;
}

export function parseRoundResult(data: unknown): RoundResult {
  return RoundResultSchema.parse(data) as unknown as RoundResult;
}

export function parseHandDoc(data: unknown): HandDoc {
  return HandDocSchema.parse(data) as unknown as HandDoc;
}

export function parseDeckDoc(data: unknown): DeckDoc {
  return DeckDocSchema.parse(data) as unknown as DeckDoc;
}
