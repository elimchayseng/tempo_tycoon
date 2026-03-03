#!/usr/bin/env tsx
/**
 * Pure logic tests — no server, no blockchain, runs instantly.
 *
 * Tests:
 *  - DecisionEngine: need degradation, purchase threshold, urgency, budget, food category
 *  - CircuitBreaker: state transitions, failure counting, reset timeout, manual reset
 *  - MerchantInventory: init, decrement, availability, restock detection, restock execution
 *  - WalletGenerator: generates 5 wallets, valid addresses, unique keys
 *
 * Usage: tsx scripts/test-unit-logic.ts
 * Exit 0 on success, 1 on failure.
 */

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

// ---------- DecisionEngine ----------
async function testDecisionEngine() {
  console.log('\n--- DecisionEngine ---');

  // Import dynamically to avoid side-effect logger noise
  const { DecisionEngine, SIMULATION_DEFAULTS } = await import('../agents/decision-engine.js');

  // Need degradation reduces food_need
  const engine = new DecisionEngine('test-agent', {
    randomFactor: 0,  // deterministic
    needDecayRate: { food_need: 5, fun_need: 4 },
    purchaseThreshold: { food_need: 40, fun_need: 30 },
  });

  const needs = { food_need: 80, fun_need: 60 };
  const degraded = engine.degradeNeeds(needs);
  assert(degraded.food_need === 75, 'degradeNeeds reduces food_need by decay rate');
  assert(degraded.fun_need === 60, 'degradeNeeds does not touch fun_need');

  // Degradation clamps at 0
  const low = engine.degradeNeeds({ food_need: 2, fun_need: 50 });
  assert(low.food_need >= 0, 'degradeNeeds clamps food_need at 0');

  // Purchase decision — above threshold = no purchase
  const noPurchase = engine.evaluatePurchaseDecision({ food_need: 60, fun_need: 50 }, 100, null);
  assert(noPurchase.shouldPurchase === false, 'no purchase when food above threshold');

  // Purchase decision — below threshold = should purchase
  const yesPurchase = engine.evaluatePurchaseDecision({ food_need: 20, fun_need: 50 }, 100, null);
  assert(yesPurchase.shouldPurchase === true, 'purchase when food below threshold');
  assert(yesPurchase.urgency !== 'low', 'urgency is elevated when food is low');
  assert(yesPurchase.maxBudget > 0, 'budget allocated when should purchase');
  assert(yesPurchase.preferredCategory !== undefined, 'preferred category set when food < 35');

  // Purchase decision — insufficient balance
  const noBudget = engine.evaluatePurchaseDecision({ food_need: 10, fun_need: 50 }, 2, null);
  assert(noBudget.shouldPurchase === false, 'no purchase when balance below threshold');

  // Purchase decision — too soon since last purchase
  const tooSoon = engine.evaluatePurchaseDecision({ food_need: 10, fun_need: 50 }, 100, new Date());
  assert(tooSoon.shouldPurchase === false, 'no purchase when too soon after last');

  // Need recovery after purchase
  const product = { sku: 'main-1', name: 'Burger', price: '5.00', currency: 'AlphaUSD', category: 'main', available: true };
  const recovered = engine.calculateNeedRecovery({ food_need: 20, fun_need: 50 }, product);
  assert(recovered.food_need > 20, 'need recovery increases food_need');
  assert(recovered.food_need <= 100, 'need recovery clamped at 100');

  // Urgency levels based on food_need relative to threshold
  // With threshold 40: ratio > 0.8 = low, > 0.5 = medium, > 0.2 = high, <= 0.2 = critical
  const criticalDecision = engine.evaluatePurchaseDecision({ food_need: 5, fun_need: 50 }, 100, null);
  assert(criticalDecision.urgency === 'critical', 'urgency is critical when food very low');

  // Budget allocation scales with urgency
  const highDecision = engine.evaluatePurchaseDecision({ food_need: 15, fun_need: 50 }, 100, null);
  assert(criticalDecision.maxBudget >= highDecision.maxBudget, 'critical urgency gets >= budget than high');

  // Food category selection based on need level
  const mainDecision = engine.evaluatePurchaseDecision({ food_need: 10, fun_need: 50 }, 100, null);
  assert(mainDecision.preferredCategory === 'main', 'selects main when food_need < 20');

  const snackDecision = engine.evaluatePurchaseDecision({ food_need: 25, fun_need: 50 }, 100, null);
  assert(snackDecision.preferredCategory === 'snack', 'selects snack when food_need 20-30');

  // SIMULATION_DEFAULTS are defined
  assert(SIMULATION_DEFAULTS.pollingIntervalMs === 3000, 'default polling interval is 3000ms');
  assert(SIMULATION_DEFAULTS.needDecayRate.food_need === 5, 'default food decay rate is 5');
}

