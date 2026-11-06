/**
 * Migrated from scripts/test-unit-logic.ts — DecisionEngine tests using vitest.
 */
import { describe, it, expect } from 'vitest';
import { DecisionEngine, SIMULATION_DEFAULTS, getCheapestPrice } from '../agents/decision-engine.js';

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

  describe('evaluatePurchaseDecision — low balance budgeting', () => {
    const reserve = 10;
    const cheapest = 2.5;
    const lowBalanceEngine = new DecisionEngine('low-balance-agent', {
      purchaseThreshold: { food_need: 40, fun_need: 30 },
      minBalanceThreshold: reserve,
    });
    // food_need 35 / threshold 40 -> ratio 0.875 -> 'low' urgency
    const lowUrgencyNeeds = { food_need: 35, fun_need: 50 };

    it('approves a purchase with a usable budget at ~$40 and low urgency (regression)', () => {
      const decision = lowBalanceEngine.evaluatePurchaseDecision(lowUrgencyNeeds, 40, null, cheapest);
      expect(decision.urgency).toBe('low');
      expect(decision.shouldPurchase).toBe(true);
      expect(decision.maxBudget).toBeGreaterThanOrEqual(cheapest);
      expect(decision.maxBudget).toBeLessThanOrEqual(40 - reserve);
    });

    it('approves with a positive budget when catalog price is unknown', () => {
      const decision = lowBalanceEngine.evaluatePurchaseDecision(lowUrgencyNeeds, 40, null);
      expect(decision.shouldPurchase).toBe(true);
      expect(decision.maxBudget).toBeGreaterThan(0);
    });

    it('raises the budget to the cheapest item when the scaled budget falls short', () => {
      // spendable $3, low-urgency scaled $0.60 -> raised to the $2.50 cheapest item
      const decision = lowBalanceEngine.evaluatePurchaseDecision(lowUrgencyNeeds, 13, null, cheapest);
      expect(decision.shouldPurchase).toBe(true);
      expect(decision.maxBudget).toBe(cheapest);
    });

    it('declines when the spendable balance cannot cover the cheapest item', () => {
      // spendable $2 < $2.50 cheapest
      const decision = lowBalanceEngine.evaluatePurchaseDecision({ food_need: 5, fun_need: 50 }, 12, null, cheapest);
      expect(decision.shouldPurchase).toBe(false);
      expect(decision.maxBudget).toBe(0);
      expect(decision.reason).toMatch(/cheapest item \$2\.50/);
    });

    it('declines when balance sits exactly at the reserve', () => {
      const decision = lowBalanceEngine.evaluatePurchaseDecision({ food_need: 5, fun_need: 50 }, reserve, null);
      expect(decision.shouldPurchase).toBe(false);
      expect(decision.maxBudget).toBe(0);
    });

    it('still reports insufficient balance below the reserve', () => {
      const decision = lowBalanceEngine.evaluatePurchaseDecision({ food_need: 5, fun_need: 50 }, 9.99, null, cheapest);
      expect(decision.shouldPurchase).toBe(false);
      expect(decision.reason).toMatch(/Insufficient balance/);
    });

    it('never approves a budget that is zero, below the cheapest item, or above spendable', () => {
      for (const balance of [10, 10.5, 11, 12.49, 12.5, 13, 15, 20, 40, 50, 100]) {
        for (const food_need of [1, 10, 15, 25, 35, 39]) {
          const decision = lowBalanceEngine.evaluatePurchaseDecision({ food_need, fun_need: 50 }, balance, null, cheapest);
          if (decision.shouldPurchase) {
            expect(decision.maxBudget).toBeGreaterThanOrEqual(cheapest);
            expect(decision.maxBudget).toBeLessThanOrEqual(balance - reserve + 1e-9);
          } else {
            expect(balance - reserve).toBeLessThan(cheapest);
          }
        }
      }
    });
  });

  describe('canAffordPurchase', () => {
    const reserveEngine = new DecisionEngine('afford-agent', { minBalanceThreshold: 10 });

    it('is false below the reserve', () => {
      expect(reserveEngine.canAffordPurchase(9.99, 2.5)).toBe(false);
    });

    it('is false when the amount above the reserve is below the cheapest item', () => {
      expect(reserveEngine.canAffordPurchase(12.49, 2.5)).toBe(false);
    });

    it('is true when the amount above the reserve covers the cheapest item exactly', () => {
      expect(reserveEngine.canAffordPurchase(12.5, 2.5)).toBe(true);
    });

    it('requires a positive spendable amount when the price is unknown', () => {
      expect(reserveEngine.canAffordPurchase(10)).toBe(false);
      expect(reserveEngine.canAffordPurchase(10.01)).toBe(true);
    });

    it('agrees with evaluatePurchaseDecision for a hungry agent', () => {
      for (const balance of [10, 11, 12.49, 12.5, 13, 20, 40]) {
        const decision = reserveEngine.evaluatePurchaseDecision({ food_need: 5, fun_need: 50 }, balance, null, 2.5);
        expect(decision.shouldPurchase).toBe(reserveEngine.canAffordPurchase(balance, 2.5));
      }
    });
  });

  describe('getCheapestPrice', () => {
    it('returns the lowest parseable positive price', () => {
      expect(getCheapestPrice([{ price: '3.50' }, { price: '2.50' }, { price: 'n/a' }, { price: '0' }])).toBe(2.5);
    });

    it('returns undefined for an empty list', () => {
      expect(getCheapestPrice([])).toBeUndefined();
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
