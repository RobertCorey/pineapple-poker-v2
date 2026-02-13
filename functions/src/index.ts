import * as admin from 'firebase-admin';

admin.initializeApp();

export { joinGame, leaveGame, placeCards, startMatch, playAgain } from './player-actions';
