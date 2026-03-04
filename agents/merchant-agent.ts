import { createLogger } from '../shared/logger.js';
import { PaymentManager } from './payment-manager.js';
import { getAlphaUsdOnChainBalance, getWalletAddress } from './balance-sync.js';
import {
  initializeInventory,
  getSkusNeedingRestock,
  restockItem,
  getInventorySnapshot,
  getInventoryItem,
  updatePrice,
  decrementStock,
} from './merchant-inventory.js';
import { loadZooRegistry } from '../server/routes/zoo-shared.js';
import { recordSale as trackDemand, getSkuDemandSummaries } from './demand-tracker.js';
import type { MerchantBrain } from './llm/merchant-brain.js';
import type {
  MerchantConfig,
  MerchantState,
  MerchantStatus,
  MerchantLLMContext,
  RestockRecord,
  AgentEvent,
  AgentEventType,
} from './types.js';

const log = createLogger('MerchantAgent');

export class MerchantAgent {
  private readonly config: MerchantConfig;
  private readonly paymentManager: PaymentManager;
  private readonly brain: MerchantBrain | null;

  private state: MerchantState | null = null;
  private isRunning = false;
  private loopInterval: NodeJS.Timeout | null = null;
  private brainInterval: NodeJS.Timeout | null = null;
  private brainAbortController: AbortController | null = null;
  private errorCount = 0;
  private startTime: Date | null = null;

  private eventHandlers: Map<AgentEventType, Array<(event: AgentEvent) => void>> = new Map();

  constructor(config: MerchantConfig, brain?: MerchantBrain) {
    this.config = config;
    this.brain = brain ?? null;

    log.info(`[${config.agent_id}] Initializing merchant agent...`);

    this.paymentManager = new PaymentManager(config.agent_id, 'Merchant A');

    log.info(`[${config.agent_id}] Merchant agent initialized${this.brain ? ' (with LLM brain)' : ''}`);
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      log.warn(`[${this.config.agent_id}] Merchant agent already running`);
      return;
    }

    log.info(`[${this.config.agent_id}] Starting merchant agent...`);

