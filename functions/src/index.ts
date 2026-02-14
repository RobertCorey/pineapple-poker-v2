import * as admin from 'firebase-admin';

admin.initializeApp();

export { joinGame, leaveGame, placeCards, startMatch, playAgain, addBot, removeBot } from './player-actions';
export { pruneOldGames } from './cleanup';
