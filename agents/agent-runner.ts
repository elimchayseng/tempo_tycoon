import { createLogger } from '../shared/logger.js';
import { BuyerAgent } from './buyer-agent.js';
import { MerchantAgent } from './merchant-agent.js';
import { FundingManager } from './funding-manager.js';
import { StateManager } from './state-manager.js';
import { rpcCircuitBreaker, merchantCircuitBreaker } from './circuit-breaker.js';
import { getAllZooAccounts, getZooAccountByRole } from '../server/zoo-accounts.js';
import { refreshZooBalances } from '../server/routes/zoo-shared.js';
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
  private readonly fundingManager: FundingManager;
  private readonly stateManager: StateManager;

  private isRunning = false;
  private fundingCheckInterval: NodeJS.Timeout | null = null;
  private startTime: Date | null = null;

  // Event aggregation
  private eventHandlers: Map<AgentEventType, Array<(event: AgentEvent) => void>> = new Map();
  private totalPurchases = 0;
  private totalSpent = 0;

  // Rolling metrics window
  private readonly metricPoints: MetricPoint[] = [];
  private readonly maxMetricPoints = 1000;

  constructor() {
    log.info('Initializing Agent Runner...');

    this.fundingManager = new FundingManager({
      refundThreshold: 10.0,
      initialFundingAmount: "50.00",
      refundAmount: "30.00"
    });

    this.stateManager = new StateManager();

    log.info('Agent Runner initialized');
  }

  /**
   * Initialize and start all agents
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      log.warn('Agent Runner already running');
      return;
    }

    log.info('Starting Zoo Simulation Agent Runner...');

    try {
      await this.stateManager.initialize();

      const agentConfigs = this.createAgentConfigs();

      if (agentConfigs.length === 0) {
        throw new Error('No valid attendee accounts found for agent creation');
      }

      log.info(`Creating ${agentConfigs.length} buyer agents...`);

      for (const config of agentConfigs) {
        const agent = new BuyerAgent(config);
        this.subscribeToAgentEvents(agent);
        this.agents.set(config.agent_id, agent);
        log.debug(`Created agent: ${config.agent_id}`);
      }

      log.info('Performing initial funding...');
      const fundingResult = await this.fundingManager.fundAllAgentWallets(agentConfigs);

      if (!fundingResult.success) {
        throw new Error(`Initial funding failed: ${fundingResult.error}`);
      }

      log.info(`Initial funding completed: $${fundingResult.total_amount} to ${fundingResult.funded_agents.length} agents`);

      // Fund merchant wallet
      const merchantAccountForFunding = getZooAccountByRole('merchantA');
      if (merchantAccountForFunding) {
        const merchantFunding = await this.fundingManager.fundMerchantWallet(
          merchantAccountForFunding.address,
          'merchant_a'
        );
        if (merchantFunding.success) {
          log.info(`Merchant funded: $${merchantFunding.total_amount}`);
        } else {
          log.warn(`Merchant funding failed: ${merchantFunding.error}`);
        }
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

      this.startFundingMonitor();

      this.isRunning = true;
      this.startTime = new Date();

      log.info(`All agents started successfully! Active buyer agents: ${this.agents.size}, merchant agent: ${this.merchantAgent ? 'active' : 'none'}`);

      this.emitEvent('simulation_started', {
        agent_count: this.agents.size,
        initial_funding: fundingResult.total_amount,
        funded_agents: fundingResult.funded_agents
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

    if (this.fundingCheckInterval) {
      clearInterval(this.fundingCheckInterval);
      this.fundingCheckInterval = null;
    }

    const stopPromises = Array.from(this.agents.values()).map(agent => agent.stop());
    if (this.merchantAgent) {
      stopPromises.push(this.merchantAgent.stop());
    }
    await Promise.all(stopPromises);

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

  async checkAndRefundAgents(): Promise<void> {
    log.info('Performing funding check...');

    try {
      await refreshZooBalances();
      const zooAccounts = getAllZooAccounts();
      const attendeeAccounts = zooAccounts.filter(account =>
        account.label.startsWith('Attendee') || account.label === 'Merchant A'
      );

      if (attendeeAccounts.length === 0) {
        log.warn('No agent accounts found for funding check');
        return;
      }

      const fundingResult = await this.fundingManager.checkAndTopUpAgentWallets(attendeeAccounts);

      if (fundingResult) {
        log.info(`Refunding completed: $${fundingResult.total_amount} to ${fundingResult.funded_agents.length} agents`);

        this.emitEvent('funding_completed', {
          reason: 'scheduled_refund',
          amount: fundingResult.total_amount,
          funded_agents: fundingResult.funded_agents
        });
      }

    } catch (error) {
      log.error('Funding check failed:', error);
      this.emitEvent('funding_failed', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
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
      funding_manager: this.fundingManager.getStatus(),
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

    const attendeeAccounts = [
      { id: 'attendee_1', role: 'attendee1' as const },
      { id: 'attendee_2', role: 'attendee2' as const },
      { id: 'attendee_3', role: 'attendee3' as const }
    ];

    for (const { id, role } of attendeeAccounts) {
      const account = getZooAccountByRole(role);

      if (!account) {
        log.error(`No account found for ${role}`);
        continue;
      }

      const config: AgentConfig = {
        agent_id: id,
        private_key: account.privateKey,
        address: account.address,
        initial_funding_amount: "50.00",
        refund_threshold: "10.00",
        refund_amount: "30.00",
        polling_interval_ms: 3000,
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

      configs.push(config);
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
      'tx_flow' as AgentEventType,
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

  private startFundingMonitor(): void {
    this.fundingCheckInterval = setInterval(() => {
      this.checkAndRefundAgents();
    }, 30000);

    log.info('Funding monitor started (30s intervals)');
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
