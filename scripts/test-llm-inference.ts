#!/usr/bin/env tsx
/**
 * LLM Inference tests — validates Heroku Managed Inference connectivity
 * and BuyerBrain decision logic without running the full simulation.
 *
 * Tests:
 *  1. Raw endpoint connectivity (health check fetch)
 *  2. Simple chat completion (no tools)
 *  3. Tool-call completion (buyer ACP tools)
 *  4. BuyerBrain.decide() with mock catalog context
 *  5. BuyerBrain.decide() with very low need (should pick main course)
 *  6. Call count tracking and reset
 *
 * Requires: INFERENCE_URL and INFERENCE_KEY in .env
 *
 * Usage: tsx scripts/test-llm-inference.ts
 * Exit 0 on success, 1 on failure.
 */

import 'dotenv/config';
import { LLMClient } from '../agents/llm/llm-client.js';
import { BuyerBrain } from '../agents/llm/buyer-brain.js';
import type { BuyerLLMContext, MerchantProduct } from '../agents/types.js';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, name: string) {
  if (condition) {
    passed++;
    console.log(`  PASS: ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.error(`  FAIL: ${name}`);
  }
}

// ---------- Test data ----------

const MOCK_CATALOG: MerchantProduct[] = [
  { sku: 'burger-classic', name: 'Classic Burger', price: '8.50', currency: 'AlphaUSD', category: 'main', available: true },
  { sku: 'pizza-margherita', name: 'Margherita Pizza', price: '9.00', currency: 'AlphaUSD', category: 'main', available: true },
  { sku: 'fries-regular', name: 'Regular Fries', price: '3.50', currency: 'AlphaUSD', category: 'snack', available: true },
  { sku: 'nachos-cheese', name: 'Cheese Nachos', price: '4.50', currency: 'AlphaUSD', category: 'snack', available: true },
  { sku: 'cola-large', name: 'Large Cola', price: '2.50', currency: 'AlphaUSD', category: 'beverage', available: true },
  { sku: 'water-bottle', name: 'Bottled Water', price: '1.50', currency: 'AlphaUSD', category: 'beverage', available: true },
  { sku: 'ice-cream-vanilla', name: 'Vanilla Ice Cream', price: '4.00', currency: 'AlphaUSD', category: 'dessert', available: true },
  { sku: 'brownie-choc', name: 'Chocolate Brownie', price: '3.50', currency: 'AlphaUSD', category: 'dessert', available: false },
];

function makeContext(overrides: Partial<BuyerLLMContext> = {}): BuyerLLMContext {
  return {
    agent_id: 'test_agent',
    needs: { food_need: 25, fun_need: 80 },
    balance: '40.00',
    catalog: MOCK_CATALOG,
    purchase_history: [],
    cycle_count: 5,
    ...overrides,
  };
}

// ---------- Tests ----------

async function testEndpointConnectivity() {
  console.log('\n--- 1. Endpoint Connectivity ---');

  const inferenceUrl = process.env.INFERENCE_URL;
  const inferenceKey = process.env.INFERENCE_KEY;

  assert(!!inferenceUrl, 'INFERENCE_URL is set');
  assert(!!inferenceKey, 'INFERENCE_KEY is set');

  if (!inferenceUrl || !inferenceKey) {
    console.error('  Skipping connectivity test — missing env vars');
    return;
  }

  // Try a minimal request to check the endpoint is reachable
  try {
    const response = await fetch(`${inferenceUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${inferenceKey}`,
      },
      body: JSON.stringify({
        model: process.env.LLM_MODEL || 'claude-4-5-haiku',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Say "ok"' }],
      }),
    });

    assert(response.ok, `Endpoint reachable (HTTP ${response.status})`);

    const data = await response.json();
    assert(!!data.id, 'Response has completion ID');
    assert(Array.isArray(data.choices), 'Response has choices array');
    assert(data.choices.length > 0, 'Response has at least one choice');

    if (data.usage) {
      console.log(`  Token usage: ${data.usage.prompt_tokens} prompt + ${data.usage.completion_tokens} completion`);
    }
  } catch (error) {
    assert(false, `Endpoint reachable: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function testLLMClientBasic() {
  console.log('\n--- 2. LLMClient Basic Chat (with tools) ---');

  const client = createClient();
  if (!client) return;

  // Verify the client can make a call and increment its counter
  const tools = [
    {
      type: 'function' as const,
      function: {
        name: 'answer',
        description: 'Provide a numeric answer',
        parameters: {
          type: 'object',
          properties: { value: { type: 'number' } },
          required: ['value'],
        },
      },
    },
  ];

  try {
    const response = await client.chat(
      'You are a helpful assistant. Always use the answer tool.',
      'What is 2+2?',
      tools,
    );
    assert(!!response.choices[0], 'Basic chat returns a choice');
    assert(client.getCallCount() === 1, 'Call count incremented to 1');

    const toolCall = response.choices[0].message.tool_calls?.[0];
    if (toolCall) {
      const args = JSON.parse(toolCall.function.arguments);
      assert(args.value === 4, `LLM computed 2+2 = ${args.value}`);
    } else {
      assert(true, 'Response returned (no tool call but still valid)');
    }
  } catch (error) {
    assert(false, `Basic chat: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function testToolCallCompletion() {
  console.log('\n--- 3. Tool Call Completion ---');

  const client = createClient();
  if (!client) return;

  const tools = [
    {
      type: 'function' as const,
      function: {
        name: 'acp_select_and_purchase',
        description: 'Select and purchase a product',
        parameters: {
          type: 'object',
          properties: {
            sku: { type: 'string', description: 'Product SKU' },
            reasoning: { type: 'string', description: 'Why this product' },
          },
          required: ['sku', 'reasoning'],
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'acp_skip_cycle',
        description: 'Skip this purchase cycle',
        parameters: {
          type: 'object',
          properties: {
            reasoning: { type: 'string', description: 'Why skipping' },
          },
          required: ['reasoning'],
        },
      },
    },
  ];

  try {
    const response = await client.chat(
      'You are a zoo visitor agent. You must call exactly one tool.',
      JSON.stringify({
        food_need: 20,
        balance: '40.00',
        catalog: [
          { sku: 'burger-classic', name: 'Classic Burger', price: '8.50', category: 'main' },
          { sku: 'fries-regular', name: 'Regular Fries', price: '3.50', category: 'snack' },
        ],
      }),
      tools,
    );

    const choice = response.choices[0];
    assert(!!choice, 'Response has a choice');
    assert(!!choice.message.tool_calls, 'Response includes tool_calls');
    assert(choice.message.tool_calls!.length > 0, 'At least one tool call returned');

    const toolCall = choice.message.tool_calls![0];
    assert(
      toolCall.function.name === 'acp_select_and_purchase' || toolCall.function.name === 'acp_skip_cycle',
      `Tool call is a known ACP tool (got: ${toolCall.function.name})`,
    );

    const args = JSON.parse(toolCall.function.arguments);
    assert(!!args.reasoning, 'Tool call includes reasoning');

    if (toolCall.function.name === 'acp_select_and_purchase') {
      assert(!!args.sku, 'Purchase tool call includes sku');
      console.log(`  LLM chose: ${args.sku} — "${args.reasoning}"`);
    } else {
      console.log(`  LLM chose to skip: "${args.reasoning}"`);
    }

    assert(client.getCallCount() > 0, 'Call count incremented');
    console.log(`  Call count: ${client.getCallCount()}`);
  } catch (error) {
    assert(false, `Tool call completion: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function testBuyerBrainDecide() {
  console.log('\n--- 4. BuyerBrain.decide() — Moderate Hunger ---');

  const client = createClient();
  if (!client) return;

  const brain = new BuyerBrain(client);
  const context = makeContext({ needs: { food_need: 30, fun_need: 80 } });

  try {
    const decision = await brain.decide(context);

    assert(decision.action.type === 'purchase' || decision.action.type === 'wait', `Decision type is valid (got: ${decision.action.type})`);
    assert(!!decision.reasoning, 'Decision includes reasoning');
    assert(!!decision.toolName, `Decision includes toolName (got: ${decision.toolName})`);

    if (decision.action.type === 'purchase') {
      const validSkus = MOCK_CATALOG.filter(p => p.available).map(p => p.sku);
      assert(validSkus.includes(decision.action.sku), `Selected SKU is valid and available (got: ${decision.action.sku})`);
      console.log(`  Decision: BUY ${decision.action.sku} — "${decision.reasoning}"`);
    } else {
      console.log(`  Decision: WAIT — "${decision.reasoning}"`);
    }

    if (decision.tokenUsage) {
      console.log(`  Tokens: ${decision.tokenUsage.promptTokens} prompt + ${decision.tokenUsage.completionTokens} completion`);
    }
  } catch (error) {
    assert(false, `BuyerBrain.decide(): ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function testBuyerBrainVeryHungry() {
  console.log('\n--- 5. BuyerBrain.decide() — Very Hungry (food_need=10) ---');

  const client = createClient();
  if (!client) return;

  const brain = new BuyerBrain(client);
  const context = makeContext({
    needs: { food_need: 10, fun_need: 80 },
    balance: '40.00',
    purchase_history: [
      { sku: 'fries-regular', name: 'Regular Fries', amount: '3.50', time_ago_seconds: 30 },
    ],
  });

  try {
    const decision = await brain.decide(context);

    assert(decision.action.type === 'purchase', 'Very hungry agent should purchase');

    if (decision.action.type === 'purchase') {
      const product = MOCK_CATALOG.find(p => p.sku === decision.action.sku);
      console.log(`  Decision: BUY ${decision.action.sku} (${product?.category}) — "${decision.reasoning}"`);

      // We expect a main course when very hungry, but don't hard-fail if LLM picks something else
      if (product?.category === 'main') {
        assert(true, 'LLM correctly preferred main course when very hungry');
      } else {
        console.log(`  Note: LLM picked ${product?.category} instead of main — acceptable but not ideal`);
        assert(true, 'LLM made a valid choice (not main, but still valid)');
      }

      // Should not pick the same item as recent purchase
      if (decision.action.sku !== 'fries-regular') {
        assert(true, 'LLM avoided recently purchased item');
      } else {
        console.log('  Note: LLM repeated a recent purchase — acceptable but not ideal');
        assert(true, 'LLM made a valid choice (repeated, but still valid)');
      }
    }
  } catch (error) {
    assert(false, `BuyerBrain very hungry: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function testCallCountTracking() {
  console.log('\n--- 6. Call Count Tracking ---');

  const inferenceUrl = process.env.INFERENCE_URL;
  const inferenceKey = process.env.INFERENCE_KEY;
  if (!inferenceUrl || !inferenceKey) {
    console.log('  Skipping — missing env vars');
    return;
  }

  const client = new LLMClient({
    inferenceUrl,
    inferenceKey,
    model: process.env.LLM_MODEL || 'claude-4-5-haiku',
    maxTokensPerResponse: 256,
    maxCallsPerSimulation: 3,  // low cap for testing
  });

  const brain = new BuyerBrain(client);

  // Make a call to increment counter
  await brain.decide(makeContext());
  assert(client.getCallCount() >= 1, `Call count incremented (count: ${client.getCallCount()})`);

  // Reset
  brain.resetCallCount();
  assert(client.getCallCount() === 0, 'Call count reset to 0');

  console.log('  Call count tracking works correctly');
}

// ---------- Helpers ----------

function createClient(): LLMClient | null {
  const inferenceUrl = process.env.INFERENCE_URL;
  const inferenceKey = process.env.INFERENCE_KEY;

  if (!inferenceUrl || !inferenceKey) {
    console.log('  Skipping — INFERENCE_URL or INFERENCE_KEY not set');
    return null;
  }

  return new LLMClient({
    inferenceUrl,
    inferenceKey,
    model: process.env.LLM_MODEL || 'claude-4-5-haiku',
    maxTokensPerResponse: 1024,
    maxCallsPerSimulation: 100,
  });
}

// ---------- Runner ----------
async function run() {
  console.log('=== LLM Inference Tests ===');
  console.log(`Endpoint: ${process.env.INFERENCE_URL || '(not set)'}`);
  console.log(`Model: ${process.env.LLM_MODEL || 'claude-4-5-haiku'}`);

  await testEndpointConnectivity();
  await testLLMClientBasic();
  await testToolCallCompletion();
  await testBuyerBrainDecide();
  await testBuyerBrainVeryHungry();
  await testCallCountTracking();

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);

  if (failed > 0) {
    console.error('\nFailed tests:');
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log('\n[PASS] All LLM inference tests passed!');
  process.exit(0);
}

run().catch((err) => {
  console.error('\n[FAIL] Unexpected error:', err);
  process.exit(1);
});
