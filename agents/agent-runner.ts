import { BuyerAgent } from './buyer-agent.js';
import { FundingManager } from './funding-manager.js';
import { StateManager } from './state-manager.js';
import { getAllZooAccounts, getZooAccountByRole } from '../eth_tempo_experiments/server/zoo-accounts.js';
import type {
  AgentConfig,
  AgentStatus,
  AgentMetrics,
  AgentEvent,
  AgentEventType
} from './types.js';

export class AgentRunner {
  private readonly agents: Map<string, BuyerAgent> = new Map();
  private readonly fundingManager: FundingManager;
  private readonly stateManager: StateManager;

  private isRunning = false;
  private fundingCheckInterval: NodeJS.Timeout | null = null;
  private startTime: Date | null = null;

  // Event aggregation
  private eventHandlers: Map<AgentEventType, Array<(event: AgentEvent) => void>> = new Map();
  private totalPurchases = 0;
  private totalSpent = 0;

  constructor() {
    console.log(`[AgentRunner] 🎪 Initializing Agent Runner...`);

    this.fundingManager = new FundingManager({
      refundThreshold: 10.0,
      initialFundingAmount: "50.00",
      refundAmount: "30.00"
    });

    this.stateManager = new StateManager();

    console.log(`[AgentRunner] ✓ Agent Runner initialized`);
  }

  /**
   * Initialize and start all agents
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log(`[AgentRunner] ⚠️  Agent Runner already running`);
      return;
    }

    console.log(`[AgentRunner] 🚀 Starting Zoo Simulation Agent Runner...`);

    try {
      // Step 1: Initialize state management
      await this.stateManager.initialize();

      // Step 2: Create agent configurations
      const agentConfigs = this.createAgentConfigs();

      if (agentConfigs.length === 0) {
        throw new Error('No valid attendee accounts found for agent creation');
      }

      // Step 3: Create and initialize agent instances
      console.log(`[AgentRunner] 🤖 Creating ${agentConfigs.length} buyer agents...`);

      for (const config of agentConfigs) {
        const agent = new BuyerAgent(config);

        // Subscribe to agent events for aggregation
        this.subscribeToAgentEvents(agent);

        this.agents.set(config.agent_id, agent);
        console.log(`[AgentRunner] ✓ Created agent: ${config.agent_id}`);
      }

      // Step 4: Initial funding
      console.log(`[AgentRunner] 💰 Performing initial funding...`);
      const fundingResult = await this.fundingManager.fundAllAttendees(agentConfigs);

      if (!fundingResult.success) {
        throw new Error(`Initial funding failed: ${fundingResult.error}`);
      }

      console.log(`[AgentRunner] ✅ Initial funding completed: $${fundingResult.total_amount} to ${fundingResult.funded_agents.length} agents`);

      // Step 5: Start all agents
      console.log(`[AgentRunner] 🎯 Starting all agents...`);

      const startPromises = Array.from(this.agents.values()).map(agent => agent.start());
      await Promise.all(startPromises);

      // Step 6: Start periodic funding checks
      this.startFundingMonitor();

      this.isRunning = true;
      this.startTime = new Date();

      console.log(`[AgentRunner] 🎉 All agents started successfully!`);
      console.log(`[AgentRunner] 📊 Active agents: ${this.agents.size}`);

      this.emitEvent('simulation_started', {
        agent_count: this.agents.size,
        initial_funding: fundingResult.total_amount,
        funded_agents: fundingResult.funded_agents
      });

    } catch (error) {
      console.error(`[AgentRunner] ❌ Failed to start agents:`, error);
      await this.stop();
      throw error;
    }
  }

  /**
   * Stop all agents and cleanup
   */
  async stop(): Promise<void> {
    console.log(`[AgentRunner] 🛑 Stopping Agent Runner...`);

    this.isRunning = false;

    // Stop funding monitor
    if (this.fundingCheckInterval) {
      clearInterval(this.fundingCheckInterval);
      this.fundingCheckInterval = null;
    }

    // Stop all agents
    const stopPromises = Array.from(this.agents.values()).map(agent => agent.stop());
    await Promise.all(stopPromises);

    console.log(`[AgentRunner] ✅ All agents stopped`);

    this.emitEvent('simulation_stopped', {
      agent_count: this.agents.size,
      total_purchases: this.totalPurchases,
      total_spent: this.totalSpent.toFixed(2)
    });
  }

  /**
   * Get status of all agents
   */
  getAgentStatuses(): AgentStatus[] {
    return Array.from(this.agents.values()).map(agent => agent.getStatus());
  }

