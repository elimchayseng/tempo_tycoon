import { createLogger } from '../shared/logger.js';
import { StateManager } from './state-manager.js';
import { DecisionEngine } from './decision-engine.js';
import { ACPClient } from './acp-client.js';
import { PaymentManager } from './payment-manager.js';
import { BalanceSync } from './balance-sync.js';
import type {
  AgentConfig,
  AgentState,
  AgentStatus,
  AgentEvent,
  AgentEventType,
  BuyerLLMContext,
} from './types.js';
import type { BuyerBrain } from './llm/buyer-brain.js';
import type { TxFlowStage } from '../shared/types.js';

const log = createLogger('BuyerAgent');

export class BuyerAgent {
  private readonly config: AgentConfig;
  private readonly stateManager: StateManager;
  private readonly decisionEngine: DecisionEngine;
  private readonly acpClient: ACPClient;
  private readonly paymentManager: PaymentManager;
  private readonly balanceSync: BalanceSync;
  private readonly brain?: BuyerBrain;

  private state: AgentState | null = null;
  private isRunning = false;
  private loopInterval: NodeJS.Timeout | null = null;
  private errorCount = 0;
  private startTime: Date | null = null;

  /** In-memory rolling window of recent purchases (for LLM context). */
  private recentPurchases: Array<{ sku: string; name: string; amount: string; completedAt: Date }> = [];

  // Event handlers
  private eventHandlers: Map<AgentEventType, Array<(event: AgentEvent) => void>> = new Map();

  constructor(config: AgentConfig, brain?: BuyerBrain) {
    this.config = config;
    this.brain = brain;

    log.info(`[${config.agent_id}] Initializing buyer agent...`);

    // Initialize components
    this.stateManager = new StateManager();
    this.decisionEngine = new DecisionEngine(config.agent_id, {
      pollingIntervalMs: config.polling_interval_ms,
      needDecayRate: config.need_decay_rate,
      purchaseThreshold: config.purchase_threshold,
      needRecovery: config.need_recovery,
      minBalanceThreshold: parseFloat(config.refund_threshold),
    });
    this.acpClient = new ACPClient(`http://localhost:${process.env.PORT || 4000}`);
    this.paymentManager = new PaymentManager(config.agent_id, this.getAgentLabel());
    this.balanceSync = new BalanceSync();

    log.info(`[${config.agent_id}] All components initialized`);
  }

  /**
   * Start the autonomous agent
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      log.warn(`[${this.config.agent_id}] Agent already running`);
      return;
    }

    log.info(`[${this.config.agent_id}] Starting autonomous buyer agent...`);

    try {
      // Initialize state management
      await this.stateManager.initialize();

      // Load or create agent state
      this.state = await this.stateManager.loadState(this.config.agent_id, this.config.address);

      // Update state to online
      this.state.status = 'online';
      await this.stateManager.saveState(this.state);

      // Start the autonomous loop
      this.isRunning = true;
      this.startTime = new Date();
      this.scheduleNextCycle();

      log.info(`[${this.config.agent_id}] Agent started successfully`);
      log.debug(`[${this.config.agent_id}] Polling every ${this.config.polling_interval_ms}ms`);

      this.emitEvent('agent_started', { config: this.config });

    } catch (error) {
      log.error(`[${this.config.agent_id}] Failed to start agent:`, error);
      await this.stop();
      throw error;
    }
  }

  /**
   * Stop the autonomous agent
   */
  async stop(): Promise<void> {
    log.info(`[${this.config.agent_id}] Stopping agent...`);

    this.isRunning = false;

    // Clear the loop timer
    if (this.loopInterval) {
      clearTimeout(this.loopInterval);
      this.loopInterval = null;
    }

    // Update state to offline
    if (this.state) {
      this.state.status = 'offline';
      await this.stateManager.saveState(this.state);
    }

    log.info(`[${this.config.agent_id}] Agent stopped`);
    this.emitEvent('agent_stopped', { reason: 'manual_stop' });
  }

