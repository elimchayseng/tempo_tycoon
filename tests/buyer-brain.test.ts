/**
 * BuyerBrain tests — mocked LLM responses, fallback behavior, invalid SKU handling.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BuyerBrain } from '../agents/llm/buyer-brain.js';
import type { LLMClient, ChatCompletionResponse, Tool } from '../agents/llm/llm-client.js';
import type { BuyerLLMContext, MerchantProduct } from '../agents/types.js';

function mockLLMClient(overrides: Partial<LLMClient> = {}): LLMClient {
  return {
    model: 'test-model',
    chat: vi.fn(),
    resetCallCount: vi.fn(),
    getCallCount: vi.fn(() => 0),
    ...overrides,
  } as unknown as LLMClient;
}

function makeCatalog(): MerchantProduct[] {
  return [
    { sku: 'burger-1', name: 'Burger', price: '5.00', currency: 'AlphaUSD', category: 'main', available: true },
    { sku: 'soda-1', name: 'Soda', price: '2.50', currency: 'AlphaUSD', category: 'beverage', available: true },
    { sku: 'sold-out', name: 'Sold Out', price: '1.00', currency: 'AlphaUSD', category: 'snack', available: false },
  ];
}

function makeContext(overrides: Partial<BuyerLLMContext> = {}): BuyerLLMContext {
  return {
    agent_id: 'guest_1',
    needs: { food_need: 25, fun_need: 100 },
    balance: '50.00',
    catalog: makeCatalog(),
    purchase_history: [],
    cycle_count: 5,
    ...overrides,
  };
}

function purchaseResponse(sku: string, reasoning: string): ChatCompletionResponse {
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
            name: 'acp_select_and_purchase',
            arguments: JSON.stringify({ merchant_category: 'food', sku, reasoning }),
          },
        }],
      },
      finish_reason: 'stop',
    }],
    usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
  };
}

function skipResponse(reasoning: string): ChatCompletionResponse {
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
            name: 'acp_skip_cycle',
            arguments: JSON.stringify({ reasoning }),
          },
        }],
      },
      finish_reason: 'stop',
    }],
  };
}

describe('BuyerBrain', () => {
  it('returns purchase decision when LLM selects a valid SKU', async () => {
    const client = mockLLMClient({
      chat: vi.fn().mockResolvedValue(purchaseResponse('burger-1', 'I am hungry')),
    });
    const brain = new BuyerBrain(client);
    const result = await brain.decide(makeContext());

    expect(result.action.type).toBe('purchase');
    if (result.action.type === 'purchase') {
      expect(result.action.sku).toBe('burger-1');
    }
    expect(result.toolName).toBe('acp_select_and_purchase');
    expect(result.model).toBe('test-model');
    expect(result.tokenUsage).toBeDefined();
  });

  it('returns wait decision when LLM chooses to skip', async () => {
    const client = mockLLMClient({
      chat: vi.fn().mockResolvedValue(skipResponse('Not hungry yet')),
    });
    const brain = new BuyerBrain(client);
    const result = await brain.decide(makeContext());

    expect(result.action.type).toBe('wait');
    expect(result.toolName).toBe('acp_skip_cycle');
  });

  it('falls back when LLM selects an unavailable SKU', async () => {
    const client = mockLLMClient({
      chat: vi.fn().mockResolvedValue(purchaseResponse('sold-out', 'Looks good')),
    });
    const brain = new BuyerBrain(client);
    const result = await brain.decide(makeContext());

    // Should fall back because 'sold-out' is unavailable
    expect(result.toolName).toBe('fallback');
    expect(result.action.type).toBe('wait');
  });

  it('falls back when LLM selects a SKU beyond budget', async () => {
    const client = mockLLMClient({
      chat: vi.fn().mockResolvedValue(purchaseResponse('burger-1', 'Yum')),
    });
    const brain = new BuyerBrain(client);
    const result = await brain.decide(makeContext({ balance: '1.00' }));

    // Should fall back because $5 > $1 balance
    expect(result.toolName).toBe('fallback');
    expect(result.action.type).toBe('wait');
  });

  it('falls back when LLM throws an error', async () => {
    const client = mockLLMClient({
      chat: vi.fn().mockRejectedValue(new Error('LLM timeout')),
    });
    const brain = new BuyerBrain(client);
    const result = await brain.decide(makeContext());

    expect(result.toolName).toBe('fallback');
    expect(result.reasoning).toContain('fallback');
  });

  it('falls back when LLM returns no tool calls', async () => {
    const client = mockLLMClient({
      chat: vi.fn().mockResolvedValue({
        id: 'resp-3',
        choices: [{ index: 0, message: { role: 'assistant', content: 'No tools', tool_calls: [] }, finish_reason: 'stop' }],
      }),
    });
    const brain = new BuyerBrain(client);
    const result = await brain.decide(makeContext());

    expect(result.toolName).toBe('fallback');
  });

  it('resetCallCount delegates to LLM client', () => {
    const resetFn = vi.fn();
    const client = mockLLMClient({ resetCallCount: resetFn });
    const brain = new BuyerBrain(client);
    brain.resetCallCount();
    expect(resetFn).toHaveBeenCalledOnce();
  });
});
