import type { AgentNeeds, AgentConfig, MerchantProduct } from './types.js';

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

export class DecisionEngine {
  private readonly config: DecisionEngineConfig;
  private readonly agentId: string;

  constructor(agentId: string, customConfig?: Partial<DecisionEngineConfig>) {
    this.agentId = agentId;

    // Fast testing configuration for 10-20 second purchase cycles
    this.config = {
      pollingIntervalMs: 3000, // 3 seconds
      needDecayRate: {
        food_need: 5, // 5 points per 3-second cycle = slower degradation
        fun_need: 4   // 4 points per 3-second cycle (future feature)
      },
      purchaseThreshold: {
        food_need: 40,  // Purchase when food need < 40
        fun_need: 30    // Purchase when fun need < 30 (future)
      },
      needRecovery: {
        main: 70,       // Main dishes recover 70 points
        snack: 50,      // Snacks recover 50 points
        beverage: 30,   // Beverages recover 30 points
        dessert: 60     // Desserts recover 60 points
      },
      minBalanceThreshold: 5.0, // Minimum balance to attempt purchase
      maxPurchaseFrequencyMs: 2000, // Min 2 seconds between purchases
      randomFactor: 0.2, // 20% randomness factor
      ...customConfig
    };

    console.log(`[DecisionEngine:${this.agentId}] 🧠 Decision engine initialized`);
    console.log(`[DecisionEngine:${this.agentId}] ⚙️  Configuration:`, {
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
    // Apply base degradation
    let newFoodNeed = currentNeeds.food_need - this.config.needDecayRate.food_need;
    let newFunNeed = currentNeeds.fun_need - this.config.needDecayRate.fun_need;

    // Apply randomness factor (-20% to +20% variation)
    const randomFactor = this.config.randomFactor;
    newFoodNeed += (Math.random() - 0.5) * 2 * randomFactor * this.config.needDecayRate.food_need;
    newFunNeed += (Math.random() - 0.5) * 2 * randomFactor * this.config.needDecayRate.fun_need;

    // Clamp to 0-100 range
    newFoodNeed = Math.max(0, Math.min(100, newFoodNeed));
    newFunNeed = Math.max(0, Math.min(100, newFunNeed));

    const degradedNeeds = {
      food_need: Math.round(newFoodNeed),
      fun_need: Math.round(newFunNeed)
    };

    // Only log significant changes (every 10 points or when crossing thresholds)
    const foodChange = Math.abs(degradedNeeds.food_need - currentNeeds.food_need);
    const crossedThreshold =
      (currentNeeds.food_need >= this.config.purchaseThreshold.food_need && degradedNeeds.food_need < this.config.purchaseThreshold.food_need) ||
      (currentNeeds.fun_need >= this.config.purchaseThreshold.fun_need && degradedNeeds.fun_need < this.config.purchaseThreshold.fun_need);

    if (foodChange >= 10 || crossedThreshold) {
      console.log(`[DecisionEngine:${this.agentId}] 📉 Needs degraded: food ${currentNeeds.food_need} → ${degradedNeeds.food_need}${crossedThreshold ? ' [THRESHOLD CROSSED]' : ''}`);
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
    console.log(`[DecisionEngine:${this.agentId}] 🤔 Evaluating purchase decision...`);
    console.log(`[DecisionEngine:${this.agentId}] 📊 Current state: food=${currentNeeds.food_need}, balance=$${currentBalance.toFixed(2)}`);

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
    const funUrgent = currentNeeds.fun_need < this.config.purchaseThreshold.fun_need;

    // For now, only handle food needs (fun needs are future feature)
    if (foodUrgent) {
      const urgency = this.calculateUrgency(currentNeeds.food_need, this.config.purchaseThreshold.food_need);
      const maxBudget = this.calculateMaxBudget(currentBalance, urgency);
      const preferredCategory = this.selectFoodCategory(currentNeeds.food_need);

      console.log(`[DecisionEngine:${this.agentId}] 🚨 Food need urgent! (${currentNeeds.food_need} < ${this.config.purchaseThreshold.food_need})`);
      console.log(`[DecisionEngine:${this.agentId}] 💰 Budget allocated: $${maxBudget.toFixed(2)} (urgency: ${urgency})`);

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
    console.log(`[DecisionEngine:${this.agentId}] ✓ No urgent needs (food: ${currentNeeds.food_need}/${this.config.purchaseThreshold.food_need})`);
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
      fun_need: currentNeeds.fun_need // No fun recovery from food (future feature)
    };

    console.log(`[DecisionEngine:${this.agentId}] 🍽️  Need recovery: ${product.name} (${category}) +${actualRecovery} → food: ${currentNeeds.food_need} → ${newNeeds.food_need}`);

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
      'low': 0.2,      // 20% of balance
      'medium': 0.4,   // 40% of balance
      'high': 0.6,     // 60% of balance
      'critical': 0.8  // 80% of balance
    };

    const multiplier = urgencyMultipliers[urgency];
    const maxBudget = currentBalance * multiplier;

    // Ensure we always keep minimum balance for future purchases
    return Math.max(0, maxBudget - this.config.minBalanceThreshold);
  }

  /**
   * Select preferred food category based on need level
   */
  private selectFoodCategory(foodNeed: number): string | undefined {
    // Higher urgency = prefer more substantial food
    if (foodNeed < 20) return 'main';      // Very hungry - need main dish
    if (foodNeed < 30) return 'snack';     // Moderately hungry - snack is fine
    if (foodNeed < 35) return 'beverage';  // Slightly hungry - just a drink
    return undefined; // No specific preference
  }

  /**
   * Estimate needs after purchase for decision preview
   */
  private estimateNeedsAfterPurchase(currentNeeds: AgentNeeds, preferredCategory?: string): AgentNeeds {
    const category = preferredCategory || 'snack'; // Default estimate
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
    console.log(`[DecisionEngine:${this.agentId}] ⚙️  Configuration updated:`, updates);
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