  /**
   * Main autonomous decision and action loop
   */
  private async runCycle(): Promise<void> {
    if (!this.isRunning || !this.state) {
      return;
    }

    try {
      log.debug(`[${this.config.agent_id}] Starting cycle ${this.state.cycle_count + 1}...`);

      // Step 1: Update needs (degradation)
      const previousNeeds = { ...this.state.needs };
      this.state.needs = this.decisionEngine.degradeNeeds(this.state.needs);
      this.state.cycle_count += 1;

      // Emit needs update event
      this.emitEvent('needs_updated', {
        previous_needs: previousNeeds,
        current_needs: this.state.needs,
        cycle_count: this.state.cycle_count
      });

      // Step 2: Get current balance from blockchain
      const currentBalance = await this.balanceSync.getAlphaUsdOnChainBalance(this.config.agent_id);

      // Update local state balance to match blockchain
      const balanceStr = currentBalance.toFixed(2);
      this.state.balance = balanceStr;

      // Step 3: Make purchase decision
      const decision = this.decisionEngine.evaluatePurchaseDecision(
        this.state.needs,
        currentBalance,
        this.state.last_purchase_time
      );

      log.info(`[${this.config.agent_id}] Decision: ${decision.shouldPurchase ? 'PURCHASE' : 'WAIT'} (${decision.reason})`);

      // Step 4: Execute purchase if needed
      if (decision.shouldPurchase) {
        let handledByLLM = false;

        // Try LLM-powered decision if brain is available
        if (this.brain) {
          try {
            handledByLLM = await this.executeLLMPurchase(balanceStr);
          } catch (llmError) {
            log.warn(`[${this.config.agent_id}] LLM decision failed, falling back to deterministic:`, llmError);
          }
        }

        // Deterministic fallback
        if (!handledByLLM) {
          await this.executePurchase(decision.maxBudget, decision.preferredCategory);
        }
      }

      // Step 5: Save updated state
      await this.stateManager.saveState(this.state);

      // Schedule next cycle
      this.scheduleNextCycle();

    } catch (error) {
      await this.handleError(error);
    }
  }

