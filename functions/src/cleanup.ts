import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export const pruneOldGames = onSchedule({ schedule: 'every 24 hours', maxInstances: 1 }, async () => {
  const db = admin.firestore();
  const cutoff = Date.now() - SEVEN_DAYS_MS;

  const staleGames = await db
    .collection('games')
    .where('updatedAt', '<', cutoff)
    .get();

  if (staleGames.empty) {
    logger.info('pruneOldGames: no stale games found');
    return;
  }

  const writer = db.bulkWriter();
  let count = 0;

  for (const gameDoc of staleGames.docs) {
    const roomId = gameDoc.id;

    const [hands, decks] = await Promise.all([
      db.collection(`games/${roomId}/hands`).listDocuments(),
      db.collection(`games/${roomId}/decks`).listDocuments(),
    ]);

    for (const doc of hands) writer.delete(doc);
    for (const doc of decks) writer.delete(doc);
    writer.delete(gameDoc.ref);
    count++;
  }

  await writer.close();
  logger.info(`pruneOldGames: deleted ${count} stale games`);
});
