import { createLogger } from '../shared/logger.js';
import { BuyerAgent } from './buyer-agent.js';
import { MerchantAgent } from './merchant-agent.js';
import { getStateManager } from './state-manager.js';
import { generateAllWallets } from './wallet-generator.js';
import { fundZooWallets } from './wallet-funder.js';
import { resetZooAccounts } from '../server/zoo-accounts.js';
import { rpcCircuitBreaker, merchantCircuitBreaker } from './circuit-breaker.js';
import { getAllZooAccounts, getZooAccountByRole } from '../server/zoo-accounts.js';
import { refreshZooBalances } from '../server/routes/zoo-shared.js';
import { ALPHA_USD } from '../server/tempo-client.js';
import { config } from '../server/config.js';
import { LLMClient } from './llm/llm-client.js';
import { BuyerBrain } from './llm/buyer-brain.js';
import type {
  AgentConfig,
  AgentStatus,
  AgentMetrics,
  AgentEvent,
  AgentEventType,
  MerchantConfig,
  MetricPoint
} from './types.js';

const log = createLogger('AgentRunner');

export class AgentRunner {
  private readonly agents: Map<string, BuyerAgent> = new Map();
  private merchantAgent: MerchantAgent | null = null;
  private buyerBrain: BuyerBrain | null = null;
  private isRunning = false;
  private depletionCheckInterval: NodeJS.Timeout | null = null;
  private startTime: Date | null = null;

  // Event aggregation
  private eventHandlers: Map<AgentEventType, Array<(event: AgentEvent) => void>> = new Map();
  private totalPurchases = 0;
  private totalSpent = 0;

  // Rolling metrics window
  private readonly metricPoints: MetricPoint[] = [];
  private readonly maxMetricPoints = 1000;

  constructor() {
    log.info('Agent Runner initialized');
  }

  /**
   * Generate fresh ephemeral wallets and fund them.
   * Called during preflight so balances are visible before "Open Gates".
   */
  async initializeWallets(): Promise<void> {
    log.info('Initializing ephemeral wallets...');

    // Clear previous agent state files
    const stateManager = getStateManager();
    await stateManager.initialize();
    await stateManager.clearAllStates();
    log.info('Cleared previous agent states');

    const progressCallback = (step: string, detail?: string) => {
      log.info(`[Funding] ${step}${detail ? ` — ${detail}` : ''}`);
      this.emitEvent('funding_progress', { step, detail });
    };

    progressCallback('Generating 5 ephemeral wallets...');
    const wallets = generateAllWallets();
    log.info(`Generated ${wallets.length} wallets`);
    wallets.forEach(w => log.debug(`  ${w.label}: ${w.address}`));

    // Register wallets in account store
    resetZooAccounts(wallets);
    log.info('Registered wallets in account store');

    // Fund wallets via faucet + batch distribution
    await fundZooWallets(wallets, progressCallback);
    log.info('Wallet funding complete');

    // Refresh balances from chain
    await refreshZooBalances();
    log.info('Wallet initialization complete');
  }

