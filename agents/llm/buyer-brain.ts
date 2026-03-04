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
      name: 'acp_select_and_purchase',
      description:
        'Select a product from the merchant catalog and initiate an ACP purchase. ' +
        'This triggers: checkout session creation → on-chain AlphaUSD payment → merchant verification.',
      parameters: {
        type: 'object',
        properties: {
          merchant_category: {
            type: 'string',
            description: 'Merchant category (e.g. "food")',
          },
          sku: {
            type: 'string',
            description: 'Product SKU to purchase',
          },
          reasoning: {
            type: 'string',
            description: 'Step-by-step reasoning for this choice, keep it very short, and pretend you are a guest visting a zoo, use language like internal human thoughts about the purchase you will make (shown in UI)',
          },
        },
        required: ['merchant_category', 'sku', 'reasoning'],
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
  async decide(context: BuyerLLMContext): Promise<BuyerDecision> {
    const userMessage = this.buildUserMessage(context);

    try {
      const response = await this.llmClient.chat(
        this.systemPrompt,
        userMessage,
        BUYER_ACP_TOOLS,
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

      if (toolName === 'acp_select_and_purchase') {
        return this.handlePurchaseCall(args, context, tokenUsage);
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
      }));

    return JSON.stringify({
      agent_id: context.agent_id,
      food_need: context.needs.food_need,
      balance: context.balance,
      cycle: context.cycle_count,
      catalog: catalogSummary,
      recent_purchases: context.purchase_history,
    });
  }

  private handlePurchaseCall(
    args: { merchant_category?: string; sku?: string; reasoning?: string },
    context: BuyerLLMContext,
    tokenUsage?: { promptTokens: number; completionTokens: number },
  ): BuyerDecision {
    const sku = args.sku;
    const reasoning = args.reasoning || 'No reasoning provided';

    if (!sku) {
      throw new Error('LLM tool call missing required sku parameter');
    }

    // Validate SKU exists and is available
    const product = context.catalog.find((p) => p.sku === sku && p.available);
    if (!product) {
      log.warn(`[${context.agent_id}] LLM selected invalid/unavailable SKU: ${sku}`);
      throw new Error(`Invalid or unavailable SKU: ${sku}`);
    }

    // Validate agent can afford the item
    const price = parseFloat(product.price);
    const balance = parseFloat(context.balance);
    if (price > balance) {
      log.warn(`[${context.agent_id}] LLM selected item beyond budget: $${product.price} > $${context.balance}`);
      throw new Error(`Product price $${product.price} exceeds balance $${context.balance}`);
    }

    log.info(`[${context.agent_id}] LLM chose: ${product.name} ($${product.price}) — ${reasoning}`);

    return {
      action: { type: 'purchase', sku, reason: reasoning },
      reasoning,
      toolName: 'acp_select_and_purchase',
      model: this.llmClient.model,
      tokenUsage,
    };
  }
}
