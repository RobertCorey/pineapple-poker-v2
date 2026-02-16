/**
 * Playwright globalSetup — fail fast if required services aren't running.
 *
 * When PRODUCTION_URL is set, only checks that the production site is reachable.
 * Otherwise, checks all local emulator services.
 */
export default async function globalSetup() {
  const productionUrl = process.env.PRODUCTION_URL;

  const checks = productionUrl
    ? [{ name: 'Production site', url: productionUrl }]
    : [
        { name: 'Firestore emulator', url: 'http://localhost:8080' },
        { name: 'Functions emulator', url: 'http://localhost:5001', anyStatus: true },
        { name: 'Emulator UI', url: 'http://localhost:4000' },
        { name: 'Vite dev server', url: 'http://localhost:5173' },
        { name: 'Dealer service', url: 'http://localhost:5555/health' },
      ];

  const failures: string[] = [];

  for (const check of checks) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(check.url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!('anyStatus' in check && check.anyStatus) && !res.ok) {
        failures.push(`${check.name} (${check.url}) — HTTP ${res.status}`);
      }
    } catch {
      failures.push(`${check.name} (${check.url}) — not reachable`);
    }
  }

  if (failures.length > 0) {
    const hint = productionUrl
      ? 'Check that the production site is deployed and accessible.'
      : 'Start all services with:  npm run dev:up';

    const msg = [
      '',
      'E2E pre-flight check failed. These services are not running:',
      '',
      ...failures.map((f) => `  ✗ ${f}`),
      '',
      hint,
      '',
    ].join('\n');
    throw new Error(msg);
  }

  // Warm up Cloud Functions emulator to avoid cold-start timeouts in tests.
  // The first function invocation can take 3-10s on CI while the emulator JIT-loads.
  if (!productionUrl) {
    const fns = ['joinGame', 'placeCards', 'startMatch', 'leaveGame', 'playAgain'];
    await Promise.allSettled(
      fns.map((fn) =>
        fetch(`http://localhost:5001/pineapple-poker-8f3/us-central1/${fn}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: {} }),
        }).catch(() => {}),
      ),
    );
    // Give the emulator time to finish loading all function definitions.
    await new Promise((r) => setTimeout(r, 3_000));
  }
}