    try {
      // Initialize inventory from zoo_map.json menu
      const registry = loadZooRegistry();
      const merchant = registry.merchants?.find((m: { category: string }) => m.category === 'food');
      if (merchant?.menu) {
        initializeInventory(merchant.menu);
      } else {
        throw new Error('No food merchant menu found in zoo registry');
      }

      // Initialize state
      this.state = {
        agent_id: this.config.agent_id,
        address: this.config.address,
        status: 'online',
        balance: '0.00',
        total_revenue: '0.00',
        total_cost: '0.00',
        profit: '0.00',
        restock_count: 0,
        sale_count: 0,
        cycle_count: 0,
        brain_cycle_count: 0,
        created_at: new Date(),
        updated_at: new Date(),
      };

      this.isRunning = true;
      this.startTime = new Date();
      this.scheduleNextCycle();

      // Start LLM brain cycle if brain is available
      if (this.brain) {
        this.scheduleBrainCycle();
      }

      log.info(`[${this.config.agent_id}] Merchant agent started successfully`);
      this.emitEvent('agent_started', { config: this.config });

    } catch (error) {
      log.error(`[${this.config.agent_id}] Failed to start merchant agent:`, error);
      await this.stop();
      throw error;
    }
  }

  async stop(): Promise<void> {
    log.info(`[${this.config.agent_id}] Stopping merchant agent...`);

    this.isRunning = false;

    if (this.loopInterval) {
      clearTimeout(this.loopInterval);
      this.loopInterval = null;
    }

    if (this.brainInterval) {
      clearTimeout(this.brainInterval);
      this.brainInterval = null;
    }

    // Abort any in-flight LLM call
    if (this.brainAbortController) {
      this.brainAbortController.abort();
      this.brainAbortController = null;
    }

    if (this.state) {
      this.state.status = 'offline';
    }

    log.info(`[${this.config.agent_id}] Merchant agent stopped`);
    this.emitEvent('agent_stopped', { reason: 'manual_stop' });
  }

  private async runCycle(): Promise<void> {
    if (!this.isRunning || !this.state) {
      return;
    }

    try {
      this.state.cycle_count += 1;
      log.debug(`[${this.config.agent_id}] Merchant cycle ${this.state.cycle_count}`);

      // Step 1: Sync balance from chain
      const currentBalance = await getAlphaUsdOnChainBalance(this.config.agent_id);
      this.state.balance = currentBalance.toFixed(2);

      // Step 2: Check for items needing restock
      const lowStockItems = getSkusNeedingRestock();

      // Step 3: Restock each low item
      for (const item of lowStockItems) {
        if (!this.isRunning) break;
        await this.executeRestock(item.sku);
      }

      // Step 4: Emit cycle completed with full state snapshot
      this.state.updated_at = new Date();
      this.emitEvent('merchant_cycle_completed', this.getStateSnapshot());

      this.scheduleNextCycle();

    } catch (error) {
      await this.handleError(error);
    }
  }

  private async executeRestock(sku: string): Promise<void> {
    if (!this.state) return;

    const item = getInventoryItem(sku);
    if (!item) return;

    const unitsNeeded = item.max_stock - item.stock;
    if (unitsNeeded <= 0) return;

    const costPerUnit = parseFloat(item.cost_basis);
    const totalCost = (unitsNeeded * costPerUnit).toFixed(2);

    log.info(`[${this.config.agent_id}] Restocking ${item.name}: ${unitsNeeded} units @ $${item.cost_basis}/unit = $${totalCost}`);

    this.state.status = 'restocking';
    this.emitEvent('restock_initiated', {
      sku: item.sku,
      name: item.name,
      units: unitsNeeded,
      cost: totalCost,
      current_stock: item.stock,
    });

    try {
      // Execute on-chain transfer: Merchant A → Zoo Master (supplier)
      const session = {
        session_id: `restock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        amount: totalCost,
        currency: 'AlphaUSD',
        recipient_address: this.config.zoo_master_address,
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        memo: `Restock: ${unitsNeeded}x ${item.name}`,
        items: [{
          sku: item.sku,
          name: item.name,
          price: item.cost_basis,
          quantity: unitsNeeded,
          satisfaction_value: 0,
        }],
      };

      const product = {
        sku: item.sku,
        name: item.name,
        price: item.cost_basis,
        currency: 'AlphaUSD',
        category: item.category,
        satisfaction_value: 0,
        available: true,
      };

      const paymentResult = await this.paymentManager.executeAlphaUsdTransferWithRetry(session, product);

      if (!paymentResult.success) {
        throw new Error(paymentResult.error || 'Restock payment failed');
      }

      // Payment succeeded — update inventory
      restockItem(sku);

      // Update financials
      const prevCost = parseFloat(this.state.total_cost);
      this.state.total_cost = (prevCost + parseFloat(totalCost)).toFixed(2);
      this.state.profit = (parseFloat(this.state.total_revenue) - parseFloat(this.state.total_cost)).toFixed(2);
      this.state.restock_count += 1;
      this.state.status = 'online';

      // Re-read balance from chain
      const postBalance = await getAlphaUsdOnChainBalance(this.config.agent_id);
      this.state.balance = postBalance.toFixed(2);

      const record: RestockRecord = {
        restock_id: `restock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        sku: item.sku,
        name: item.name,
        units: unitsNeeded,
        cost: totalCost,
        tx_hash: paymentResult.tx_hash || 'unknown',
        block_number: paymentResult.block_number || 'unknown',
        fee_ausd: paymentResult.fee_ausd,
        fee_payer: paymentResult.fee_payer,
        completed_at: new Date(),
      };

      log.info(`[${this.config.agent_id}] Restock completed: ${item.name} +${unitsNeeded} units ($${totalCost})`);

      this.emitEvent('restock_completed', {
        record,
        new_balance: this.state.balance,
        inventory: getInventorySnapshot(),
      });

    } catch (error) {
      log.error(`[${this.config.agent_id}] Restock failed for ${item.name}:`, error);

      this.state.status = 'online';

      this.emitEvent('restock_failed', {
        sku: item.sku,
        name: item.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  recordSale(sku: string, amount: string): void {
    if (!this.state) return;

    const prevRevenue = parseFloat(this.state.total_revenue);
    this.state.total_revenue = (prevRevenue + parseFloat(amount)).toFixed(2);
    this.state.profit = (parseFloat(this.state.total_revenue) - parseFloat(this.state.total_cost)).toFixed(2);
    this.state.sale_count += 1;

    // Track sale in demand tracker for LLM brain analysis
    const item = getInventoryItem(sku);
    trackDemand({
      sku,
      name: item?.name ?? sku,
      amount,
      timestamp: Date.now(),
    });

    log.info(`[${this.config.agent_id}] Sale recorded: ${sku} $${amount} (revenue=$${this.state.total_revenue}, profit=$${this.state.profit})`);

    this.emitEvent('sale_recorded', {
      sku,
      amount,
      total_revenue: this.state.total_revenue,
      total_cost: this.state.total_cost,
      profit: this.state.profit,
    });

    // Broadcast updated state immediately so the UI reflects the sale
    this.emitEvent('merchant_cycle_completed', this.getStateSnapshot());
  }

  // ── Brain Cycle ──────────────────────────────────────────

  private scheduleBrainCycle(): void {
    if (!this.isRunning || !this.brain) return;

    const interval = this.config.brain_interval_ms ?? 30_000;
    this.brainInterval = setTimeout(() => {
      this.runBrainCycle()
        .catch(err => log.error(`[${this.config.agent_id}] Brain cycle error:`, err))
        .finally(() => this.scheduleBrainCycle());
    }, interval);
  }

  private async runBrainCycle(): Promise<void> {
    if (!this.isRunning || !this.state || !this.brain) return;

    this.state.brain_cycle_count += 1;
    const cycleNum = this.state.brain_cycle_count;

    log.info(`[${this.config.agent_id}] Brain cycle #${cycleNum} - requesting LLM decision...`);

    // Sync balance before brain decision
    const currentBalance = await getAlphaUsdOnChainBalance(this.config.agent_id);
    this.state.balance = currentBalance.toFixed(2);

    const context = this.buildMerchantLLMContext();

    this.brainAbortController = new AbortController();
    const decision = await this.brain.decide(context, this.brainAbortController.signal);
    this.brainAbortController = null;

    log.info(`[${this.config.agent_id}] Brain decided: ${decision.toolName} - "${decision.reasoning}"`);

    if (decision.tokenUsage) {
      log.info(`[${this.config.agent_id}] LLM tokens: ${decision.tokenUsage.promptTokens}p / ${decision.tokenUsage.completionTokens}c (model: ${decision.model ?? 'unknown'})`);
    }

    // Emit LLM decision event (same shape as buyer decisions, reuses existing wiring)
    this.emitEvent('llm_decision', {
      agent_id: this.config.agent_id,
      toolName: decision.toolName,
      reasoning: decision.reasoning,
      action: decision.action,
      context_summary: this.buildContextSummary(),
      model: decision.model,
      tokenUsage: decision.tokenUsage,
    });

    // Dispatch action
    if (decision.action.type === 'adjust_prices') {
      await this.executePriceAdjustments(decision.action.updates);
    } else if (decision.action.type === 'restock') {
      for (const sku of decision.action.skus) {
        if (!this.isRunning) break;
        await this.executeRestock(sku);
      }
    }
    // type === 'wait' → no action
  }

  private buildMerchantLLMContext(): MerchantLLMContext {
    const snapshot = getInventorySnapshot();
    const demandSummaries = getSkuDemandSummaries();

    return {
      agent_id: this.config.agent_id,
      balance: this.state?.balance ?? '0.00',
      total_revenue: this.state?.total_revenue ?? '0.00',
      total_cost: this.state?.total_cost ?? '0.00',
      profit: this.state?.profit ?? '0.00',
      inventory: snapshot.map(item => {
        const full = getInventoryItem(item.sku);
        return {
          sku: item.sku,
          name: item.name,
          current_price: item.price,
          cost_basis: full?.cost_basis ?? '0.00',
          base_price: item.base_price,
          stock: item.stock,
          max_stock: item.max_stock,
          satisfaction_value: full?.satisfaction_value ?? 0,
        };
      }),
      demand_summaries: demandSummaries,
      guardrails: {
        max_change_pct: 30,
        price_floor_margin: 0.25,
        price_ceiling_multiplier: 3,
      },
      brain_cycle: this.state?.brain_cycle_count ?? 0,
    };
  }

  private buildContextSummary(): Record<string, unknown> {
    const snapshot = getInventorySnapshot();
    const demandSummaries = getSkuDemandSummaries();
    const totalStock = snapshot.reduce((sum, i) => sum + i.stock, 0);
    const lowStockItems = snapshot.filter(i => i.stock <= 1).length;
    const totalVelocity = demandSummaries.reduce((sum, d) => sum + d.velocity_per_minute, 0);

    return {
      balance: this.state?.balance ?? '0.00',
      total_stock: totalStock,
      low_stock_items: lowStockItems,
      total_velocity: Math.round(totalVelocity * 100) / 100,
      profit: this.state?.profit ?? '0.00',
      brain_cycle: this.state?.brain_cycle_count ?? 0,
    };
  }

  private async executePriceAdjustments(updates: Array<{ sku: string; new_price: string }>): Promise<void> {
    for (const { sku, new_price } of updates) {
      const oldPrice = updatePrice(sku, new_price);
      if (oldPrice === null) continue;

      const oldNum = parseFloat(oldPrice);
      const newNum = parseFloat(new_price);
      const pctChange = ((newNum - oldNum) / oldNum * 100).toFixed(1);
      const item = getInventoryItem(sku);

      log.info(`[${this.config.agent_id}] Price change: ${item?.name ?? sku} $${oldPrice} -> $${new_price} (${newNum > oldNum ? '+' : ''}${pctChange}%)`);

      this.emitEvent('price_adjusted', {
        sku,
        name: item?.name ?? sku,
        old_price: oldPrice,
        new_price,
        pct_change: pctChange,
      });
    }

    // Push updated inventory state to UI
    this.state!.updated_at = new Date();
    this.emitEvent('merchant_cycle_completed', this.getStateSnapshot());
  }

  private getStateSnapshot() {
    return {
      inventory: getInventorySnapshot(),
      total_revenue: this.state?.total_revenue || '0.00',
      total_cost: this.state?.total_cost || '0.00',
      profit: this.state?.profit || '0.00',
      status: this.state?.status || 'offline',
      balance: this.state?.balance || '0.00',
      restock_count: this.state?.restock_count || 0,
      sale_count: this.state?.sale_count || 0,
    };
  }

  private async handleError(error: unknown): Promise<void> {
    this.errorCount++;
    const errorMessage = error instanceof Error ? error.message : String(error);

    log.error(`[${this.config.agent_id}] Cycle error #${this.errorCount}:`, errorMessage);

    if (this.state) {
      this.state.status = 'error';
    }

    this.emitEvent('error_occurred', {
      error: errorMessage,
      error_count: this.errorCount,
    });

    if (this.errorCount >= 5) {
      log.error(`[${this.config.agent_id}] Too many consecutive errors, stopping`);
      await this.stop();
      return;
    }

    const backoffMs = Math.min(30000, 1000 * Math.pow(2, this.errorCount - 1));
    log.warn(`[${this.config.agent_id}] Backing off for ${backoffMs}ms before retry...`);

    setTimeout(() => {
      if (this.isRunning) {
        this.runCycle();
      }
    }, backoffMs);
  }

  private scheduleNextCycle(): void {
    if (!this.isRunning) return;

    this.errorCount = 0;

    if (this.state) {
      this.state.status = 'online';
    }

    this.loopInterval = setTimeout(() => {
      this.runCycle();
    }, this.config.polling_interval_ms);
  }

  getStatus(): MerchantStatus {
    const now = new Date();
    const uptimeSeconds = this.startTime ? Math.floor((now.getTime() - this.startTime.getTime()) / 1000) : 0;
    const walletAddress = getWalletAddress(this.config.agent_id);

    return {
      agent_id: this.config.agent_id,
      status: this.state?.status || 'offline',
      balance: this.state?.balance || '0.00',
      wallet_address: walletAddress,
      total_revenue: this.state?.total_revenue || '0.00',
      total_cost: this.state?.total_cost || '0.00',
      profit: this.state?.profit || '0.00',
      restock_count: this.state?.restock_count || 0,
      sale_count: this.state?.sale_count || 0,
      cycle_count: this.state?.cycle_count || 0,
      uptime_seconds: uptimeSeconds,
      error_count: this.errorCount,
      inventory: getInventorySnapshot(),
    };
  }

  on(eventType: AgentEventType, handler: (event: AgentEvent) => void): void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, []);
    }
    this.eventHandlers.get(eventType)!.push(handler);
  }

  private emitEvent(type: AgentEventType, data: unknown): void {
    const event: AgentEvent = {
      type,
      agent_id: this.config.agent_id,
      timestamp: new Date(),
      data,
    };

    const handlers = this.eventHandlers.get(type);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(event);
        } catch (error) {
          log.error(`[${this.config.agent_id}] Event handler error:`, error);
        }
      });
    }
  }
}
