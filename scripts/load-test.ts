/**
 * Load test: runs N agents for M minutes and reports performance stats.
 * Requires the dev server to be running (`npm run dev:server`).
 *
 * NOTE: Start the dev server with ZOO_SIMULATION_ENABLED=false so the server
 * doesn't create its own competing AgentRunner:
 *   ZOO_SIMULATION_ENABLED=false npm run dev:server
 *
 * Usage: tsx scripts/load-test.ts [minutes=2]
 * Exit 0 on success, 1 if success rate < 50%.
 */
import 'dotenv/config';
import { AgentRunner } from '../agents/agent-runner.js';

const DEFAULT_MINUTES = 2;

async function main() {
  const minutes = parseInt(process.argv[2] || String(DEFAULT_MINUTES), 10);
  const durationMs = minutes * 60_000;

  console.log(`=== Load Test: ${minutes} minute(s) ===\n`);

  const runner = new AgentRunner();

  let purchases = 0;
  let failures = 0;
  let restocks = 0;
  let merchantRevenue = 0;
  const latencies: number[] = [];

  runner.on('purchase_completed', (event) => {
    purchases++;
    if (event.data.latencyMs) latencies.push(event.data.latencyMs);
    if (event.data.purchase_record?.amount) {
      merchantRevenue += parseFloat(event.data.purchase_record.amount) || 0;
    }
    process.stdout.write(`\r  Purchases: ${purchases} | Failures: ${failures} | Restocks: ${restocks}`);
  });

  runner.on('purchase_failed', () => {
    failures++;
    process.stdout.write(`\r  Purchases: ${purchases} | Failures: ${failures} | Restocks: ${restocks}`);
  });

  runner.on('restock_completed', () => {
    restocks++;
    process.stdout.write(`\r  Purchases: ${purchases} | Failures: ${failures} | Restocks: ${restocks}`);
  });

  try {
    // Initialize ephemeral wallets (generate + fund) — required before start()
    console.log('[LOAD] Initializing ephemeral wallets...');
    await runner.initializeWallets();
    console.log('[LOAD] Wallets initialized and funded.');

    await runner.start();

    const agentCount = runner.getAgentStatuses().length;
    console.log(`[LOAD] ${agentCount} agents started, running for ${minutes} minute(s)...\n`);

    // Let the agents run autonomously for the specified duration
    await sleep(durationMs);

    // Collect final stats
    const metrics = runner.getMetrics();
    const timeSeries = runner.getTimeSeriesStats(durationMs);

    await runner.stop();

    const total = purchases + failures;
    const successRate = total > 0 ? (purchases / total) * 100 : 0;
    const avgLatency = latencies.length > 0
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : 0;

    console.log('\n\n=== Load Test Results ===');
    console.log(`Duration:        ${minutes} minute(s)`);
    console.log(`Agents:          ${agentCount}`);
    console.log(`Total attempts:  ${total}`);
    console.log(`Purchases:       ${purchases}`);
    console.log(`Failures:        ${failures}`);
    console.log(`Success rate:    ${successRate.toFixed(1)}%`);
    console.log(`Avg latency:     ${avgLatency}ms`);
    console.log(`Purchases/min:   ${metrics.purchases_per_minute}`);
    console.log(`Total spent:     $${metrics.total_spent}`);

    console.log('\n--- Merchant Metrics ---');
    console.log(`Revenue:         $${merchantRevenue.toFixed(2)}`);
    console.log(`Restocks:        ${restocks}`);

    console.log('\nTime-series stats (full window):', timeSeries);

    if (successRate < 50) {
      console.error('\n[FAIL] Success rate below 50%');
      process.exit(1);
    }

    console.log('\n[PASS] Load test passed!');
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
