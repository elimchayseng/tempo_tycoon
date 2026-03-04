#!/usr/bin/env tsx
export {};
/**
 * Full simulation lifecycle test — requires running server + blockchain access.
 *
 * Steps:
 *  1. POST /api/zoo/preflight — verify all 7 checks pass
 *  2. POST /api/zoo/agents/start — verify success
 *  3. GET  /api/zoo/agents/status — verify is_running + 3 agents
 *  4. GET  /api/merchant/food/catalog — verify products with stock
 *  5. Wait for activity (poll status)
 *  6. POST /api/zoo/agents/stop — verify success
 *  7. Verify agents stopped via status endpoint
 *
 * Usage: tsx scripts/test-simulation-lifecycle.ts
 * Exit 0 on success, 1 on failure.
 */

const BASE_URL = `http://localhost:${process.env.PORT || 4000}`;
const POLL_INTERVAL_MS = 2000;
const MAX_WAIT_MS = 30_000;

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, name: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(name);
    console.error(`  FAIL: ${name}`);
  }
}

async function fetchJson(path: string, options?: RequestInit): Promise<{ status: number; data: any }> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await response.json().catch(() => null);
  return { status: response.status, data };
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  console.log('=== Simulation Lifecycle Test ===');
  console.log(`Target: ${BASE_URL}\n`);

  // Verify server is reachable
  try {
    await fetch(`${BASE_URL}/api/health`);
  } catch {
    console.error('[FAIL] Server not reachable. Start it with: npm run dev:server');
    process.exit(1);
  }

  // Step 1: Preflight
  console.log('--- Step 1: Preflight ---');
  const preflight = await fetchJson('/api/zoo/preflight', { method: 'POST' });
  assert(preflight.status === 200, 'preflight returns 200');
  assert(preflight.data?.success === true, 'preflight success is true');

  const checks = preflight.data?.checks ?? [];
  const allPassed = checks.every((c: any) => c.status === 'pass');
  assert(allPassed, `all ${checks.length} preflight checks pass`);

  if (!allPassed) {
    const failedChecks = checks.filter((c: any) => c.status !== 'pass');
    for (const c of failedChecks) {
      console.error(`  Preflight failed: ${c.name} — ${c.message ?? c.error ?? 'unknown'}`);
    }
    console.error('\n[FAIL] Cannot continue — preflight checks failed');
    process.exit(1);
  }

  // Step 2: Start agents
  console.log('\n--- Step 2: Start Agents ---');
  const start = await fetchJson('/api/zoo/agents/start', { method: 'POST' });
  assert(start.status === 200, 'start returns 200');
  assert(start.data?.success === true || start.data?.is_running === true, 'agents started successfully');

  // Step 3: Verify running
  console.log('\n--- Step 3: Verify Running ---');
  await sleep(2000); // give agents time to spin up
  const status = await fetchJson('/api/zoo/agents/status');
  assert(status.status === 200, 'agent status returns 200');
  assert(status.data?.is_running === true, 'is_running is true');

  const agents = status.data?.agents ?? status.data?.buyer_agents ?? [];
  console.log(`  Agents found: ${agents.length}`);
  assert(agents.length >= 3, `at least 3 agents present (got ${agents.length})`);

  // Step 4: Verify catalog
  console.log('\n--- Step 4: Verify Catalog ---');
  const catalog = await fetchJson('/api/merchant/food/catalog');
  assert(catalog.status === 200, 'catalog returns 200');
  const products = catalog.data?.products ?? [];
  assert(products.length > 0, `catalog has products (got ${products.length})`);
  const hasStock = products.some((p: any) => p.stock > 0);
  assert(hasStock, 'at least one product has stock > 0');

  // Step 5: Wait for activity
  console.log('\n--- Step 5: Wait for Activity ---');
  let activityDetected = false;
  const deadline = Date.now() + MAX_WAIT_MS;

  while (Date.now() < deadline) {
    const poll = await fetchJson('/api/zoo/agents/status');
    const metrics = poll.data?.metrics;

    if (metrics && (metrics.total_purchases > 0 || metrics.total_attempts > 0)) {
      activityDetected = true;
      console.log(`  Activity detected: ${metrics.total_purchases ?? 0} purchases, ${metrics.total_attempts ?? 0} attempts`);
      break;
    }
    process.stdout.write('.');
    await sleep(POLL_INTERVAL_MS);
  }

  if (!activityDetected) {
    console.warn('\n  [WARN] No purchase activity detected within timeout (agents may still be degrading needs)');
  }

  // Step 6: Stop agents
  console.log('\n\n--- Step 6: Stop Agents ---');
  const stop = await fetchJson('/api/zoo/agents/stop', { method: 'POST' });
  assert(stop.status === 200, 'stop returns 200');
  assert(stop.data?.success === true || stop.data?.is_running === false, 'agents stopped successfully');

  // Step 7: Verify stopped
  console.log('\n--- Step 7: Verify Stopped ---');
  await sleep(1000);
  const stoppedStatus = await fetchJson('/api/zoo/agents/status');
  assert(stoppedStatus.data?.is_running === false, 'is_running is false after stop');

  // Summary
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);

  if (failed > 0) {
    console.error('\nFailed tests:');
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log('\n[PASS] Simulation lifecycle test passed!');
  process.exit(0);
}

run().catch((err) => {
  console.error('\n[FAIL] Unexpected error:', err);
  process.exit(1);
});
