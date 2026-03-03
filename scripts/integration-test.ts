/**
 * Integration test: runs a single BuyerAgent through one full purchase cycle.
 * Requires the dev server to be running (`npm run dev:server`).
 *
 * NOTE: Start the dev server with ZOO_SIMULATION_ENABLED=false so the server
 * doesn't create its own competing AgentRunner:
 *   ZOO_SIMULATION_ENABLED=false npm run dev:server
 *
 * Usage: tsx scripts/integration-test.ts
 * Exit 0 on success, 1 on failure.
 */
import 'dotenv/config';
import { AgentRunner } from '../agents/agent-runner.js';

const TIMEOUT_MS = 60_000;

async function main() {
  console.log('=== Integration Test: Single Purchase Cycle ===\n');

  // AgentRunner now generates ephemeral wallets internally during start()
  const runner = new AgentRunner();
  let purchaseCompleted = false;
  let purchaseError: string | null = null;
  let txHash: string | null = null;

  // Listen for the first purchase event
  runner.on('purchase_completed', (event) => {
    purchaseCompleted = true;
    txHash = event.data.purchase_record?.tx_hash ?? null;
    console.log(`\n[TEST] Purchase completed: tx_hash=${txHash}`);
  });

  runner.on('purchase_failed', (event) => {
    purchaseError = event.data.error;
    console.log(`\n[TEST] Purchase failed: ${purchaseError}`);
  });

  try {
    // Start the runner (funds agents, starts loops)
    await runner.start();

    console.log('[TEST] Runner started, waiting for agents to initialize...');
    await sleep(3000);

    // Force a purchase on the first agent
    const statuses = runner.getAgentStatuses();
    if (statuses.length === 0) {
      throw new Error('No agents available');
    }

    const targetAgent = statuses[0].agent_id;
    console.log(`[TEST] Forcing purchase on ${targetAgent}...`);
    await runner.forcePurchase(targetAgent);

    // Wait for the purchase event (or timeout)
    const deadline = Date.now() + TIMEOUT_MS;
    while (!purchaseCompleted && !purchaseError && Date.now() < deadline) {
      await sleep(500);
    }

    // Collect results
    const finalStatuses = runner.getAgentStatuses();
    const agentStatus = finalStatuses.find(s => s.agent_id === targetAgent);
    const metrics = runner.getMetrics();

    console.log('\n=== Results ===');
    console.log(`Purchase completed: ${purchaseCompleted}`);
    console.log(`TX hash:           ${txHash ?? 'none'}`);
    console.log(`Agent balance:     $${agentStatus?.balance ?? '?'}`);
    console.log(`Total purchases:   ${metrics.total_purchases}`);
    console.log(`Needs recovered:   food=${agentStatus?.needs.food_need ?? '?'}`);

    await runner.stop();

    // Assertions
    if (!purchaseCompleted) {
      console.error(`\n[FAIL] Purchase did not complete. Error: ${purchaseError ?? 'timeout'}`);
      process.exit(1);
    }

    if (!txHash || txHash === 'unknown') {
      console.error('\n[FAIL] No valid tx_hash returned');
      process.exit(1);
    }

    console.log('\n[PASS] Integration test passed!');
    process.exit(0);

  } catch (err) {
    console.error('\n[FAIL] Unexpected error:', err);
    try { await runner.stop(); } catch { /* ignore */ }
    process.exit(1);
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main();
