import * as admin from 'firebase-admin';
import { Dealer } from './dealer';

// Point at Firestore emulator
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';

admin.initializeApp({ projectId: 'pineapple-poker-8f3' });

const db = admin.firestore();
const dealer = new Dealer(db);
dealer.start();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Dealer] Shutting down...');
  dealer.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  dealer.stop();
  process.exit(0);
});