  /**
   * Start all agents (wallets must already be initialized via initializeWallets)
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      log.warn('Agent Runner already running');
      return;
    }

    log.info('Starting Zoo Simulation Agent Runner...');

    try {
      const agentConfigs = this.createAgentConfigs();

      if (agentConfigs.length === 0) {
        throw new Error('No valid guest accounts found for agent creation');
      }

      // Conditionally create LLM BuyerBrain when inference env vars are present
      if (config.llm.enabled && config.llm.inferenceUrl && config.llm.inferenceKey) {
        const llmClient = new LLMClient({
          inferenceUrl: config.llm.inferenceUrl,
          inferenceKey: config.llm.inferenceKey,
          model: config.llm.model,
          maxTokensPerResponse: config.llm.maxTokensPerResponse,
          maxCallsPerSimulation: config.llm.maxCallsPerSimulation,
        });
        this.buyerBrain = new BuyerBrain(llmClient);
        log.info('LLM buyer brain enabled via Heroku Managed Inference');
      } else {
        this.buyerBrain = null;
        log.info('LLM buyer brain disabled (LLM_ENABLED not set or missing credentials)');
      }

      log.info(`Creating ${agentConfigs.length} buyer agents...`);

      for (const agentConfig of agentConfigs) {
        const agent = new BuyerAgent(agentConfig, this.buyerBrain ?? undefined);
        this.subscribeToAgentEvents(agent);
        this.agents.set(agentConfig.agent_id, agent);
        log.debug(`Created agent: ${agentConfig.agent_id}`);
      }

      // Create and start the merchant agent
      const merchantAccount = getZooAccountByRole('merchantA');
      const zooMasterAccount = getZooAccountByRole('zooMaster');
      if (merchantAccount && zooMasterAccount) {
        const merchantConfig: MerchantConfig = {
          agent_id: 'merchant_a',
          private_key: merchantAccount.privateKey,
          address: merchantAccount.address,
          polling_interval_ms: 5000,
          zoo_master_address: zooMasterAccount.address,
        };
        this.merchantAgent = new MerchantAgent(merchantConfig);
        this.subscribeMerchantEvents(this.merchantAgent);
        log.info('Merchant agent created');
      } else {
        log.warn('Merchant or Zoo Master account not found, skipping merchant agent');
      }

      log.info('Starting all agents...');

      const startPromises = Array.from(this.agents.values()).map(agent => agent.start());
      if (this.merchantAgent) {
        startPromises.push(this.merchantAgent.start());
      }
      await Promise.all(startPromises);

      this.startDepletionMonitor();

      this.isRunning = true;
      this.startTime = new Date();

      log.info(`All agents started successfully! Active buyer agents: ${this.agents.size}, merchant agent: ${this.merchantAgent ? 'active' : 'none'}`);

      const allAccounts = getAllZooAccounts();
      this.emitEvent('simulation_started', {
        agent_count: this.agents.size,
        wallets: allAccounts.map(a => ({ label: a.label, address: a.address })),
      });

    } catch (error) {
      log.error('Failed to start agents:', error);
      await this.stop();
      throw error;
    }
  }

  /**
   * Stop all agents and cleanup
   */
  async stop(): Promise<void> {
    log.info('Stopping Agent Runner...');

    this.isRunning = false;

    if (this.depletionCheckInterval) {
      clearInterval(this.depletionCheckInterval);
      this.depletionCheckInterval = null;
    }

    const stopPromises = Array.from(this.agents.values()).map(agent => agent.stop());
    if (this.merchantAgent) {
      stopPromises.push(this.merchantAgent.stop());
    }
    await Promise.all(stopPromises);

    // Reset LLM call counter
    if (this.buyerBrain) {
      this.buyerBrain.resetCallCount();
    }

    // Clear agent maps for fresh start next time
    this.agents.clear();
    this.merchantAgent = null;
    this.totalPurchases = 0;
    this.totalSpent = 0;
    this.metricPoints.length = 0;

    log.info('All agents stopped');

    this.emitEvent('simulation_stopped', {
      agent_count: this.agents.size,
      total_purchases: this.totalPurchases,
      total_spent: this.totalSpent.toFixed(2)
    });
  }

  getAgentStatuses(): AgentStatus[] {
    return Array.from(this.agents.values()).map(agent => agent.getStatus());
  }

