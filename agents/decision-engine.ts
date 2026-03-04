import { createLogger } from '../shared/logger.js';
import { config } from '../server/config.js';
import type { AgentNeeds, AgentConfig, MerchantProduct } from './types.js';

const log = createLogger('DecisionEngine');

/** Default simulation parameters — overridden by env-var config or constructor args */
export const SIMULATION_DEFAULTS = {
  pollingIntervalMs: 3000,
  needDecayRate: { food_need: 5, fun_need: 4 },
  purchaseThreshold: { food_need: 40, fun_need: 30 },
  needRecovery: { main: 70, snack: 50, beverage: 30, dessert: 60 },
  minBalanceThreshold: 5.0,
  maxPurchaseFrequencyMs: 2000,
  randomFactor: 0.2,
} as const;

interface DecisionEngineConfig {
  pollingIntervalMs: number;
  needDecayRate: {
    food_need: number;
    fun_need: number;
  };
  purchaseThreshold: {
    food_need: number;
    fun_need: number;
  };
  needRecovery: {
    main: number;
    snack: number;
    beverage: number;
    dessert: number;
  };
  minBalanceThreshold: number;
  maxPurchaseFrequencyMs: number;
  randomFactor: number;
}

export interface PurchaseDecision {
  shouldPurchase: boolean;
  reason: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  preferredCategory?: string;
  maxBudget: number;
  needsBefore: AgentNeeds;
  estimatedNeedsAfter?: AgentNeeds;
}

/** Build defaults from env-var config (server/config.ts) falling back to SIMULATION_DEFAULTS */
function buildConfigDefaults(): DecisionEngineConfig {
  return {
    pollingIntervalMs: config.zoo.agentPollingInterval || SIMULATION_DEFAULTS.pollingIntervalMs,
    needDecayRate: {
      food_need: config.zoo.needDecayRate || SIMULATION_DEFAULTS.needDecayRate.food_need,
      fun_need: SIMULATION_DEFAULTS.needDecayRate.fun_need,
    },
    purchaseThreshold: {
      food_need: config.zoo.purchaseThreshold || SIMULATION_DEFAULTS.purchaseThreshold.food_need,
      fun_need: SIMULATION_DEFAULTS.purchaseThreshold.fun_need,
    },
    needRecovery: { ...SIMULATION_DEFAULTS.needRecovery },
    minBalanceThreshold: config.zoo.minBalanceThreshold || SIMULATION_DEFAULTS.minBalanceThreshold,
    maxPurchaseFrequencyMs: SIMULATION_DEFAULTS.maxPurchaseFrequencyMs,
    randomFactor: SIMULATION_DEFAULTS.randomFactor,
  };
}

export class DecisionEngine {
  private readonly config: DecisionEngineConfig;
  private readonly agentId: string;

  constructor(agentId: string, customConfig?: Partial<DecisionEngineConfig>) {
    this.agentId = agentId;

    this.config = {
      ...buildConfigDefaults(),
      ...customConfig,
    };

    log.info(`[${this.agentId}] Decision engine initialized`);
    log.debug(`[${this.agentId}] Configuration:`, {
      polling_interval: `${this.config.pollingIntervalMs}ms`,
      food_decay_rate: `${this.config.needDecayRate.food_need} points/cycle`,
      purchase_threshold: this.config.purchaseThreshold.food_need,
      expected_purchase_frequency: `~${Math.ceil(100 / this.config.needDecayRate.food_need)}cycles (${Math.ceil(100 / this.config.needDecayRate.food_need * this.config.pollingIntervalMs / 1000)}sec)`
    });
  }

