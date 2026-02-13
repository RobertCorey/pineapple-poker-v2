import * as admin from 'firebase-admin';
import { BotPlayer } from './bot-player';

// Room code generation (mirrors frontend/src/utils/roomCode.ts)
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generateRoomCode(): string {
  return Array.from({ length: 6 }, () =>
    CHARS[Math.floor(Math.random() * CHARS.length)],
  ).join('');
}

function parseBotCount(): number {
  const idx = process.argv.indexOf('--bots');
  if (idx !== -1 && process.argv[idx + 1]) {
    const n = parseInt(process.argv[idx + 1], 10);
    if (!isNaN(n) && n >= 1 && n <= 6) return n;
  }
  return 1;
}

async function main(): Promise<void> {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
  admin.initializeApp({ projectId: 'pineapple-poker-8f3' });
  const db = admin.firestore();

  const botCount = parseBotCount();
  const roomId = generateRoomCode();

  console.log(`[Bot] Room: ${roomId}`);
  console.log(`[Bot] Open: http://localhost:5173/?room=${roomId}`);
  console.log();

  // Create and join bots
  const bots: BotPlayer[] = [];
  for (let i = 1; i <= botCount; i++) {
    const bot = new BotPlayer(`Bot_${i}`, db, roomId);
    await bot.init();
    await bot.join(i === 1); // first bot creates room
    console.log(`[Bot] ${bot.name} joined`);
    bots.push(bot);
  }

  // Start bot auto-play listeners
  for (const bot of bots) {
    bot.listen();
  }

  const hostBot = bots[0];
  const botUids = new Set(bots.map((b) => b.uid));

  console.log();
  console.log(`[Bot] Waiting for you to join...`);

  // ── Orchestration: human detection + match lifecycle ─────────────────

  let startPending = false;
  let replayPending = false;

  const gameRef = db.doc(`games/${roomId}`);
  const unsubOrch = gameRef.onSnapshot((snap) => {
    if (!snap.exists) return;
    const game = snap.data()!;
    const players = game.players as Record<string, unknown>;
    const phase = game.phase as string;

    const hasHuman = Object.keys(players).some((uid) => !botUids.has(uid));

    // Auto-start when human joins lobby
    if (hasHuman && phase === 'lobby' && !startPending) {
      startPending = true;
      console.log(`[Bot] Human detected! Starting match in 3s...`);
      setTimeout(async () => {
        try {
          await hostBot.startMatch();
          console.log(`[Bot] Match started!`);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[Bot] Start failed: ${msg}`);
        }
        startPending = false;
      }, 3000);
    }

    // Auto-replay when match completes
    if (phase === 'match_complete' && !replayPending) {
      replayPending = true;
      console.log(`[Bot] Match complete! Replaying in 5s...`);
      setTimeout(async () => {
        try {
          await hostBot.playAgain();
          console.log(`[Bot] New match queued!`);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[Bot] Replay failed: ${msg}`);
        }
        replayPending = false;
      }, 5000);
    }
  });

  // ── Graceful shutdown ────────────────────────────────────────────────

  const shutdown = (): void => {
    console.log('\n[Bot] Shutting down...');
    unsubOrch();
    for (const bot of bots) bot.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[Bot] Fatal error:', err);
  process.exit(1);
});
