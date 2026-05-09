import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { gameDoc, handDoc, deckDoc } from '../../shared/core/firestore-paths';
import { parseGameState } from '../../shared/core/schemas';
import { removePlayer } from './player-actions';

const ADMIN_EMAIL = 'robertbcorey@gmail.com';

const db = () => admin.firestore();

function requireAdmin(request: { auth?: { token?: { email?: string } } }) {
  const email = request.auth?.token?.email;
  if (!email || email !== ADMIN_EMAIL) {
    throw new HttpsError('permission-denied', 'Admin access required.');
  }
}

const AdminDeleteRoomSchema = z.object({
  roomId: z.string().min(1),
});

const AdminKickPlayerSchema = z.object({
  roomId: z.string().min(1),
  targetUid: z.string().min(1),
});

export const adminDeleteRoom = onCall({ maxInstances: 10 }, async (request) => {
  requireAdmin(request);

  const parsed = AdminDeleteRoomSchema.safeParse(request.data);
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Must provide roomId.');
  }
  const { roomId } = parsed.data;

  const gameRef = db().doc(gameDoc(roomId));
  const snap = await gameRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Room not found.');
  }

  const batch = db().batch();

  // Delete subcollection docs for all players
  try {
    const game = parseGameState(snap.data());
    for (const uid of Object.keys(game.players)) {
      batch.delete(db().doc(handDoc(uid, roomId)));
      batch.delete(db().doc(deckDoc(uid, roomId)));
    }
  } catch {
    // If game doc is malformed, just delete the game doc itself
  }

  batch.delete(gameRef);
  await batch.commit();

  return { success: true };
});

export const adminKillAllGames = onCall({ maxInstances: 10 }, async (request) => {
  requireAdmin(request);

  const allGames = await db().collection('games').get();
  if (allGames.empty) return { deleted: 0 };

  const writer = db().bulkWriter();
  let count = 0;

  for (const gameSnap of allGames.docs) {
    const roomId = gameSnap.id;

    const [hands, decks] = await Promise.all([
      db().collection(`games/${roomId}/hands`).listDocuments(),
      db().collection(`games/${roomId}/decks`).listDocuments(),
    ]);

    for (const doc of hands) writer.delete(doc);
    for (const doc of decks) writer.delete(doc);
    writer.delete(gameSnap.ref);
    count++;
  }

  await writer.close();
  return { deleted: count };
});

export const adminKickPlayer = onCall({ maxInstances: 10 }, async (request) => {
  requireAdmin(request);

  const parsed = AdminKickPlayerSchema.safeParse(request.data);
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Must provide roomId and targetUid.');
  }
  const { roomId, targetUid } = parsed.data;

  await removePlayer(targetUid, roomId);

  return { success: true };
});

// ---- debugRecentGames ----
//
// Returns the N most recent games for postmortem debugging. Game documents
// are already publicly readable per firestore.rules so no auth gate; this
// just provides a convenient ordered slice. Defaults to last 5; max 25.

const DebugRecentGamesSchema = z.object({
  limit: z.number().int().min(1).max(25).optional(),
  runModeOnly: z.boolean().optional(),
});

export const debugRecentGames = onCall({ maxInstances: 5 }, async (request) => {
  const parsed = DebugRecentGamesSchema.safeParse(request.data ?? {});
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Invalid request.');
  }
  const limit = parsed.data.limit ?? 5;
  const runModeOnly = parsed.data.runModeOnly ?? false;

  const snap = await db()
    .collection('games')
    .orderBy('updatedAt', 'desc')
    .limit(limit * 3) // overfetch when filtering
    .get();

  const games: unknown[] = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    if (runModeOnly && !data.runMode) continue;
    games.push({ roomId: doc.id, ...data });
    if (games.length >= limit) break;
  }

  return { games };
});