// ---------- CircuitBreaker ----------
async function testCircuitBreaker() {
  console.log('\n--- CircuitBreaker ---');

  const { CircuitBreaker } = await import('../agents/circuit-breaker.js');

  // Starts in CLOSED state
  const cb = new CircuitBreaker({ name: 'test', failureThreshold: 3, resetTimeoutMs: 100, halfOpenMaxAttempts: 1 });
  assert(cb.getStatus().state === 'CLOSED', 'initial state is CLOSED');
  assert(cb.getStatus().failures === 0, 'initial failures is 0');

  // Successful execution stays CLOSED
  const result = await cb.execute(async () => 'ok');
  assert(result === 'ok', 'execute returns function result');
  assert(cb.getStatus().state === 'CLOSED', 'stays CLOSED after success');

  // Failures below threshold stay CLOSED
  for (let i = 0; i < 2; i++) {
    try { await cb.execute(async () => { throw new Error('fail'); }); } catch {}
  }
  assert(cb.getStatus().state === 'CLOSED', 'stays CLOSED below failure threshold');
  assert(cb.getStatus().failures === 2, 'failure count tracks correctly');

  // Hitting threshold opens circuit
  try { await cb.execute(async () => { throw new Error('fail'); }); } catch {}
  assert(cb.getStatus().state === 'OPEN', 'transitions to OPEN at failure threshold');

  // OPEN state rejects immediately
  let openRejected = false;
  try {
    await cb.execute(async () => 'should not run');
  } catch (e: any) {
    openRejected = e.message.includes('OPEN');
  }
  assert(openRejected, 'OPEN state rejects with OPEN error');

  // After reset timeout, transitions to HALF_OPEN
  await new Promise(r => setTimeout(r, 150));
  const halfOpenResult = await cb.execute(async () => 'recovered');
  assert(halfOpenResult === 'recovered', 'HALF_OPEN allows test request');
  // With halfOpenMaxAttempts=1, one success closes the circuit
  assert(cb.getStatus().state === 'CLOSED', 'transitions HALF_OPEN -> CLOSED after success');

  // HALF_OPEN failure reopens
  const cb2 = new CircuitBreaker({ name: 'test2', failureThreshold: 1, resetTimeoutMs: 50, halfOpenMaxAttempts: 2 });
  try { await cb2.execute(async () => { throw new Error('fail'); }); } catch {}
  assert(cb2.getStatus().state === 'OPEN', 'cb2 opens after 1 failure');
  await new Promise(r => setTimeout(r, 80));
  try { await cb2.execute(async () => { throw new Error('fail again'); }); } catch {}
  assert(cb2.getStatus().state === 'OPEN', 'HALF_OPEN failure reopens circuit');

  // Manual reset
  cb2.reset();
  assert(cb2.getStatus().state === 'CLOSED', 'manual reset returns to CLOSED');
  assert(cb2.getStatus().failures === 0, 'manual reset clears failures');
}