  /**
   * Execute a purchase transaction
   */
  private async executePurchase(maxBudget: number, preferredCategory?: string): Promise<void> {
    if (!this.state) return;

    try {
      log.info(`[${this.config.agent_id}] Executing purchase (budget: $${maxBudget.toFixed(2)})...`);

      // Update status to purchasing
      this.state.status = 'purchasing';
      await this.stateManager.saveState(this.state);

      this.emitEvent('purchase_initiated', {
        max_budget: maxBudget,
        preferred_category: preferredCategory,
        current_needs: this.state.needs
      });

      // Step 1: Initiate ACP purchase flow
      this.emitTxFlow('checkout_created', { preferred_category: preferredCategory });
      const purchaseFlow = await this.acpClient.initiatePurchase(this.config.address, preferredCategory);

      if (!purchaseFlow) {
        throw new Error('Failed to initiate ACP purchase flow');
      }

      const { session, product, merchantCategory } = purchaseFlow;

      // Step 2: Validate payment amount
      if (!this.paymentManager.validatePaymentAmount(session, maxBudget)) {
        throw new Error(`Product price ($${session.amount}) exceeds budget ($${maxBudget.toFixed(2)})`);
      }

      // Step 3: Execute payment
      log.info(`[${this.config.agent_id}] Making payment for ${product.name}...`);
      this.emitTxFlow('signing', { product: product.name, amount: session.amount });

      const paymentResult = await this.paymentManager.executeAlphaUsdTransferWithRetry(session, product);

      if (!paymentResult.success) {
        throw new Error(paymentResult.error || 'Payment failed');
      }

      log.info(`[${this.config.agent_id}] Payment successful: ${paymentResult.tx_hash}`);
      this.emitTxFlow('block_inclusion', { tx_hash: paymentResult.tx_hash, block_number: paymentResult.block_number });

      // Step 4: Complete checkout with merchant
      this.emitTxFlow('merchant_verified', { session_id: session.session_id });
      const checkoutResult = await this.acpClient.completeCheckout(
        merchantCategory,
        session.session_id,
        paymentResult.tx_hash!
      );

      if (!checkoutResult.success || !checkoutResult.verified) {
        log.warn(`[${this.config.agent_id}] Checkout verification failed:`, checkoutResult.error);
        // Note: Payment already went through, so we continue with need recovery
      }

      // Step 5: Update needs based on purchase
      const needsBefore = { ...this.state.needs };
      this.state.needs = this.decisionEngine.calculateNeedRecovery(this.state.needs, product);

      // Step 6: Create purchase record
      const purchaseRecord = this.paymentManager.createPurchaseRecord(
        session,
        product,
        paymentResult,
        needsBefore,
        this.state.needs
      );

      // Step 7: Update state
      await this.stateManager.recordPurchase(this.config.agent_id, purchaseRecord);

      // Step 7b: Sync in-memory state with persisted purchase data
      this.state.purchase_count = (this.state.purchase_count || 0) + 1;
      this.state.total_spent = (parseFloat(this.state.total_spent || '0') + parseFloat(paymentResult.amount)).toFixed(2);
      this.state.last_purchase_time = purchaseRecord.completed_at;

      // Step 8: Re-read authoritative balance from chain instead of
      // speculatively subtracting (avoids floating-point vs fixed-point
      // rounding mismatch that caused persistent $0.01 drift).
      const postPurchaseBalance = await this.balanceSync.getAlphaUsdOnChainBalance(this.config.agent_id);
      this.state.balance = postPurchaseBalance.toFixed(2);
      this.state.status = 'online';

      log.info(`[${this.config.agent_id}] Purchase completed successfully!`);
      log.debug(`[${this.config.agent_id}] Updated balance: $${this.state.balance}, food_need: ${this.state.needs.food_need}`);

      this.emitEvent('purchase_completed', {
        purchase_record: purchaseRecord,
        new_needs: this.state.needs,
        new_balance: this.state.balance
      });

    } catch (error) {
      log.error(`[${this.config.agent_id}] Purchase failed:`, error);

      // Reset status
      if (this.state) {
        this.state.status = 'online';
        await this.stateManager.saveState(this.state);
      }

      this.emitEvent('purchase_failed', {
        error: error instanceof Error ? error.message : String(error),
        max_budget: maxBudget,
        current_needs: this.state?.needs
      });

      // Don't throw - we want the agent to continue running
    }
  }