  getMetrics(): AgentMetrics {
    const statuses = this.getAgentStatuses();

    const activeAgents = statuses.filter(s => s.status === 'online' || s.status === 'purchasing').length;
    const totalPurchases = statuses.reduce((sum, s) => sum + s.purchase_count, 0);
    const totalSpent = statuses.reduce((sum, s) => sum + parseFloat(s.total_spent), 0);

    const avgFoodNeed = statuses.reduce((sum, s) => sum + s.needs.food_need, 0) / statuses.length;
    const avgFunNeed = statuses.reduce((sum, s) => sum + s.needs.fun_need, 0) / statuses.length;

    const uptimeMinutes = this.startTime ? (Date.now() - this.startTime.getTime()) / 1000 / 60 : 1;
    const purchasesPerMinute = totalPurchases / Math.max(1, uptimeMinutes);

    const totalCycles = statuses.reduce((sum, s) => sum + s.cycle_count, 0);
    const totalErrors = statuses.reduce((sum, s) => sum + s.error_count, 0);
    const errorRate = totalCycles > 0 ? totalErrors / totalCycles : 0;

    return {
      total_agents: this.agents.size,
      active_agents: activeAgents,
      total_purchases: totalPurchases,
      total_spent: totalSpent.toFixed(2),
      average_need_levels: {
        food_need: Math.round(avgFoodNeed),
        fun_need: Math.round(avgFunNeed)
      },
      purchases_per_minute: Math.round(purchasesPerMinute * 100) / 100,
      error_rate: Math.round(errorRate * 10000) / 100
    };
  }

  private recordMetric(point: MetricPoint): void {
    this.metricPoints.push(point);
    if (this.metricPoints.length > this.maxMetricPoints) {
      this.metricPoints.shift();
    }
  }

  getTimeSeriesStats(windowMs: number = 60000) {
    const cutoff = Date.now() - windowMs;
    const recent = this.metricPoints.filter(p => p.timestamp >= cutoff);

    if (recent.length === 0) {
      return { totalTx: 0, successRate: 0, avgLatencyMs: 0, txPerMinute: 0 };
    }

    const successes = recent.filter(p => p.success).length;
    const avgLatency = recent.reduce((s, p) => s + p.latencyMs, 0) / recent.length;
    const windowMinutes = windowMs / 60000;

    return {
      totalTx: recent.length,
      successRate: Math.round((successes / recent.length) * 10000) / 100,
      avgLatencyMs: Math.round(avgLatency),
      txPerMinute: Math.round((recent.length / windowMinutes) * 100) / 100,
    };
  }

  getMerchantAgent(): MerchantAgent | null {
    return this.merchantAgent;
  }

  getAgent(agentId: string): BuyerAgent | undefined {
    return this.agents.get(agentId);
  }