// ---------- MerchantInventory ----------
async function testMerchantInventory() {
  console.log('\n--- MerchantInventory ---');

  const inv = await import('../agents/merchant-inventory.js');

  const menuItems = [
    { sku: 'burger-1', name: 'Burger', price: '5.00', category: 'main' },
    { sku: 'fries-1', name: 'Fries', price: '3.00', category: 'snack' },
    { sku: 'soda-1', name: 'Soda', price: '2.00', category: 'beverage' },
  ];

  // Initialize inventory
  inv.initializeInventory(menuItems);
  const snapshot = inv.getInventorySnapshot();
  assert(snapshot.length === 3, 'inventory initialized with 3 items');
  assert(snapshot.every(item => item.stock === 5), 'all items start with stock 5');
  assert(snapshot.every(item => item.available), 'all items initially available');

  // Check availability
  assert(inv.isAvailable('burger-1'), 'burger is available');
  assert(!inv.isAvailable('nonexistent'), 'nonexistent item is not available');

  // Decrement stock
  const decremented = inv.decrementStock('burger-1');
  assert(decremented === true, 'decrement returns true on success');
  const burger = inv.getInventoryItem('burger-1');
  assert(burger?.stock === 4, 'stock decremented by 1');

  // Decrement to zero
  for (let i = 0; i < 4; i++) inv.decrementStock('burger-1');
  assert(inv.getInventoryItem('burger-1')?.stock === 0, 'stock reaches 0');
  assert(!inv.isAvailable('burger-1'), 'item unavailable at stock 0');
  assert(inv.decrementStock('burger-1') === false, 'cannot decrement below 0');

  // Restock detection
  const needsRestock = inv.getSkusNeedingRestock();
  assert(needsRestock.some(item => item.sku === 'burger-1'), 'burger needs restock at 0');

  // Decrement fries to threshold (1)
  for (let i = 0; i < 4; i++) inv.decrementStock('fries-1');
  const needsRestock2 = inv.getSkusNeedingRestock();
  assert(needsRestock2.some(item => item.sku === 'fries-1'), 'fries needs restock at threshold');

  // Restock execution
  const unitsAdded = inv.restockItem('burger-1');
  assert(unitsAdded === 5, 'restockItem returns units added (5 from 0)');
  assert(inv.getInventoryItem('burger-1')?.stock === 5, 'stock restored to max');
  assert(inv.isAvailable('burger-1'), 'item available after restock');

  // Restock non-existent
  assert(inv.restockItem('nonexistent') === 0, 'restock nonexistent returns 0');

  // Cost basis
  assert(burger?.cost_basis === '4.00', 'cost_basis = price - 1.0');
}

// ---------- WalletGenerator ----------
async function testWalletGenerator() {
  console.log('\n--- WalletGenerator ---');

  const { generateAllWallets } = await import('../agents/wallet-generator.js');

  const wallets = generateAllWallets();
  assert(wallets.length === 5, 'generates 5 wallets');

  // Valid addresses (0x-prefixed, 42 chars)
  for (const w of wallets) {
    assert(w.address.startsWith('0x') && w.address.length === 42, `${w.label} has valid address`);
    assert(w.privateKey.startsWith('0x') && w.privateKey.length === 66, `${w.label} has valid private key`);
  }

  // Unique keys
  const keys = new Set(wallets.map(w => w.privateKey));
  assert(keys.size === 5, 'all private keys are unique');

  const addrs = new Set(wallets.map(w => w.address));
  assert(addrs.size === 5, 'all addresses are unique');

  // Roles
  const roles = wallets.map(w => w.role);
  assert(roles.includes('zooMaster'), 'includes zooMaster role');
  assert(roles.includes('merchantA'), 'includes merchantA role');
  assert(roles.includes('attendee1'), 'includes attendee1 role');
  assert(roles.includes('attendee2'), 'includes attendee2 role');
  assert(roles.includes('attendee3'), 'includes attendee3 role');
}

// ---------- Runner ----------
async function run() {
  console.log('=== Unit Logic Tests ===');

  await testDecisionEngine();
  await testCircuitBreaker();
  await testMerchantInventory();
  await testWalletGenerator();

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);

  if (failed > 0) {
    console.error('\nFailed tests:');
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log('\n[PASS] All unit logic tests passed!');
  process.exit(0);
}

run().catch((err) => {
  console.error('\n[FAIL] Unexpected error:', err);
  process.exit(1);
});