  /**
   * Execute an LLM-powered purchase: ask BuyerBrain which specific product to buy.
   * Returns true if a purchase was made (or brain chose to wait), false if caller should fallback.
   */
  private async executeLLMPurchase(balanceStr: string): Promise<boolean> {
    if (!this.brain || !this.state) return false;

    // Fetch catalog for context
    const catalog = await this.acpClient.getMerchantCatalog('food');

    const context: BuyerLLMContext = {
      agent_id: this.config.agent_id,
      needs: { ...this.state.needs },
      balance: balanceStr,
      catalog: catalog.products,
      purchase_history: this.getRecentPurchaseHistory(),
      cycle_count: this.state.cycle_count,
    };

    const decision = await this.brain.decide(context);

    // Emit LLM decision event for UI
    this.emitEvent('llm_decision', {
      agent_id: this.config.agent_id,
      toolName: decision.toolName,
      reasoning: decision.reasoning,
      action: decision.action,
      context_summary: {
        food_need: context.needs.food_need,
        balance: context.balance,
        catalog_size: context.catalog.length,
        recent_purchases: context.purchase_history.length,
      },
      model: decision.model,
      tokenUsage: decision.tokenUsage,
    });

    // If brain returned fallback sentinel, let the caller fall back
    if (decision.toolName === 'fallback') {
      return false;
    }

    // Brain decided to wait
    if (decision.action.type === 'wait') {
      log.info(`[${this.config.agent_id}] LLM chose to wait: ${decision.reasoning}`);
      return true;
    }

    // Brain decided to purchase a specific SKU
    const { sku } = decision.action;
    const product = catalog.products.find((p) => p.sku === sku && p.available);
    if (!product) {
      log.warn(`[${this.config.agent_id}] LLM selected unavailable SKU ${sku}, falling back`);
      return false;
    }

    // Execute the purchase using the existing ACP flow
    log.info(`[${this.config.agent_id}] LLM purchasing: ${product.name} ($${product.price})`);

    this.state.status = 'purchasing';
    await this.stateManager.saveState(this.state);

    this.emitEvent('purchase_initiated', {
      max_budget: parseFloat(balanceStr),
      preferred_category: product.category,
      current_needs: this.state.needs,
      llm_selected: true,
    });

    // Create checkout for the specific product
    this.emitTxFlow('checkout_created', { preferred_category: product.category });
    const session = await this.acpClient.createCheckoutSession('food', sku, 1, this.config.address);

    // Validate price
    const price = parseFloat(session.amount);
    const balance = parseFloat(balanceStr);
    if (price > balance) {
      throw new Error(`LLM-selected product price ($${session.amount}) exceeds balance ($${balanceStr})`);
    }

    // Execute payment
    this.emitTxFlow('signing', { product: product.name, amount: session.amount });
    const paymentResult = await this.paymentManager.executeAlphaUsdTransferWithRetry(session, product);

    if (!paymentResult.success) {
      throw new Error(paymentResult.error || 'Payment failed');
    }

    log.info(`[${this.config.agent_id}] Payment successful: ${paymentResult.tx_hash}`);
    this.emitTxFlow('block_inclusion', { tx_hash: paymentResult.tx_hash, block_number: paymentResult.block_number });

    // Complete checkout
    this.emitTxFlow('merchant_verified', { session_id: session.session_id });
    const checkoutResult = await this.acpClient.completeCheckout('food', session.session_id, paymentResult.tx_hash!);

    if (!checkoutResult.success || !checkoutResult.verified) {
      log.warn(`[${this.config.agent_id}] Checkout verification failed:`, checkoutResult.error);
    }

    // Update needs
    const needsBefore = { ...this.state.needs };
    this.state.needs = this.decisionEngine.calculateNeedRecovery(this.state.needs, product);

    // Record purchase
    const purchaseRecord = this.paymentManager.createPurchaseRecord(
      session, product, paymentResult, needsBefore, this.state.needs,
    );
    await this.stateManager.recordPurchase(this.config.agent_id, purchaseRecord);

    // Update in-memory state
    this.state.purchase_count = (this.state.purchase_count || 0) + 1;
    this.state.total_spent = (parseFloat(this.state.total_spent || '0') + parseFloat(paymentResult.amount)).toFixed(2);
    this.state.last_purchase_time = purchaseRecord.completed_at;

    // Track for LLM context
    this.recentPurchases.push({
      sku: product.sku,
      name: product.name,
      amount: product.price,
      completedAt: purchaseRecord.completed_at,
    });
    if (this.recentPurchases.length > 10) {
      this.recentPurchases.shift();
    }

    // Re-read balance from chain
    const postPurchaseBalance = await this.balanceSync.getAlphaUsdOnChainBalance(this.config.agent_id);
    this.state.balance = postPurchaseBalance.toFixed(2);
    this.state.status = 'online';

    log.info(`[${this.config.agent_id}] LLM purchase completed: ${product.name}`);

    this.emitEvent('purchase_completed', {
      purchase_record: purchaseRecord,
      new_needs: this.state.needs,
      new_balance: this.state.balance,
    });

    return true;
  }

