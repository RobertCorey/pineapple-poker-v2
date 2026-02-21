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
