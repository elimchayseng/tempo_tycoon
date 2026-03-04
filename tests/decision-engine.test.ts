/**
 * Migrated from scripts/test-unit-logic.ts — DecisionEngine tests using vitest.
 */
import { describe, it, expect } from 'vitest';
import { DecisionEngine, SIMULATION_DEFAULTS } from '../agents/decision-engine.js';

describe('DecisionEngine', () => {
  const engine = new DecisionEngine('test-agent', {
    needDecayRate: { food_need: 5, fun_need: 4 },
    purchaseThreshold: { food_need: 40, fun_need: 30 },
  });

  describe('degradeNeeds', () => {
    it('reduces food_need by 1-40 (random decay)', () => {
      const needs = { food_need: 80, fun_need: 60 };
      const degraded = engine.degradeNeeds(needs);
      expect(degraded.food_need).toBeGreaterThanOrEqual(40);
      expect(degraded.food_need).toBeLessThanOrEqual(79);
    });

    it('does not touch fun_need', () => {
      const degraded = engine.degradeNeeds({ food_need: 80, fun_need: 60 });
      expect(degraded.fun_need).toBe(60);
    });

    it('clamps food_need at 0', () => {
      const degraded = engine.degradeNeeds({ food_need: 2, fun_need: 50 });
      expect(degraded.food_need).toBeGreaterThanOrEqual(0);
    });
  });

  describe('evaluatePurchaseDecision', () => {
    it('returns shouldPurchase=false when food above threshold', () => {
      const decision = engine.evaluatePurchaseDecision({ food_need: 60, fun_need: 50 }, 100, null);
      expect(decision.shouldPurchase).toBe(false);
    });

    it('returns shouldPurchase=true when food below threshold', () => {
      const decision = engine.evaluatePurchaseDecision({ food_need: 20, fun_need: 50 }, 100, null);
      expect(decision.shouldPurchase).toBe(true);
      expect(decision.urgency).not.toBe('low');
      expect(decision.maxBudget).toBeGreaterThan(0);
      expect(decision.preferredCategory).toBeDefined();
    });

    it('returns shouldPurchase=false when balance below threshold', () => {
      const decision = engine.evaluatePurchaseDecision({ food_need: 10, fun_need: 50 }, 2, null);
      expect(decision.shouldPurchase).toBe(false);
    });

    it('returns shouldPurchase=false when too soon after last purchase', () => {
      const decision = engine.evaluatePurchaseDecision({ food_need: 10, fun_need: 50 }, 100, new Date());
      expect(decision.shouldPurchase).toBe(false);
    });

    it('urgency is critical when food very low', () => {
      const decision = engine.evaluatePurchaseDecision({ food_need: 5, fun_need: 50 }, 100, null);
      expect(decision.urgency).toBe('critical');
    });

    it('critical urgency gets >= budget than high urgency', () => {
      const critical = engine.evaluatePurchaseDecision({ food_need: 5, fun_need: 50 }, 100, null);
      const high = engine.evaluatePurchaseDecision({ food_need: 15, fun_need: 50 }, 100, null);
      expect(critical.maxBudget).toBeGreaterThanOrEqual(high.maxBudget);
    });

    it('selects main category when food_need < 20', () => {
      const decision = engine.evaluatePurchaseDecision({ food_need: 10, fun_need: 50 }, 100, null);
      expect(decision.preferredCategory).toBe('main');
    });

    it('selects snack category when food_need 20-30', () => {
      const decision = engine.evaluatePurchaseDecision({ food_need: 25, fun_need: 50 }, 100, null);
      expect(decision.preferredCategory).toBe('snack');
    });
  });

  describe('calculateNeedRecovery', () => {
    it('increases food_need after purchase', () => {
      const product = { sku: 'main-1', name: 'Burger', price: '5.00', currency: 'AlphaUSD', category: 'main', satisfaction_value: 70, available: true };
      const recovered = engine.calculateNeedRecovery({ food_need: 20, fun_need: 50 }, product);
      expect(recovered.food_need).toBeGreaterThan(20);
      expect(recovered.food_need).toBeLessThanOrEqual(100);
    });
  });

  describe('SIMULATION_DEFAULTS', () => {
    it('has correct default values', () => {
      expect(SIMULATION_DEFAULTS.pollingIntervalMs).toBe(3000);
      expect(SIMULATION_DEFAULTS.needDecayRate.food_need).toBe(5);
    });
  });
});
