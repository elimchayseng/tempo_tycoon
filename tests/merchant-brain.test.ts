/**
 * MerchantBrain tests — mocked LLM responses, price guardrails, fallback behavior.
 */
import { describe, it, expect, vi } from 'vitest';
import { MerchantBrain } from '../agents/llm/merchant-brain.js';
import type { LLMClient, ChatCompletionResponse } from '../agents/llm/llm-client.js';
import type { MerchantLLMContext } from '../agents/types.js';

function mockLLMClient(overrides: Partial<LLMClient> = {}): LLMClient {
  return {
    model: 'test-model',
    chat: vi.fn(),
    resetCallCount: vi.fn(),
    getCallCount: vi.fn(() => 0),
    ...overrides,
  } as unknown as LLMClient;
}

function makeContext(overrides: Partial<MerchantLLMContext> = {}): MerchantLLMContext {
  return {
    agent_id: 'merchant_a',
    balance: '100.00',
    total_revenue: '50.00',
    total_cost: '20.00',
    profit: '30.00',
    inventory: [
      {
        sku: 'burger-1', name: 'Burger', current_price: '5.00', cost_basis: '4.00',
        base_price: '5.00', stock: 3, max_stock: 5, satisfaction_value: 70,
      },
      {
        sku: 'soda-1', name: 'Soda', current_price: '2.50', cost_basis: '1.50',
        base_price: '2.50', stock: 1, max_stock: 5, satisfaction_value: 30,
      },
    ],
    demand_summaries: [
      { sku: 'burger-1', name: 'Burger', sales_count: 3, total_revenue: 15, velocity_per_minute: 0.6, last_sale_ms_ago: 5000 },
    ],
    guardrails: { max_change_pct: 30, price_floor_margin: 0.25, price_ceiling_multiplier: 3 },
    brain_cycle: 1,
    ...overrides,
  };
}

function priceAdjustResponse(
  updates: Array<{ sku: string; new_price: string }>,
  reasoning: string,
): ChatCompletionResponse {
  return {
    id: 'resp-1',
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: 'tc-1',
          type: 'function',
          function: {
            name: 'acp_adjust_prices',
            arguments: JSON.stringify({ updates, reasoning }),
          },
        }],
      },
      finish_reason: 'stop',
    }],
    usage: { prompt_tokens: 200, completion_tokens: 30, total_tokens: 230 },
  };
}

function restockResponse(skus: string[], reasoning: string): ChatCompletionResponse {
  return {
    id: 'resp-2',
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: 'tc-2',
          type: 'function',
          function: {
            name: 'acp_restock_inventory',
            arguments: JSON.stringify({ skus, reasoning }),
          },
        }],
      },
      finish_reason: 'stop',
    }],
    usage: { prompt_tokens: 200, completion_tokens: 20, total_tokens: 220 },
  };
}

function skipResponse(reasoning: string): ChatCompletionResponse {
  return {
    id: 'resp-3',
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: 'tc-3',
          type: 'function',
          function: {
            name: 'acp_skip_cycle',
            arguments: JSON.stringify({ reasoning }),
          },
        }],
      },
      finish_reason: 'stop',
    }],
  };
}

describe('MerchantBrain', () => {
  it('returns adjust_prices decision for valid price updates', async () => {
    const client = mockLLMClient({
      chat: vi.fn().mockResolvedValue(
        priceAdjustResponse([{ sku: 'burger-1', new_price: '5.50' }], 'High demand'),
      ),
    });
    const brain = new MerchantBrain(client);
    const result = await brain.decide(makeContext());

    expect(result.action.type).toBe('adjust_prices');
    if (result.action.type === 'adjust_prices') {
      expect(result.action.updates).toHaveLength(1);
      expect(result.action.updates[0].sku).toBe('burger-1');
      expect(result.action.updates[0].new_price).toBe('5.50');
    }
    expect(result.toolName).toBe('acp_adjust_prices');
    expect(result.model).toBe('test-model');
    expect(result.tokenUsage).toBeDefined();
  });

  it('returns restock decision', async () => {
    const client = mockLLMClient({
      chat: vi.fn().mockResolvedValue(
        restockResponse(['soda-1'], 'Low stock on soda'),
      ),
    });
    const brain = new MerchantBrain(client);
    const result = await brain.decide(makeContext());

    expect(result.action.type).toBe('restock');
    if (result.action.type === 'restock') {
      expect(result.action.skus).toEqual(['soda-1']);
    }
    expect(result.toolName).toBe('acp_restock_inventory');
  });

  it('returns wait decision when LLM skips cycle', async () => {
    const client = mockLLMClient({
      chat: vi.fn().mockResolvedValue(skipResponse('Everything looks fine')),
    });
    const brain = new MerchantBrain(client);
    const result = await brain.decide(makeContext());

    expect(result.action.type).toBe('wait');
    expect(result.toolName).toBe('acp_skip_cycle');
  });

  it('clamps price above ceiling to ceiling', async () => {
    // base_price is 5.00, ceiling = 3x = 15.00
    // current_price is 5.00, max increase = 30% = 6.50
    // Propose 20.00 → should clamp to 6.50 (min of ceiling 15 and max_increase 6.50)
    const client = mockLLMClient({
      chat: vi.fn().mockResolvedValue(
        priceAdjustResponse([{ sku: 'burger-1', new_price: '20.00' }], 'Gouge prices'),
      ),
    });
    const brain = new MerchantBrain(client);
    const result = await brain.decide(makeContext());

    expect(result.action.type).toBe('adjust_prices');
    if (result.action.type === 'adjust_prices') {
      expect(parseFloat(result.action.updates[0].new_price)).toBe(6.50);
    }
  });

  it('clamps price below floor to floor', async () => {
    // cost_basis is 4.00, floor = 4.00 + 0.25 = 4.25
    // current_price is 5.00, max decrease = 30% = 3.50
    // Propose 1.00 → should clamp to 4.25 (max of floor 4.25 and max_decrease 3.50)
    const client = mockLLMClient({
      chat: vi.fn().mockResolvedValue(
        priceAdjustResponse([{ sku: 'burger-1', new_price: '1.00' }], 'Fire sale'),
      ),
    });
    const brain = new MerchantBrain(client);
    const result = await brain.decide(makeContext());

    expect(result.action.type).toBe('adjust_prices');
    if (result.action.type === 'adjust_prices') {
      expect(parseFloat(result.action.updates[0].new_price)).toBe(4.25);
    }
  });

  it('falls back when LLM throws an error', async () => {
    const client = mockLLMClient({
      chat: vi.fn().mockRejectedValue(new Error('LLM timeout')),
    });
    const brain = new MerchantBrain(client);
    const result = await brain.decide(makeContext());

    expect(result.toolName).toBe('fallback');
    expect(result.action.type).toBe('wait');
  });

  it('falls back when LLM returns no tool calls', async () => {
    const client = mockLLMClient({
      chat: vi.fn().mockResolvedValue({
        id: 'resp-4',
        choices: [{ index: 0, message: { role: 'assistant', content: 'No tools', tool_calls: [] }, finish_reason: 'stop' }],
      }),
    });
    const brain = new MerchantBrain(client);
    const result = await brain.decide(makeContext());

    expect(result.toolName).toBe('fallback');
  });

  it('resetCallCount delegates to LLM client', () => {
    const resetFn = vi.fn();
    const client = mockLLMClient({ resetCallCount: resetFn });
    const brain = new MerchantBrain(client);
    brain.resetCallCount();
    expect(resetFn).toHaveBeenCalledOnce();
  });
});
