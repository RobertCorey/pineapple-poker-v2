/**
 * Playwright globalSetup — fail fast if dev services aren't running.
 */
export default async function globalSetup() {
  const checks = [
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
      const timeout = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(check.url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!check.anyStatus && !res.ok) {
        failures.push(`${check.name} (${check.url}) — HTTP ${res.status}`);
      }
    } catch {
      failures.push(`${check.name} (${check.url}) — not reachable`);
    }
  }

  if (failures.length > 0) {
    const msg = [
      '',
      'E2E pre-flight check failed. These services are not running:',
      '',
      ...failures.map((f) => `  ✗ ${f}`),
      '',
      'Start all services with:  npm run dev:up',
      '',
    ].join('\n');
    throw new Error(msg);
  }
}
