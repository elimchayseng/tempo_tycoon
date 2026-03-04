import { createLogger } from '../../shared/logger.js';
import { LLMClient, type Tool } from './llm-client.js';
import { buildBuyerSystemPrompt } from './prompts/buyer-system.js';
import type { BuyerDecision, BuyerLLMContext } from '../types.js';

const log = createLogger('BuyerBrain');

/**
 * ACP-aligned tool definitions for the buyer LLM.
 *
 * Tool names mirror Agentic Commerce Protocol actions so the mapping is
 * clear in logs, UI, and when visualizing the "brain processing" flow.
 */
const BUYER_ACP_TOOLS: Tool[] = [
  {
    type: 'function',
    function: {
      name: 'acp_purchase_cart',
      description:
        'Purchase a cart of 1-3 items from the merchant catalog via ACP. ' +
        'This triggers: checkout session creation → on-chain AlphaUSD payment → merchant verification.',
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            description: 'Array of items to purchase (1-3 items)',
            items: {
              type: 'object',
              properties: {
                sku: {
                  type: 'string',
                  description: 'Product SKU to purchase',
                },
                quantity: {
                  type: 'number',
                  description: 'Quantity of this item (usually 1)',
                },
              },
              required: ['sku', 'quantity'],
            },
            minItems: 1,
            maxItems: 3,
          },
          reasoning: {
            type: 'string',
            description: 'Step-by-step reasoning for this choice, keep it very short, and pretend you are a guest visiting a zoo, use language like internal human thoughts about the purchase you will make (shown in UI)',
          },
        },
        required: ['items', 'reasoning'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'acp_skip_cycle',
      description: 'Decide not to make any ACP purchase this cycle.',
      parameters: {
        type: 'object',
        properties: {
          reasoning: {
            type: 'string',
            description: 'Why no purchase is needed right now, keep it at short as possible (shown in UI)',
          },
        },
        required: ['reasoning'],
      },
    },
  },
];

export class BuyerBrain {
  private readonly llmClient: LLMClient;
  private readonly systemPrompt: string;

  constructor(llmClient: LLMClient) {
    this.llmClient = llmClient;
    this.systemPrompt = buildBuyerSystemPrompt({
      availableMerchants: ['food'],
      needTypes: ['food_need'],
    });
    log.info('BuyerBrain initialized');
  }

  /**
   * Ask the LLM to decide what to buy (or skip) given the agent's current context.
   *
   * On any error the caller falls back to the deterministic DecisionEngine.
   */
  async decide(context: BuyerLLMContext, signal?: AbortSignal): Promise<BuyerDecision> {
    const userMessage = this.buildUserMessage(context);

    try {
      const response = await this.llmClient.chat(
        this.systemPrompt,
        userMessage,
        BUYER_ACP_TOOLS,
        signal,
      );

      const choice = response.choices[0];
      if (!choice?.message?.tool_calls?.length) {
        throw new Error('LLM returned no tool calls');
      }

      const toolCall = choice.message.tool_calls[0];
      const toolName = toolCall.function.name;
      const args = JSON.parse(toolCall.function.arguments);

      const tokenUsage = response.usage
        ? { promptTokens: response.usage.prompt_tokens, completionTokens: response.usage.completion_tokens }
        : undefined;

      if (toolName === 'acp_purchase_cart') {
        return this.handleCartCall(args, context, tokenUsage);
      }

      if (toolName === 'acp_skip_cycle') {
        return {
          action: { type: 'wait', reason: args.reasoning || 'LLM chose to skip' },
          reasoning: args.reasoning || 'No purchase needed',
          toolName,
          model: this.llmClient.model,
          tokenUsage,
        };
      }

      throw new Error(`Unknown tool call: ${toolName}`);
    } catch (error) {
      log.error(`[${context.agent_id}] BuyerBrain error:`, error);
      return {
        action: { type: 'wait', reason: 'LLM unavailable, using deterministic fallback' },
        reasoning: 'LLM unavailable, using deterministic fallback',
        toolName: 'fallback',
        tokenUsage: undefined,
      };
    }
  }

  /** Reset LLM call counter (called on simulation restart). */
  resetCallCount(): void {
    this.llmClient.resetCallCount();
  }

  getCallCount(): number {
    return this.llmClient.getCallCount();
  }

  // ── private ──────────────────────────────────────────────

  private buildUserMessage(context: BuyerLLMContext): string {
    const catalogSummary = context.catalog
      .filter((p) => p.available)
      .map((p) => ({
        sku: p.sku,
        name: p.name,
        price: p.price,
        category: p.category,
        satisfaction_value: p.satisfaction_value,
      }));

    // Pre-compute the hunger gap so the LLM doesn't have to do subtraction
    const foodNeed = context.needs.food_need;
    const hungerGap = Math.max(0, 80 - foodNeed);       // how much satisfaction to reach ~80
    const maxUsefulGap = Math.max(0, 100 - foodNeed);    // anything beyond this is wasted

    return JSON.stringify({
      agent_id: context.agent_id,
      food_need: foodNeed,
      hunger_gap: hungerGap,
      max_useful_satisfaction: maxUsefulGap,
      balance: context.balance,
      cycle: context.cycle_count,
      catalog: catalogSummary,
      recent_purchases: context.purchase_history,
    });
  }

  private handleCartCall(
    args: { items?: Array<{ sku: string; quantity: number }>; reasoning?: string },
    context: BuyerLLMContext,
    tokenUsage?: { promptTokens: number; completionTokens: number },
  ): BuyerDecision {
    const items = args.items;
    const reasoning = args.reasoning || 'No reasoning provided';

    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new Error('LLM tool call missing required items parameter');
    }

    if (items.length > 3) {
      throw new Error('Cart cannot exceed 3 items');
    }

    let totalCost = 0;
    const balance = parseFloat(context.balance);

    // Validate all items exist and are available
    for (const item of items) {
      if (!item.sku) {
        throw new Error('LLM tool call missing required sku in item');
      }

      const product = context.catalog.find((p) => p.sku === item.sku && p.available);
      if (!product) {
        log.warn(`[${context.agent_id}] LLM selected invalid/unavailable SKU: ${item.sku}`);
        throw new Error(`Invalid or unavailable SKU: ${item.sku}`);
      }

      totalCost += parseFloat(product.price) * (item.quantity || 1);
    }

    // Validate agent can afford the cart
    if (totalCost > balance) {
      log.warn(`[${context.agent_id}] LLM cart total $${totalCost.toFixed(2)} exceeds balance $${context.balance}`);
      throw new Error(`Cart total $${totalCost.toFixed(2)} exceeds balance $${context.balance}`);
    }

    const itemSummary = items.map(i => `${i.sku}x${i.quantity || 1}`).join(', ');
    log.info(`[${context.agent_id}] LLM chose cart: [${itemSummary}] ($${totalCost.toFixed(2)}) — ${reasoning}`);

    return {
      action: {
        type: 'purchase',
        items: items.map(i => ({ sku: i.sku, quantity: i.quantity || 1 })),
        reason: reasoning,
      },
      reasoning,
      toolName: 'acp_purchase_cart',
      model: this.llmClient.model,
      tokenUsage,
    };
  }
}
