#!/usr/bin/env tsx
export {};
/**
 * API endpoint tests — requires a running server (`npm run dev:server`).
 *
 * Tests every REST endpoint for correct status codes and response shapes.
 *
 * Usage: tsx scripts/test-api-endpoints.ts
 * Exit 0 on success, 1 on failure.
 */

const BASE_URL = `http://localhost:${process.env.PORT || 4000}`;

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

async function testHealthEndpoint() {
  console.log('\n--- GET /api/health ---');
  const { status, data } = await fetchJson('/api/health');
  assert(status === 200, '/api/health returns 200');
  assert(data?.status !== undefined, '/api/health has status field');
}

async function testBlockchainHealth() {
  console.log('\n--- GET /api/health/blockchain ---');
  const { status, data } = await fetchJson('/api/health/blockchain');
  assert(status === 200, '/api/health/blockchain returns 200');
  assert(data?.chain_id !== undefined || data?.chainId !== undefined, '/api/health/blockchain has chain info');
}

async function testZooRegistry() {
  console.log('\n--- GET /api/zoo/registry ---');
  const { status, data } = await fetchJson('/api/zoo/registry');
  assert(status === 200, '/api/zoo/registry returns 200');
  assert(Array.isArray(data?.merchants), '/api/zoo/registry has merchants array');
}

async function testZooStatus() {
  console.log('\n--- GET /api/zoo/status ---');
  const { status, data } = await fetchJson('/api/zoo/status');
  assert(status === 200, '/api/zoo/status returns 200');
  assert(data?.zoo_enabled !== undefined, '/api/zoo/status has zoo_enabled');
  assert(data?.accounts !== undefined, '/api/zoo/status has accounts');
  assert(data?.agents !== undefined, '/api/zoo/status has agents');
}

async function testZooHealth() {
  console.log('\n--- GET /api/zoo/health ---');
  const { status } = await fetchJson('/api/zoo/health');
  assert(status === 200, '/api/zoo/health returns 200');
}

async function testMerchantCatalog() {
  console.log('\n--- GET /api/merchant/food/catalog ---');
  const { status, data } = await fetchJson('/api/merchant/food/catalog');
  assert(status === 200, '/api/merchant/food/catalog returns 200');
  assert(Array.isArray(data?.products), '/api/merchant/food/catalog has products array');
}

async function testPreflight() {
  console.log('\n--- POST /api/zoo/preflight ---');
  const { status, data } = await fetchJson('/api/zoo/preflight', { method: 'POST' });
  assert(status === 200, '/api/zoo/preflight returns 200');
  assert(data?.success !== undefined, '/api/zoo/preflight has success field');
  assert(Array.isArray(data?.checks), '/api/zoo/preflight has checks array');
  assert(data?.checks?.length === 7, `/api/zoo/preflight has 7 checks (got ${data?.checks?.length})`);
}

async function testAgentStatus() {
  console.log('\n--- GET /api/zoo/agents/status ---');
  const { status, data } = await fetchJson('/api/zoo/agents/status');
  assert(status === 200, '/api/zoo/agents/status returns 200');
  assert(data?.is_running !== undefined, '/api/zoo/agents/status has is_running field');
}

async function testCheckoutCreateBadRequest() {
  console.log('\n--- POST /api/merchant/food/checkout/create (bad request) ---');
  const { status } = await fetchJson('/api/merchant/food/checkout/create', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  assert(status === 400, '/api/merchant/food/checkout/create with missing fields returns 400');
}

async function testCheckoutCompleteBadSession() {
  console.log('\n--- POST /api/merchant/food/checkout/complete (bad session) ---');
  const { status } = await fetchJson('/api/merchant/food/checkout/complete', {
    method: 'POST',
    body: JSON.stringify({ session_id: 'nonexistent-session', tx_hash: '0x0000' }),
  });
  assert(status === 404 || status === 400, '/api/merchant/food/checkout/complete with bad session returns 404 or 400');
}

async function run() {
  console.log('=== API Endpoint Tests ===');
  console.log(`Target: ${BASE_URL}\n`);

  // Verify server is reachable
  try {
    await fetch(`${BASE_URL}/api/health`);
  } catch {
    console.error('[FAIL] Server not reachable. Start it with: npm run dev:server');
    process.exit(1);
  }

  await testHealthEndpoint();
  await testBlockchainHealth();
  await testZooRegistry();
  await testZooStatus();
  await testZooHealth();
  await testMerchantCatalog();
  await testPreflight();
  await testAgentStatus();
  await testCheckoutCreateBadRequest();
  await testCheckoutCompleteBadSession();

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);

  if (failed > 0) {
    console.error('\nFailed tests:');
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log('\n[PASS] All API endpoint tests passed!');
  process.exit(0);
}

run().catch((err) => {
  console.error('\n[FAIL] Unexpected error:', err);
  process.exit(1);
});