  /**
   * Get aggregate metrics
   */
  getMetrics(): AgentMetrics {
    const statuses = this.getAgentStatuses();

    const activeAgents = statuses.filter(s => s.status === 'online' || s.status === 'purchasing').length;
    const totalPurchases = statuses.reduce((sum, s) => sum + s.purchase_count, 0);
    const totalSpent = statuses.reduce((sum, s) => sum + parseFloat(s.total_spent), 0);

    const avgFoodNeed = statuses.reduce((sum, s) => sum + s.needs.food_need, 0) / statuses.length;
    const avgFunNeed = statuses.reduce((sum, s) => sum + s.needs.fun_need, 0) / statuses.length;

    // Calculate purchases per minute
    const uptimeMinutes = this.startTime ? (Date.now() - this.startTime.getTime()) / 1000 / 60 : 1;
    const purchasesPerMinute = totalPurchases / Math.max(1, uptimeMinutes);

    // Error rate calculation
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
      error_rate: Math.round(errorRate * 10000) / 100 // Percentage with 2 decimals
    };
  }

  /**
   * Force funding check and refill if needed
   */
  async checkAndRefundAgents(): Promise<void> {
    console.log(`[AgentRunner] 💰 Performing funding check...`);

    try {
      const zooAccounts = getAllZooAccounts();
      const attendeeAccounts = zooAccounts.filter(account =>
        account.label.startsWith('Attendee')
      );

      if (attendeeAccounts.length === 0) {
        console.log(`[AgentRunner] ⚠️  No attendee accounts found for funding check`);
        return;
      }

      const fundingResult = await this.fundingManager.checkAndRefundAttendees(attendeeAccounts);

      if (fundingResult) {
        console.log(`[AgentRunner] ✅ Refunding completed: $${fundingResult.total_amount} to ${fundingResult.funded_agents.length} agents`);

        this.emitEvent('funding_completed', {
          reason: 'scheduled_refund',
          amount: fundingResult.total_amount,
          funded_agents: fundingResult.funded_agents
        });
      }

    } catch (error) {
      console.error(`[AgentRunner] ❌ Funding check failed:`, error);
      this.emitEvent('funding_failed', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Get specific agent by ID
   */
  getAgent(agentId: string): BuyerAgent | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Force a purchase for a specific agent (for testing)
   */
  async forcePurchase(agentId: string, maxBudget?: number): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    await agent.forcePurchase(maxBudget);
  }

  /**
   * Get runner status
   */
  getStatus() {
    const metrics = this.getMetrics();
    const uptimeSeconds = this.startTime ? Math.floor((Date.now() - this.startTime.getTime()) / 1000) : 0;

    return {
      is_running: this.isRunning,
      start_time: this.startTime?.toISOString(),
      uptime_seconds: uptimeSeconds,
      funding_manager: this.fundingManager.getStatus(),
      metrics,
      agents: this.getAgentStatuses().map(status => ({
        agent_id: status.agent_id,
        status: status.status,
        needs: status.needs,
        balance: status.balance,
        purchase_count: status.purchase_count,
        cycle_count: status.cycle_count
      }))
    };
  }

  /**
   * Create agent configurations from zoo accounts
   */
  private createAgentConfigs(): AgentConfig[] {
    const configs: AgentConfig[] = [];

    // Get attendee accounts
    const attendeeAccounts = [
      { id: 'attendee_1', role: 'attendee1' as const },
      { id: 'attendee_2', role: 'attendee2' as const },
      { id: 'attendee_3', role: 'attendee3' as const }
    ];

    for (const { id, role } of attendeeAccounts) {
      const account = getZooAccountByRole(role);

      if (!account) {
        console.error(`[AgentRunner] ❌ No account found for ${role}`);
        continue;
      }

      const config: AgentConfig = {
        agent_id: id,
        private_key: account.privateKey,
        address: account.address,
        initial_funding_amount: "50.00",
        refund_threshold: "10.00",
        refund_amount: "30.00",
        polling_interval_ms: 3000, // 3 seconds for fast testing
        need_decay_rate: {
          food_need: 12, // Fast degradation for testing
          fun_need: 8
        },
        purchase_threshold: {
          food_need: 40, // Purchase when food < 40
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
      console.log(`[AgentRunner] ✓ Created config for ${id} (${account.address})`);
    }

    return configs;
  }

  /**
   * Subscribe to events from an agent for aggregation
   */
  private subscribeToAgentEvents(agent: BuyerAgent): void {
    // Track purchases for metrics
    agent.on('purchase_completed', (event) => {
      this.totalPurchases++;
      this.totalSpent += parseFloat(event.data.purchase_record.amount);
    });

    // Forward all events with runner context
    const eventTypes: AgentEventType[] = [
      'agent_started', 'agent_stopped', 'needs_updated', 'purchase_initiated',
      'purchase_completed', 'purchase_failed', 'funding_received', 'funding_failed', 'error_occurred'
    ];

    for (const eventType of eventTypes) {
      agent.on(eventType, (event) => {
        this.emitEvent(eventType, event.data);
      });
    }
  }

  /**
   * Start periodic funding monitoring
   */
  private startFundingMonitor(): void {
    // Check funding every 30 seconds
    this.fundingCheckInterval = setInterval(() => {
      this.checkAndRefundAgents();
    }, 30000);

    console.log(`[AgentRunner] ⏰ Funding monitor started (30s intervals)`);
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

  private emitEvent(type: AgentEventType, data: any): void {
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
          console.error(`[AgentRunner] ❌ Event handler error:`, error);
        }
      });
    }
  }
}