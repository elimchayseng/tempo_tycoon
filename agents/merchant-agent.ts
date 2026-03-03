import { createLogger } from '../shared/logger.js';
import { PaymentManager } from './payment-manager.js';
import { BalanceSync } from './balance-sync.js';
import {
  initializeInventory,
  getSkusNeedingRestock,
  restockItem,
  getInventorySnapshot,
  getInventoryItem,
  decrementStock,
} from './merchant-inventory.js';
import { loadZooRegistry } from '../server/routes/zoo-shared.js';
import type {
  MerchantConfig,
  MerchantState,
  MerchantStatus,
  RestockRecord,
  AgentEvent,
  AgentEventType,
} from './types.js';

const log = createLogger('MerchantAgent');

export class MerchantAgent {
  private readonly config: MerchantConfig;
  private readonly paymentManager: PaymentManager;
  private readonly balanceSync: BalanceSync;

  private state: MerchantState | null = null;
  private isRunning = false;
  private loopInterval: NodeJS.Timeout | null = null;
  private errorCount = 0;
  private startTime: Date | null = null;

  private eventHandlers: Map<AgentEventType, Array<(event: AgentEvent) => void>> = new Map();

  constructor(config: MerchantConfig) {
    this.config = config;

    log.info(`[${config.agent_id}] Initializing merchant agent...`);

    this.paymentManager = new PaymentManager(config.agent_id, 'Merchant A');
    this.balanceSync = new BalanceSync();

    log.info(`[${config.agent_id}] Merchant agent initialized`);
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
        created_at: new Date(),
        updated_at: new Date(),
      };

      this.isRunning = true;
      this.startTime = new Date();
      this.scheduleNextCycle();

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
      const currentBalance = await this.balanceSync.getAlphaUsdOnChainBalance(this.config.agent_id);
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
        product: {
          sku: item.sku,
          name: item.name,
          price: item.cost_basis,
          quantity: unitsNeeded,
        },
      };

      const product = {
        sku: item.sku,
        name: item.name,
        price: item.cost_basis,
        currency: 'AlphaUSD',
        category: item.category,
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
      const postBalance = await this.balanceSync.getAlphaUsdOnChainBalance(this.config.agent_id);
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
    const walletAddress = this.balanceSync.getWalletAddress(this.config.agent_id);

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