  /**
   * Degrade needs over time - this runs every polling cycle
   */
  degradeNeeds(currentNeeds: AgentNeeds): AgentNeeds {
    // Apply random degradation (1–20 per cycle) for visual variety
    const decay = Math.floor(Math.random() * 20) + 1;
    let newFoodNeed = currentNeeds.food_need - decay;

    // Clamp to 0-100 range
    newFoodNeed = Math.max(0, Math.min(100, newFoodNeed));

    const degradedNeeds = {
      food_need: Math.round(newFoodNeed),
      fun_need: currentNeeds.fun_need,
    };

    // Only log significant changes (every 10 points or when crossing thresholds)
    const foodChange = Math.abs(degradedNeeds.food_need - currentNeeds.food_need);
    const crossedThreshold =
      (currentNeeds.food_need >= this.config.purchaseThreshold.food_need && degradedNeeds.food_need < this.config.purchaseThreshold.food_need);

    if (foodChange >= 10 || crossedThreshold) {
      log.info(`[${this.agentId}] Needs degraded: food ${currentNeeds.food_need} -> ${degradedNeeds.food_need}${crossedThreshold ? ' [THRESHOLD CROSSED]' : ''}`);
    }

    return degradedNeeds;
  }

  /**
   * Evaluate whether agent should make a purchase
   */
  evaluatePurchaseDecision(
    currentNeeds: AgentNeeds,
    currentBalance: number,
    lastPurchaseTime: Date | null
  ): PurchaseDecision {
    log.debug(`[${this.agentId}] Evaluating purchase decision...`);
    log.debug(`[${this.agentId}] Current state: food=${currentNeeds.food_need}, balance=$${currentBalance.toFixed(2)}`);

    // Check balance
    if (currentBalance < this.config.minBalanceThreshold) {
      return {
        shouldPurchase: false,
        reason: `Insufficient balance ($${currentBalance.toFixed(2)} < $${this.config.minBalanceThreshold})`,
        urgency: 'low',
        maxBudget: 0,
        needsBefore: currentNeeds
      };
    }

    // Check purchase frequency limit
    if (lastPurchaseTime) {
      const timeSinceLastPurchase = Date.now() - lastPurchaseTime.getTime();
      if (timeSinceLastPurchase < this.config.maxPurchaseFrequencyMs) {
        return {
          shouldPurchase: false,
          reason: `Too soon since last purchase (${timeSinceLastPurchase}ms < ${this.config.maxPurchaseFrequencyMs}ms)`,
          urgency: 'low',
          maxBudget: 0,
          needsBefore: currentNeeds
        };
      }
    }

    // Evaluate need-based purchase decisions
    const foodUrgent = currentNeeds.food_need < this.config.purchaseThreshold.food_need;

    if (foodUrgent) {
      const urgency = this.calculateUrgency(currentNeeds.food_need, this.config.purchaseThreshold.food_need);
      const maxBudget = this.calculateMaxBudget(currentBalance, urgency);
      const preferredCategory = this.selectFoodCategory(currentNeeds.food_need);

      log.info(`[${this.agentId}] Food need urgent! (${currentNeeds.food_need} < ${this.config.purchaseThreshold.food_need})`);
      log.debug(`[${this.agentId}] Budget allocated: $${maxBudget.toFixed(2)} (urgency: ${urgency})`);

      return {
        shouldPurchase: true,
        reason: `Food need critical: ${currentNeeds.food_need}/${this.config.purchaseThreshold.food_need}`,
        urgency,
        preferredCategory,
        maxBudget,
        needsBefore: currentNeeds,
        estimatedNeedsAfter: this.estimateNeedsAfterPurchase(currentNeeds, preferredCategory)
      };
    }

    // No urgent needs
    log.debug(`[${this.agentId}] No urgent needs (food: ${currentNeeds.food_need}/${this.config.purchaseThreshold.food_need})`);
    return {
      shouldPurchase: false,
      reason: `All needs above threshold (food: ${currentNeeds.food_need}/${this.config.purchaseThreshold.food_need})`,
      urgency: 'low',
      maxBudget: 0,
      needsBefore: currentNeeds
    };
  }

