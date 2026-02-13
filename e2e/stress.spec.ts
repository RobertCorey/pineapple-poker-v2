/**
 * Stress test: up to 6 players, multiple rounds, join/leave/rejoin/timeout scenarios.
 *
 * EXCLUDED from regular test runs (npm test ignores this file).
 * Run manually: npx playwright test e2e/stress.spec.ts
 *
 * Requires: emulators + dealer + frontend already running (3 terminals).
 *
 * Key nuance: the dealer starts a round as soon as >=2 players are in Waiting.
 * When players join sequentially, later arrivals may become observers for the
 * current round. Tests account for this by detecting active vs observer status.
 */
import { test, expect, type Page, type BrowserContext, type Browser } from '@playwright/test';

const PLAYER_NAMES = ['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank'];

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generateRoomCode(): string {
  return Array.from({ length: 6 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
}

interface Player {
  name: string;
  roomId: string;
  ctx: BrowserContext;
  page: Page;
}

async function createPlayer(browser: Browser, name: string, roomId: string): Promise<Player> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  return { name, roomId, ctx, page };
}

async function joinGame(player: Player) {
  await player.page.goto(`/?room=${player.roomId}`);
  // Wait for the lobby to be ready (name input visible = auth + Firestore loaded)
  await player.page.getByTestId('name-input').waitFor({ timeout: 15_000 });
  await player.page.getByTestId('name-input').fill(player.name);
  await player.page.getByTestId('join-button').click();
  await player.page.getByTestId('phase-label').waitFor({ timeout: 15_000 });
}

async function leaveGame(player: Player) {
  await player.page.getByRole('button', { name: 'Leave' }).click();
  await player.page.getByTestId('join-button').waitFor({ timeout: 15_000 });
}

async function rejoinFromLobby(player: Player) {
  await player.page.getByTestId('name-input').fill(player.name);
  await player.page.getByTestId('join-button').click();
  await player.page.getByTestId('phase-label').waitFor({ timeout: 15_000 });
}

async function rejoinFromSitOut(player: Player) {
  await player.page.getByRole('button', { name: 'Rejoin' }).click();
  await expect(player.page.getByText('sitting out')).not.toBeVisible({ timeout: 10_000 });
}

/** Check if a player is an active player (has cards) vs observer. */
async function isActive(player: Player): Promise<boolean> {
  try {
    await player.page.getByTestId('hand-card-0').waitFor({ timeout: 3_000 });
    return true;
  } catch {
    return false;
  }
}

/** Check if a player sees the observer banner */
async function isObserver(player: Player): Promise<boolean> {
  return player.page.getByText('Observing').isVisible();
}

/** Place 5 cards for initial deal: 2 bottom, 2 middle, 1 top */
async function placeInitialDeal(page: Page) {
  const board = page.getByTestId('my-board');
  await page.getByTestId('hand-card-0').waitFor({ timeout: 20_000 });

  await page.getByTestId('hand-card-0').click();
  await board.getByTestId('row-bottom').click();

  await page.getByTestId('hand-card-0').click();
  await board.getByTestId('row-bottom').click();

  await page.getByTestId('hand-card-0').click();
  await board.getByTestId('row-middle').click();

  await page.getByTestId('hand-card-0').click();
  await board.getByTestId('row-middle').click();

  await page.getByTestId('hand-card-0').click();
  await board.getByTestId('row-top').click();
}

/** Place 2 cards for streets 2-5, 3rd auto-discarded */
async function placeStreet(page: Page, street: number) {
  const board = page.getByTestId('my-board');
  await page.getByTestId('hand-card-0').waitFor({ timeout: 20_000 });

  let row1: string, row2: string;
  switch (street) {
    case 2: row1 = 'bottom'; row2 = 'middle'; break;
    case 3: row1 = 'bottom'; row2 = 'middle'; break;
    case 4: row1 = 'bottom'; row2 = 'top'; break;
    case 5: row1 = 'middle'; row2 = 'top'; break;
    default: throw new Error(`Unexpected street ${street}`);
  }

  await page.getByTestId('hand-card-0').click();
  await board.getByTestId(`row-${row1}`).click();

  await page.getByTestId('hand-card-0').click();
  await board.getByTestId(`row-${row2}`).click();
}

/** Wait for a specific phase to appear on the player's page */
async function waitForPhase(player: Player, phaseText: string, timeoutMs = 45_000) {
  await expect(player.page.getByTestId('phase-label')).toContainText(phaseText, {
    timeout: timeoutMs,
  });
}

/** Play a full round (initial deal + streets 2-5) for a single player */
async function playFullRound(player: Player) {
  await waitForPhase(player, 'initial_deal');
  await placeInitialDeal(player.page);

  for (const street of [2, 3, 4, 5]) {
    await waitForPhase(player, `street_${street}`);
    await placeStreet(player.page, street);
  }
}

/**
 * Play a full round with a group of players. Only players with cards (active)
 * will place cards. Others are observers.
 * Returns { active, observers } arrays.
 */
async function playRoundWithGroup(players: Player[]): Promise<{
  active: Player[];
  observers: Player[];
}> {
  // Wait for initial_deal on all players
  await Promise.all(players.map((p) => waitForPhase(p, 'initial_deal')));

  // Determine who is active (has cards) vs observer
  const activeChecks = await Promise.all(players.map((p) => isActive(p)));
  const active = players.filter((_, i) => activeChecks[i]);
  const observers = players.filter((_, i) => !activeChecks[i]);

  log(`  Active: [${active.map((p) => p.name).join(', ')}], Observers: [${observers.map((p) => p.name).join(', ')}]`);

  // Active players place initial deal
  for (const p of active) {
    await placeInitialDeal(p.page);
  }

  // Streets 2-5
  for (const street of [2, 3, 4, 5]) {
    await Promise.all(active.map((p) => waitForPhase(p, `street_${street}`)));
    for (const p of active) await placeStreet(p.page, street);
  }

  return { active, observers };
}

/** Wait for round results to appear and close them */
async function waitAndCloseResults(player: Player) {
  await player.page.getByTestId('round-results').waitFor({ timeout: 30_000 });
  await expect(player.page.getByTestId('round-results')).toContainText('Round Complete');
  await player.page.getByTestId('close-results').click();
}

function log(msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

// ---- Tests ----

test.describe('Stress tests', () => {
  /**
   * Scenario 1: 6 players, multiple rounds. The dealer starts the round
   * after 2 join, so some players will be observers first round. By round 2
   * all should be promoted. Plays 3 full rounds with all 6 active.
   */
  test('6 players across 3+ rounds', async ({ browser }) => {
    test.setTimeout(600_000);

    const roomId = generateRoomCode();
    const players: Player[] = [];
    for (const name of PLAYER_NAMES) {
      players.push(await createPlayer(browser, name, roomId));
    }

    // All 6 join — some will become observers since dealer starts quickly
    log('All 6 players joining...');
    for (const p of players) {
      await joinGame(p);
      log(`  ${p.name} joined`);
    }

    // --- Round 1: whoever is active plays, observers watch ---
    log('=== Round 1 ===');
    const round1 = await playRoundWithGroup(players);
    expect(round1.active.length).toBeGreaterThanOrEqual(2);

    // All players (active + observers) see results
    await Promise.all(players.map((p) => waitAndCloseResults(p)));
    log('Round 1 complete');

    // --- Round 2: observers promoted, all 6 should be active ---
    log('=== Round 2 (all 6 expected active) ===');
    const round2 = await playRoundWithGroup(players);
    expect(round2.active.length).toBe(6);
    expect(round2.observers.length).toBe(0);

    await Promise.all(players.map((p) => waitAndCloseResults(p)));
    log('Round 2 complete');

    // --- Round 3: all 6 again ---
    log('=== Round 3 ===');
    const round3 = await playRoundWithGroup(players);
    expect(round3.active.length).toBe(6);

    await Promise.all(players.map((p) => waitAndCloseResults(p)));
    log('Round 3 complete');

    for (const p of players) await p.ctx.close();
    log('6-player test complete');
  });

  /**
   * Scenario 2: Players leave and rejoin between rounds.
   * 2 players start, play a round. A 3rd joins mid-round (observer).
   * Then a 4th joins between rounds. Verify all 4 play round 2.
   * Then one leaves, verify round 3 with 3 players.
   */
  test('leave and rejoin between rounds', async ({ browser }) => {
    test.setTimeout(600_000);

    const roomId = generateRoomCode();
    const [alice, bob, carol, dave] = await Promise.all(
      PLAYER_NAMES.slice(0, 4).map((name) => createPlayer(browser, name, roomId)),
    );

    // Alice and Bob join and start round 1
    await joinGame(alice);
    await joinGame(bob);
    log('Alice and Bob joined');

    // --- Round 1: Alice and Bob play ---
    log('=== Round 1 (2 players) ===');
    await Promise.all([waitForPhase(alice, 'initial_deal'), waitForPhase(bob, 'initial_deal')]);

    // Carol joins mid-round
    await placeInitialDeal(alice.page);
    await joinGame(carol);
    log('Carol joined mid-round (observer)');
    await expect(carol.page.getByText('Observing')).toBeVisible({ timeout: 10_000 });

    await placeInitialDeal(bob.page);

    for (const street of [2, 3, 4, 5]) {
      await Promise.all([waitForPhase(alice, `street_${street}`), waitForPhase(bob, `street_${street}`)]);
      await placeStreet(alice.page, street);
      await placeStreet(bob.page, street);
    }

    await Promise.all([alice, bob, carol].map((p) => waitAndCloseResults(p)));
    log('Round 1 complete');

    // Dave joins between rounds
    await joinGame(dave);
    log('Dave joined between rounds');

    // --- Round 2: all 4 should be active ---
    log('=== Round 2 (4 players) ===');
    const round2Players = [alice, bob, carol, dave];
    const round2 = await playRoundWithGroup(round2Players);
    expect(round2.active.length).toBe(4);

    await Promise.all(round2Players.map((p) => waitAndCloseResults(p)));
    log('Round 2 complete');

    // Bob leaves
    log('Bob leaving...');
    await leaveGame(bob);
    log('Bob left');

    // --- Round 3: 3 players ---
    log('=== Round 3 (3 players) ===');
    const round3Players = [alice, carol, dave];
    const round3 = await playRoundWithGroup(round3Players);
    expect(round3.active.length).toBe(3);

    await Promise.all(round3Players.map((p) => waitAndCloseResults(p)));
    log('Round 3 complete');

    // Bob rejoins from lobby
    log('Bob rejoining...');
    await rejoinFromLobby(bob);
    log('Bob rejoined');

    // --- Round 4: all 4 again ---
    log('=== Round 4 (4 players again) ===');
    const round4 = await playRoundWithGroup(round2Players);
    expect(round4.active.length).toBe(4);

    await Promise.all(round2Players.map((p) => waitAndCloseResults(p)));
    log('Round 4 complete');

    for (const p of round2Players) await p.ctx.close();
    log('Leave/rejoin test complete');
  });

  /**
   * Scenario 3: Timeout sit-out and rejoin with 4 players.
   * Round 1: Dave doesn't place, times out, auto-fouled.
   * Round 2: 3 active players.
   * Dave rejoins from sit-out.
   * Round 3: all 4 active.
   */
  test('timeout sit-out and rejoin with 4 players', async ({ browser }) => {
    test.setTimeout(600_000);

    const roomId = generateRoomCode();
    const [alice, bob, carol, dave] = await Promise.all(
      PLAYER_NAMES.slice(0, 4).map((name) => createPlayer(browser, name, roomId)),
    );

    // All 4 join — should all be active since they join before round starts
    await joinGame(alice);
    await joinGame(bob);
    await joinGame(carol);
    await joinGame(dave);
    log('4 players joined');

    // --- Round 1: Dave will timeout ---
    log('=== Round 1: Dave will timeout ===');
    await Promise.all([alice, bob, carol, dave].map((p) => waitForPhase(p, 'initial_deal')));

    // Detect who's active (dealer race — some might be observers)
    const activeChecks = await Promise.all([alice, bob, carol, dave].map((p) => isActive(p)));
    const activePlayers = [alice, bob, carol, dave].filter((_, i) => activeChecks[i]);
    log(`  Active: [${activePlayers.map((p) => p.name).join(', ')}]`);

    // The ones who are active (except Dave) place their cards
    const placingPlayers = activePlayers.filter((p) => p.name !== 'Dave');
    for (const p of placingPlayers) await placeInitialDeal(p.page);
    log(`  ${placingPlayers.map((p) => p.name).join(', ')} placed. Waiting for timeout...`);

    // Wait for timeout (30s initial deal) — street_2 means timeout fired
    await waitForPhase(alice, 'street_2', 50_000);
    log('  Timeout fired, game advanced');

    // Non-fouled active players continue streets 2-5
    for (const street of [2, 3, 4, 5]) {
      if (street > 2) {
        await Promise.all(placingPlayers.map((p) => waitForPhase(p, `street_${street}`)));
      }
      for (const p of placingPlayers) await placeStreet(p.page, street);
      log(`  Placed street ${street}`);
    }

    // All see results
    await Promise.all([alice, bob, carol, dave].map((p) => waitAndCloseResults(p)));
    log('Round 1 complete');

    // Dave should be sitting out (if he was active and timed out)
    const daveSittingOut = await dave.page.getByText('sitting out').isVisible();
    if (daveSittingOut) {
      log('Dave is sitting out — rejoining...');
      await rejoinFromSitOut(dave);
      log('Dave rejoined');
    } else {
      log('Dave was an observer (not sitting out)');
    }

    // --- Round 2: play normally ---
    log('=== Round 2 ===');
    const round2 = await playRoundWithGroup([alice, bob, carol, dave]);
    await Promise.all([alice, bob, carol, dave].map((p) => waitAndCloseResults(p)));
    log(`Round 2 complete (${round2.active.length} active)`);

    // --- Round 3: all 4 should be active ---
    log('=== Round 3 ===');
    const round3 = await playRoundWithGroup([alice, bob, carol, dave]);
    expect(round3.active.length).toBe(4);
    await Promise.all([alice, bob, carol, dave].map((p) => waitAndCloseResults(p)));
    log('Round 3 complete');

    for (const p of [alice, bob, carol, dave]) await p.ctx.close();
    log('Timeout/rejoin test complete');
  });

  /**
   * Scenario 4: Mid-round observers get promoted next round.
   * Alice and Bob start. Carol and Dave join mid-round (street 2+).
   * Verify observers see the banner, then play round 2 as active.
   */
  test('observers join mid-round and get promoted', async ({ browser }) => {
    test.setTimeout(600_000);

    const roomId = generateRoomCode();
    const [alice, bob, carol, dave] = await Promise.all(
      PLAYER_NAMES.slice(0, 4).map((name) => createPlayer(browser, name, roomId)),
    );

    await joinGame(alice);
    await joinGame(bob);
    log('Alice and Bob joined');

    // --- Round 1: 2 players play, 2 join as observers during street 2 ---
    log('=== Round 1 ===');
    await Promise.all([waitForPhase(alice, 'initial_deal'), waitForPhase(bob, 'initial_deal')]);
    await placeInitialDeal(alice.page);
    await placeInitialDeal(bob.page);

    // Wait for street_2 then add observers
    await Promise.all([waitForPhase(alice, 'street_2'), waitForPhase(bob, 'street_2')]);
    log('Street 2 reached — adding observers');

    await joinGame(carol);
    await joinGame(dave);
    log('Carol and Dave joined mid-round');

    // Verify observer status
    await expect(carol.page.getByText('Observing')).toBeVisible({ timeout: 10_000 });
    await expect(dave.page.getByText('Observing')).toBeVisible({ timeout: 10_000 });
    log('Carol and Dave see observer banner');

    // Alice and Bob finish the round
    await placeStreet(alice.page, 2);
    await placeStreet(bob.page, 2);

    for (const street of [3, 4, 5]) {
      await Promise.all([waitForPhase(alice, `street_${street}`), waitForPhase(bob, `street_${street}`)]);
      await placeStreet(alice.page, street);
      await placeStreet(bob.page, street);
    }

    // All 4 see results (observers too)
    await Promise.all([alice, bob, carol, dave].map((p) => waitAndCloseResults(p)));
    log('Round 1 complete');

    // --- Round 2: all 4 active (observers promoted) ---
    log('=== Round 2: observers promoted ===');
    const allFour = [alice, bob, carol, dave];
    const round2 = await playRoundWithGroup(allFour);
    expect(round2.active.length).toBe(4);
    expect(round2.observers.length).toBe(0);

    // Carol and Dave should NOT see observer banner
    await expect(carol.page.getByText('Observing')).not.toBeVisible();
    await expect(dave.page.getByText('Observing')).not.toBeVisible();
    log('Carol and Dave promoted — no observer banner');

    await Promise.all(allFour.map((p) => waitAndCloseResults(p)));
    log('Round 2 complete');

    for (const p of allFour) await p.ctx.close();
    log('Observer promotion test complete');
  });

  /**
   * Scenario 5: Chaos — mixed actions over 4 rounds with 6 players.
   * Round 1: 4 players play normally.
   * Between: Carol leaves, Eve joins.
   * Round 2: 4 players, Dave times out.
   * Between: Frank joins, Carol rejoins, Dave rejoins from sit-out.
   * Round 3: all 6 play.
   * Between: Bob and Eve leave.
   * Round 4: 4 players.
   */
  test('chaos: mixed leave/join/timeout across 4 rounds', async ({ browser }) => {
    test.setTimeout(600_000);

    const roomId = generateRoomCode();
    const allPlayers: Player[] = [];
    for (const name of PLAYER_NAMES) {
      allPlayers.push(await createPlayer(browser, name, roomId));
    }
    const [alice, bob, carol, dave, eve, frank] = allPlayers;

    // --- Setup: 4 players join ---
    const initialFour = [alice, bob, carol, dave];
    for (const p of initialFour) await joinGame(p);
    log('4 players joined');

    // ======= ROUND 1: normal play =======
    log('=== Round 1: 4 players, normal ===');
    const round1 = await playRoundWithGroup(initialFour);
    expect(round1.active.length).toBeGreaterThanOrEqual(2);
    await Promise.all(initialFour.map((p) => waitAndCloseResults(p)));
    log('Round 1 complete');

    // If any from initialFour were observers in round 1, play round 1b to promote them
    if (round1.observers.length > 0) {
      log(`=== Round 1b: promoting ${round1.observers.map((p) => p.name).join(', ')} ===`);
      const round1b = await playRoundWithGroup(initialFour);
      expect(round1b.active.length).toBe(4);
      await Promise.all(initialFour.map((p) => waitAndCloseResults(p)));
      log('Round 1b complete — all 4 active');
    }

    // ======= Between rounds: Carol leaves, Eve joins =======
    log('Carol leaving, Eve joining...');
    await leaveGame(carol);
    await joinGame(eve);
    log('Carol left, Eve joined');

    // ======= ROUND 2: Dave will timeout =======
    log('=== Round 2: Dave timeouts ===');
    const round2Group = [alice, bob, dave, eve];
    await Promise.all(round2Group.map((p) => waitForPhase(p, 'initial_deal', 30_000)));

    // Detect active
    const r2Checks = await Promise.all(round2Group.map((p) => isActive(p)));
    const r2Active = round2Group.filter((_, i) => r2Checks[i]);
    const r2Playing = r2Active.filter((p) => p.name !== 'Dave'); // Dave won't place
    log(`  Active: [${r2Active.map((p) => p.name).join(', ')}]`);
    log(`  Placing: [${r2Playing.map((p) => p.name).join(', ')}] (Dave timing out)`);

    for (const p of r2Playing) await placeInitialDeal(p.page);

    // Wait for timeout
    await waitForPhase(alice, 'street_2', 50_000);
    log('  Timeout fired');

    for (const street of [2, 3, 4, 5]) {
      if (street > 2) await Promise.all(r2Playing.map((p) => waitForPhase(p, `street_${street}`)));
      for (const p of r2Playing) await placeStreet(p.page, street);
    }

    await Promise.all(round2Group.map((p) => waitAndCloseResults(p)));
    log('Round 2 complete');

    // ======= Between rounds: Dave rejoins, Frank joins, Carol rejoins =======
    const daveSitting = await dave.page.getByText('sitting out').isVisible();
    if (daveSitting) {
      log('Dave sitting out — rejoining...');
      await rejoinFromSitOut(dave);
    }
    log('Frank joining, Carol rejoining...');
    await joinGame(frank);
    await rejoinFromLobby(carol);
    log('All rejoined/joined');

    // ======= ROUND 3: all 6 =======
    log('=== Round 3: all 6 players ===');
    const round3 = await playRoundWithGroup(allPlayers);
    log(`  ${round3.active.length} active, ${round3.observers.length} observers`);

    await Promise.all(allPlayers.map((p) => waitAndCloseResults(p)));
    log('Round 3 complete');

    // If not all 6 were active, play another round to promote
    if (round3.active.length < 6) {
      log('=== Round 3b: promoting remaining observers ===');
      const round3b = await playRoundWithGroup(allPlayers);
      expect(round3b.active.length).toBe(6);
      await Promise.all(allPlayers.map((p) => waitAndCloseResults(p)));
      log('Round 3b complete');
    }

    // ======= Between rounds: Bob and Eve leave =======
    log('Bob and Eve leaving...');
    await leaveGame(bob);
    await leaveGame(eve);
    log('Bob and Eve left');

    // ======= ROUND 4: Alice, Carol, Dave, Frank =======
    log('=== Round 4: 4 players ===');
    const round4Players = [alice, carol, dave, frank];
    const round4 = await playRoundWithGroup(round4Players);
    expect(round4.active.length).toBe(4);

    await Promise.all(round4Players.map((p) => waitAndCloseResults(p)));
    log('Round 4 complete');

    // Final verification — game still responsive
    for (const p of round4Players) {
      await expect(p.page.getByTestId('phase-label')).toBeVisible();
    }

    for (const p of allPlayers) await p.ctx.close();
    log('Chaos test complete!');
  });
});