  async forcePurchase(agentId: string, maxBudget?: number): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    await agent.forcePurchase(maxBudget);
  }

  getStatus() {
    const metrics = this.getMetrics();
    const uptimeSeconds = this.startTime ? Math.floor((Date.now() - this.startTime.getTime()) / 1000) : 0;

    return {
      is_running: this.isRunning,
      start_time: this.startTime?.toISOString(),
      uptime_seconds: uptimeSeconds,
      metrics,
      time_series: this.getTimeSeriesStats(),
      circuit_breakers: {
        rpc: rpcCircuitBreaker.getStatus(),
        merchant: merchantCircuitBreaker.getStatus(),
      },
      agents: this.getAgentStatuses().map(status => ({
        agent_id: status.agent_id,
        status: status.status,
        needs: status.needs,
        balance: status.balance,
        purchase_count: status.purchase_count,
        cycle_count: status.cycle_count
      })),
      merchant_agent: this.merchantAgent?.getStatus() ?? null,
    };
  }

  private createAgentConfigs(): AgentConfig[] {
    const configs: AgentConfig[] = [];

    const guestAccounts = [
      { id: 'guest_1', role: 'guest1' as const },
      { id: 'guest_2', role: 'guest2' as const },
      { id: 'guest_3', role: 'guest3' as const }
    ];

    for (const { id, role } of guestAccounts) {
      const account = getZooAccountByRole(role);

      if (!account) {
        log.error(`No account found for ${role}`);
        continue;
      }

      const agentConfig: AgentConfig = {
        agent_id: id,
        private_key: account.privateKey,
        address: account.address,
        initial_funding_amount: "50.00",
        refund_threshold: "10.00",
        refund_amount: "30.00",
        polling_interval_ms: 12000,
        need_decay_rate: {
          food_need: 5,
          fun_need: 4
        },
        purchase_threshold: {
          food_need: 40,
          fun_need: 30
        },
        need_recovery: {
          main: 70,
          snack: 50,
          beverage: 30,
          dessert: 60
        }
      };

      configs.push(agentConfig);
      log.debug(`Created config for ${id} (${account.address})`);
    }

    return configs;
  }

  private subscribeToAgentEvents(agent: BuyerAgent): void {
    agent.on('purchase_completed', (event) => {
      this.totalPurchases++;
      this.totalSpent += parseFloat(event.data.purchase_record.amount);
      this.recordMetric({
        timestamp: Date.now(),
        latencyMs: event.data.latencyMs ?? 0,
        success: true,
        agentId: event.agent_id,
        amount: parseFloat(event.data.purchase_record.amount),
      });
    });

    agent.on('purchase_failed', (event) => {
      this.recordMetric({
        timestamp: Date.now(),
        latencyMs: event.data.latencyMs ?? 0,
        success: false,
        agentId: event.agent_id,
        amount: 0,
      });
    });

    const eventTypes: AgentEventType[] = [
      'agent_started', 'agent_stopped', 'needs_updated', 'purchase_initiated',
      'purchase_completed', 'purchase_failed', 'funding_received', 'funding_failed', 'error_occurred',
      'tx_flow',
      'llm_decision',
    ];

    for (const eventType of eventTypes) {
      agent.on(eventType, (event) => {
        const handlers = this.eventHandlers.get(eventType);
        if (handlers) {
          handlers.forEach(handler => handler(event));
        }
      });
    }
  }

  private subscribeMerchantEvents(merchant: MerchantAgent): void {
    const merchantEventTypes: AgentEventType[] = [
      'agent_started', 'agent_stopped', 'error_occurred',
      'merchant_cycle_completed', 'restock_initiated', 'restock_completed',
      'restock_failed', 'sale_recorded',
    ];

    for (const eventType of merchantEventTypes) {
      merchant.on(eventType, (event) => {
        const handlers = this.eventHandlers.get(eventType);
        if (handlers) {
          handlers.forEach(handler => handler(event));
        }
      });
    }
  }

  /**
   * Monitor for depletion — checks every 10s if ALL buyer agents are below threshold.
   * When depleted, emits simulation_depleted and auto-stops.
   */
  /**
   * Monitor for depletion — checks every 10s using the in-memory accountStore cache
   * (which is kept fresh by agents' post-purchase balance re-reads).
   * Refreshes from chain every 30s as a fallback to catch drift.
   */
  private startDepletionMonitor(): void {
    const threshold = config.zoo.minBalanceThreshold;
    let checkCount = 0;

    this.depletionCheckInterval = setInterval(async () => {
      if (!this.isRunning) return;
      checkCount++;

      try {
        // Refresh from chain every 3rd check (30s) to catch drift
        if (checkCount % 3 === 0) {
          await refreshZooBalances();
        }

        // Read from in-memory cache (fast, no RPC)
        const buyerRoles = ['guest1', 'guest2', 'guest3'] as const;
        const allDepleted = buyerRoles.every(role => {
          const account = getZooAccountByRole(role);
          if (!account) return true;
          const balanceBigInt = account.balances[ALPHA_USD] || BigInt(0);
          const balanceUsd = Number(balanceBigInt) / 1_000_000;
          return balanceUsd < threshold;
        });

        if (allDepleted) {
          log.info(`All buyer agents depleted (below $${threshold}). Auto-stopping simulation.`);
          this.emitEvent('simulation_depleted', {
            threshold,
            message: 'All buyer agents have insufficient funds',
          });
          await this.stop();
        }
      } catch (error) {
        log.error('Depletion check failed:', error);
      }
    }, 10_000);

    log.info(`Depletion monitor started (10s intervals, chain refresh every 30s, threshold: $${threshold})`);
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
      agent_id: 'agent_runner',
      timestamp: new Date(),
      data
    };

    const handlers = this.eventHandlers.get(type);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(event);
        } catch (error) {
          log.error('Event handler error:', error);
        }
      });
    }
  }
}
