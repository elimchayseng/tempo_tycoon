import { createLogger } from '../../shared/logger.js';
import { LLMClient, type Tool } from './llm-client.js';
import { buildMerchantSystemPrompt } from './prompts/merchant-system.js';
import type { MerchantDecision, MerchantLLMContext, MerchantPriceUpdate } from '../types.js';

const log = createLogger('MerchantBrain');

// Price guardrail constants
const MAX_CHANGE_PCT = 0.30;         // +/-30% of current price per cycle
const PRICE_FLOOR_MARGIN = 0.25;     // cost_basis + $0.25 minimum
const PRICE_CEILING_MULTIPLIER = 3;  // 3x base_price maximum

/**
 * ACP-aligned tool definitions for the merchant LLM.
 */
const MERCHANT_ACP_TOOLS: Tool[] = [
  {
    type: 'function',
    function: {
      name: 'acp_adjust_prices',
      description:
        'Adjust prices for 1-5 menu items based on demand analysis. ' +
        'Each price update will be clamped to guardrail bounds.',
      parameters: {
        type: 'object',
        properties: {
          updates: {
            type: 'array',
            description: 'Array of price updates (1-5 items)',
            items: {
              type: 'object',
              properties: {
                sku: {
                  type: 'string',
                  description: 'Product SKU to re-price',
                },
                new_price: {
                  type: 'string',
                  description: 'New price as a decimal string (e.g. "4.50")',
                },
              },
              required: ['sku', 'new_price'],
            },
            minItems: 1,
            maxItems: 5,
          },
          reasoning: {
            type: 'string',
            description: 'Brief reasoning for these price changes (shown in UI)',
          },
        },
        required: ['updates', 'reasoning'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'acp_restock_inventory',
      description:
        'Restock one or more items from the Zoo Master supplier. ' +
        'Triggers an on-chain AlphaUSD payment for each item restocked.',
      parameters: {
        type: 'object',
        properties: {
          skus: {
            type: 'array',
            description: 'SKUs to restock (1-5 items)',
            items: { type: 'string' },
            minItems: 1,
            maxItems: 5,
          },
          reasoning: {
            type: 'string',
            description: 'Brief reasoning for restocking (shown in UI)',
          },
        },
        required: ['skus', 'reasoning'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'acp_skip_cycle',
      description: 'No action this cycle — prices and stock are fine.',
      parameters: {
        type: 'object',
        properties: {
          reasoning: {
            type: 'string',
            description: 'Why no action is needed right now (shown in UI)',
          },
        },
        required: ['reasoning'],
      },
    },
  },
];

export class MerchantBrain {
  private readonly llmClient: LLMClient;
  private readonly systemPrompt: string;

  constructor(llmClient: LLMClient) {
    this.llmClient = llmClient;
    this.systemPrompt = buildMerchantSystemPrompt({
      maxChangePct: MAX_CHANGE_PCT * 100,
      priceFloorMargin: PRICE_FLOOR_MARGIN,
      priceCeilingMultiplier: PRICE_CEILING_MULTIPLIER,
    });
    log.info('MerchantBrain initialized');
  }

  async decide(context: MerchantLLMContext, signal?: AbortSignal): Promise<MerchantDecision> {
    const userMessage = this.buildUserMessage(context);

    try {
      const response = await this.llmClient.chat(
        this.systemPrompt,
        userMessage,
        MERCHANT_ACP_TOOLS,
        signal,
      );

      const choice = response.choices[0];
      if (!choice?.message?.tool_calls?.length) {
        throw new Error('LLM returned no tool calls');
      }

      const toolCall = choice.message.tool_calls[0];
      const toolName = toolCall.function.name;
      const args = JSON.parse(toolCall.function.arguments);

      // Fallback: some models (e.g. Haiku) put reasoning in message content instead of tool args
      const contentFallback = typeof choice.message.content === 'string' ? choice.message.content.trim() : '';
      if (!args.reasoning && contentFallback) {
        args.reasoning = contentFallback;
      }

      const tokenUsage = response.usage
        ? { promptTokens: response.usage.prompt_tokens, completionTokens: response.usage.completion_tokens }
        : undefined;

      if (toolName === 'acp_adjust_prices') {
        return this.handlePriceAdjustment(args, context, tokenUsage);
      }

      if (toolName === 'acp_restock_inventory') {
        return this.handleRestock(args, tokenUsage);
      }

      if (toolName === 'acp_skip_cycle') {
        return {
          action: { type: 'wait', reason: args.reasoning || 'LLM chose to skip' },
          reasoning: args.reasoning || 'No action needed',
          toolName,
          model: this.llmClient.model,
          tokenUsage,
        };
      }

      throw new Error(`Unknown tool call: ${toolName}`);
    } catch (error) {
      log.error(`[${context.agent_id}] MerchantBrain error:`, error);
      return {
        action: { type: 'wait', reason: 'LLM unavailable, skipping cycle' },
        reasoning: 'LLM unavailable, skipping cycle',
        toolName: 'fallback',
        tokenUsage: undefined,
      };
    }
  }

  resetCallCount(): void {
    this.llmClient.resetCallCount();
  }

  getCallCount(): number {
    return this.llmClient.getCallCount();
  }

  // ── private ──────────────────────────────────────────────

  private buildUserMessage(context: MerchantLLMContext): string {
    // Pre-compute per-SKU price bounds for the LLM
    const inventoryWithBounds = context.inventory.map(item => {
      const currentPrice = parseFloat(item.current_price);
      const costBasis = parseFloat(item.cost_basis);
      const basePrice = parseFloat(item.base_price);

      const floor = Math.max(costBasis + PRICE_FLOOR_MARGIN, currentPrice * (1 - MAX_CHANGE_PCT));
      const ceiling = Math.min(basePrice * PRICE_CEILING_MULTIPLIER, currentPrice * (1 + MAX_CHANGE_PCT));
      const restockCost = (item.max_stock - item.stock) * costBasis;

      return {
        ...item,
        price_floor: floor.toFixed(2),
        price_ceiling: ceiling.toFixed(2),
        max_increase: (currentPrice * MAX_CHANGE_PCT).toFixed(2),
        max_decrease: (currentPrice * MAX_CHANGE_PCT).toFixed(2),
        restock_cost: restockCost.toFixed(2),
      };
    });

    return JSON.stringify({
      agent_id: context.agent_id,
      balance: context.balance,
      total_revenue: context.total_revenue,
      profit: context.profit,
      brain_cycle: context.brain_cycle,
      inventory: inventoryWithBounds,
      demand: context.demand_summaries,
    });
  }

  private handlePriceAdjustment(
    args: { updates?: Array<{ sku: string; new_price: string }>; reasoning?: string },
    context: MerchantLLMContext,
    tokenUsage?: { promptTokens: number; completionTokens: number },
  ): MerchantDecision {
    const updates = args.updates;
    const reasoning = args.reasoning || 'No reasoning provided';

    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      throw new Error('LLM tool call missing required updates parameter');
    }

    // Clamp each price to guardrail bounds
    const clampedUpdates: MerchantPriceUpdate[] = [];

    for (const update of updates) {
      const inventoryItem = context.inventory.find(i => i.sku === update.sku);
      if (!inventoryItem) {
        log.warn(`[${context.agent_id}] LLM proposed price for unknown SKU: ${update.sku}, skipping`);
        continue;
      }

      const currentPrice = parseFloat(inventoryItem.current_price);
      const costBasis = parseFloat(inventoryItem.cost_basis);
      const basePrice = parseFloat(inventoryItem.base_price);

      let proposed = parseFloat(update.new_price);
      if (isNaN(proposed)) {
        log.warn(`[${context.agent_id}] Invalid price value "${update.new_price}" for ${update.sku}, skipping`);
        continue;
      }

      // Apply guardrails (clamp, not reject)
      const floor = costBasis + PRICE_FLOOR_MARGIN;
      const ceiling = basePrice * PRICE_CEILING_MULTIPLIER;
      const maxIncrease = currentPrice * (1 + MAX_CHANGE_PCT);
      const maxDecrease = currentPrice * (1 - MAX_CHANGE_PCT);

      const clamped = Math.min(ceiling, Math.min(maxIncrease, Math.max(floor, Math.max(maxDecrease, proposed))));

      if (Math.abs(clamped - proposed) > 0.005) {
        log.warn(`[${context.agent_id}] Price clamped for ${update.sku}: LLM proposed $${proposed.toFixed(2)}, clamped to $${clamped.toFixed(2)}`);
      }

      clampedUpdates.push({
        sku: update.sku,
        new_price: clamped.toFixed(2),
      });
    }

    if (clampedUpdates.length === 0) {
      return {
        action: { type: 'wait', reason: 'All proposed price changes were invalid' },
        reasoning,
        toolName: 'acp_adjust_prices',
        model: this.llmClient.model,
        tokenUsage,
      };
    }

    const summary = clampedUpdates.map(u => `${u.sku}→$${u.new_price}`).join(', ');
    log.info(`[${context.agent_id}] LLM price adjustments: [${summary}] — ${reasoning}`);

    return {
      action: {
        type: 'adjust_prices',
        updates: clampedUpdates,
        reason: reasoning,
      },
      reasoning,
      toolName: 'acp_adjust_prices',
      model: this.llmClient.model,
      tokenUsage,
    };
  }

  private handleRestock(
    args: { skus?: string[]; reasoning?: string },
    tokenUsage?: { promptTokens: number; completionTokens: number },
  ): MerchantDecision {
    const skus = args.skus;
    const reasoning = args.reasoning || 'No reasoning provided';

    if (!skus || !Array.isArray(skus) || skus.length === 0) {
      throw new Error('LLM tool call missing required skus parameter');
    }

    log.info(`[merchant_a] LLM restock request: [${skus.join(', ')}] — ${reasoning}`);

    return {
      action: {
        type: 'restock',
        skus,
        reason: reasoning,
      },
      reasoning,
      toolName: 'acp_restock_inventory',
      model: this.llmClient.model,
      tokenUsage,
    };
  }
}
