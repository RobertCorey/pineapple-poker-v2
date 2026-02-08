import * as admin from 'firebase-admin';

admin.initializeApp();

export { joinGame, leaveGame, placeCards } from './player-actions';
