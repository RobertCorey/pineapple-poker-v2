import * as admin from 'firebase-admin';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { Dealer } from './dealer';
import { DEALER_HEALTH_PORT } from '../../shared/core/constants';

// ── Lockfile self-guard ─────────────────────────────────────────────────────

const LOCK_FILE = path.resolve(__dirname, '../../.dealer.lock');

function killOldDealer(): void {
  if (!fs.existsSync(LOCK_FILE)) return;

  const oldPid = parseInt(fs.readFileSync(LOCK_FILE, 'utf-8').trim(), 10);
  if (isNaN(oldPid) || oldPid === process.pid) return;

  try {
    process.kill(oldPid, 0); // Check if alive
  } catch {
    // Process doesn't exist — stale lockfile
    return;
  }

  console.log(`[Dealer] Killing previous dealer (PID ${oldPid})...`);
  try {
    process.kill(oldPid, 'SIGTERM');
  } catch {
    return;
  }

  // Wait up to 2s for graceful shutdown, then SIGKILL
  const start = Date.now();
  while (Date.now() - start < 2000) {
    try {
      process.kill(oldPid, 0);
    } catch {
      console.log(`[Dealer] Previous dealer stopped`);
      return;
    }
    // Busy-wait in small increments (synchronous — this is startup code)
    const waitUntil = Date.now() + 100;
    while (Date.now() < waitUntil) { /* spin */ }
  }

  try {
    process.kill(oldPid, 'SIGKILL');
    console.log(`[Dealer] Force-killed previous dealer (PID ${oldPid})`);
  } catch {
    // Already gone
  }
}

function writeLockfile(): void {
  fs.writeFileSync(LOCK_FILE, String(process.pid), 'utf-8');
}

function removeLockfile(): void {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const content = fs.readFileSync(LOCK_FILE, 'utf-8').trim();
      // Only remove if it's our PID (avoid race with replacement)
      if (content === String(process.pid)) {
        fs.unlinkSync(LOCK_FILE);
      }
    }
  } catch {
    // Best effort
  }
}

// ── Start ───────────────────────────────────────────────────────────────────

killOldDealer();
writeLockfile();

// Point at Firestore emulator
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';

admin.initializeApp({ projectId: 'pineapple-poker-8f3' });

const db = admin.firestore();
const dealer = new Dealer(db);

// ── Health HTTP server ──────────────────────────────────────────────────────

const startTime = Date.now();

const healthServer = http.createServer((req, res) => {
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      pid: process.pid,
      uptime: Math.round((Date.now() - startTime) / 1000),
      rooms: dealer.roomCount,
    }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

healthServer.listen(DEALER_HEALTH_PORT, '127.0.0.1', () => {
  console.log(`[Dealer] Health endpoint: http://127.0.0.1:${DEALER_HEALTH_PORT}/health`);
});

// ── Start dealer ────────────────────────────────────────────────────────────

dealer.start();

// ── Graceful shutdown ───────────────────────────────────────────────────────

function shutdown(): void {
  console.log('\n[Dealer] Shutting down...');
  dealer.stop();
  healthServer.close();
  removeLockfile();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
