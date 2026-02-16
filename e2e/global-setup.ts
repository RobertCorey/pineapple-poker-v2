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

  // Warm up the full emulator stack: Auth → Cloud Functions → Firestore.
  // Each service has a cold-start penalty on CI (3-15s). Running a real
  // joinGame + leaveGame round-trip here ensures every layer is hot before
  // the first test starts. This is much cheaper than retrying a failed test.
  if (!productionUrl) {
    const AUTH_URL =
      'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key';
    const FN_BASE = 'http://127.0.0.1:5001/pineapple-poker-8f3/us-central1';
    const WARMUP_ROOM = 'WARMUP';

    try {
      // 1. Anonymous auth — warms the Auth emulator
      const authRes = await fetch(AUTH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnSecureToken: true }),
      });
      const { idToken } = (await authRes.json()) as { idToken: string };

      const callFn = (fn: string, data: Record<string, unknown>) =>
        fetch(`${FN_BASE}/${fn}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ data }),
        });

      // 2. joinGame — warms Functions emulator + Firestore writes
      await callFn('joinGame', { roomId: WARMUP_ROOM, displayName: 'Warmup', create: true });

      // 3. leaveGame — warms a second function + cleans up the room
      await callFn('leaveGame', { roomId: WARMUP_ROOM });
    } catch {
      // Non-fatal — tests will still run, just might be slower on first call.
      console.warn('Emulator warmup failed (non-fatal)');
    }
  }
}
