import * as admin from 'firebase-admin';

admin.initializeApp();

export { joinGame, readyUp, placeCards, autoPlayRounds } from './player-actions';