  /**
   * Calculate need recovery after purchasing a product
   */
  calculateNeedRecovery(currentNeeds: AgentNeeds, product: MerchantProduct): AgentNeeds {
    const category = product.category.toLowerCase();
    const recoveryAmount = this.config.needRecovery[category as keyof typeof this.config.needRecovery] || 40;

    // Add some randomness to recovery (+/- 20%)
    const randomFactor = (Math.random() - 0.5) * 0.4; // -0.2 to +0.2
    const actualRecovery = Math.round(recoveryAmount * (1 + randomFactor));

    const newFoodNeed = Math.min(100, currentNeeds.food_need + actualRecovery);

    const newNeeds = {
      food_need: newFoodNeed,
      fun_need: currentNeeds.fun_need,
    };

    log.info(`[${this.agentId}] Need recovery: ${product.name} (${category}) +${actualRecovery} -> food: ${currentNeeds.food_need} -> ${newNeeds.food_need}`);

    return newNeeds;
  }

  /**
   * Calculate urgency level based on need value
   */
  private calculateUrgency(needValue: number, threshold: number): 'low' | 'medium' | 'high' | 'critical' {
    const ratio = needValue / threshold;

    if (ratio > 0.8) return 'low';
    if (ratio > 0.5) return 'medium';
    if (ratio > 0.2) return 'high';
    return 'critical';
  }

  /**
   * Calculate maximum budget based on balance and urgency
   */
  private calculateMaxBudget(currentBalance: number, urgency: 'low' | 'medium' | 'high' | 'critical'): number {
    const urgencyMultipliers = {
      'low': 0.2,
      'medium': 0.4,
      'high': 0.6,
      'critical': 0.8
    };

    const multiplier = urgencyMultipliers[urgency];
    const maxBudget = currentBalance * multiplier;

    return Math.max(0, maxBudget - this.config.minBalanceThreshold);
  }

  /**
   * Select preferred food category based on need level
   */
  private selectFoodCategory(foodNeed: number): string | undefined {
    if (foodNeed < 20) return 'main';
    if (foodNeed < 30) return 'snack';
    if (foodNeed < 35) return 'beverage';
    return undefined;
  }

  /**
   * Estimate needs after purchase for decision preview
   */
  private estimateNeedsAfterPurchase(currentNeeds: AgentNeeds, preferredCategory?: string): AgentNeeds {
    const category = preferredCategory || 'snack';
    const recoveryAmount = this.config.needRecovery[category as keyof typeof this.config.needRecovery] || 40;

    return {
      food_need: Math.min(100, currentNeeds.food_need + recoveryAmount),
      fun_need: currentNeeds.fun_need
    };
  }

  /**
   * Get decision engine configuration
   */
  getConfig(): DecisionEngineConfig {
    return { ...this.config };
  }

  /**
   * Update configuration dynamically
   */
  updateConfig(updates: Partial<DecisionEngineConfig>): void {
    Object.assign(this.config, updates);
    log.info(`[${this.agentId}] Configuration updated:`, updates);
  }

  /**
   * Get expected time until next purchase (for monitoring)
   */
  getExpectedTimeUntilPurchase(currentNeeds: AgentNeeds): number {
    const needsAboveThreshold = Math.max(0, currentNeeds.food_need - this.config.purchaseThreshold.food_need);
    const cyclesUntilPurchase = Math.ceil(needsAboveThreshold / this.config.needDecayRate.food_need);
    return cyclesUntilPurchase * this.config.pollingIntervalMs;
  }

  /**
   * Generate status report for monitoring
   */
  getStatus(currentNeeds: AgentNeeds, currentBalance: number, lastPurchaseTime: Date | null) {
    const timeUntilPurchase = this.getExpectedTimeUntilPurchase(currentNeeds);
    const decision = this.evaluatePurchaseDecision(currentNeeds, currentBalance, lastPurchaseTime);

    return {
      agent_id: this.agentId,
      current_needs: currentNeeds,
      current_balance: currentBalance,
      time_until_purchase_ms: timeUntilPurchase,
      time_until_purchase_sec: Math.round(timeUntilPurchase / 1000),
      purchase_decision: decision,
      configuration: {
        polling_interval_ms: this.config.pollingIntervalMs,
        food_decay_rate: this.config.needDecayRate.food_need,
        purchase_threshold: this.config.purchaseThreshold.food_need
      },
      last_purchase_time: lastPurchaseTime
    };
  }
}