  /**
   * Build recent purchase history for LLM context.
   */
  private getRecentPurchaseHistory(): BuyerLLMContext['purchase_history'] {
    const now = Date.now();
    return this.recentPurchases.slice(-5).map((p) => ({
      sku: p.sku,
      name: p.name,
      amount: p.amount,
      time_ago_seconds: Math.round((now - p.completedAt.getTime()) / 1000),
    }));
  }

  /**
   * Handle errors with exponential backoff
   */
  private async handleError(error: unknown): Promise<void> {
    this.errorCount++;
    const errorMessage = error instanceof Error ? error.message : String(error);

    log.error(`[${this.config.agent_id}] Cycle error #${this.errorCount}:`, errorMessage);

    // Update state to error status
    if (this.state) {
      this.state.status = 'error';
      await this.stateManager.saveState(this.state);
    }

    this.emitEvent('error_occurred', {
      error: errorMessage,
      error_count: this.errorCount
    });

    // If too many consecutive errors, stop the agent
    if (this.errorCount >= 5) {
      log.error(`[${this.config.agent_id}] Too many consecutive errors, stopping agent`);
      await this.stop();
      return;
    }

    // Exponential backoff: wait longer after each error
    const backoffMs = Math.min(30000, 1000 * Math.pow(2, this.errorCount - 1));
    log.warn(`[${this.config.agent_id}] Backing off for ${backoffMs}ms before retry...`);

    setTimeout(() => {
      if (this.isRunning) {
        this.runCycle();
      }
    }, backoffMs);
  }

  /**
   * Schedule the next cycle
   */
  private scheduleNextCycle(): void {
    if (!this.isRunning) return;

    // Reset error count on successful cycle
    this.errorCount = 0;

    if (this.state) {
      this.state.status = 'online';
    }

    this.loopInterval = setTimeout(() => {
      this.runCycle();
    }, this.config.polling_interval_ms);
  }

  /**
   * Get current agent status
   */
  getStatus(): AgentStatus {
    const now = new Date();
    const uptimeSeconds = this.startTime ? Math.floor((now.getTime() - this.startTime.getTime()) / 1000) : 0;

    // Get wallet address for reporting
    const walletAddress = this.balanceSync.getWalletAddress(this.config.agent_id);

    return {
      agent_id: this.config.agent_id,
      status: this.state?.status || 'offline',
      needs: this.state?.needs || { food_need: 50, fun_need: 100 },
      balance: this.state?.balance || '0.00',
      wallet_address: walletAddress,
      last_purchase_time: this.state?.last_purchase_time || null,
      cycle_count: this.state?.cycle_count || 0,
      purchase_count: this.state?.purchase_count || 0,
      total_spent: this.state?.total_spent || '0.00',
      uptime_seconds: uptimeSeconds,
      error_count: this.errorCount
    };
  }

  /**
   * Get agent configuration
   */
  getConfig(): AgentConfig {
    return { ...this.config };
  }

  /**
   * Event handling
   */
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
      data
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

  /**
   * Emit a transaction flow event for real-time visualization
   */
  private emitTxFlow(stage: TxFlowStage, data: Record<string, unknown> = {}): void {
    this.emitEvent('tx_flow' as AgentEventType, {
      stage,
      timestamp: Date.now(),
      data,
    });
  }

  /**
   * Get agent label for account operations
   */
  private getAgentLabel(): string {
    return this.config.agent_id
      .split('_')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  /**
   * Force an immediate purchase for testing
   */
  async forcePurchase(maxBudget?: number): Promise<void> {
    if (!this.isRunning || !this.state) {
      throw new Error('Agent must be running to force purchase');
    }

    log.info(`[${this.config.agent_id}] Forcing immediate purchase...`);

    const balance = parseFloat(this.state.balance);
    const budget = maxBudget || (isNaN(balance) ? 0 : balance * 0.5);
    await this.executePurchase(budget);
  }
}
