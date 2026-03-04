import { describe, it, expect, beforeEach, vi } from 'vitest';
import { recordSale, getSkuDemandSummaries, resetDemandTracker } from '../agents/demand-tracker.js';

describe('DemandTracker', () => {
  beforeEach(() => {
    resetDemandTracker();
  });

  it('recordSale stores entries and getSkuDemandSummaries returns them', () => {
    const now = Date.now();
    recordSale({ sku: 'burger-1', name: 'Burger', amount: '5.00', timestamp: now });
    recordSale({ sku: 'burger-1', name: 'Burger', amount: '5.00', timestamp: now + 1000 });

    const summaries = getSkuDemandSummaries();
    expect(summaries).toHaveLength(1);
    expect(summaries[0].sku).toBe('burger-1');
    expect(summaries[0].sales_count).toBe(2);
    expect(summaries[0].total_revenue).toBeCloseTo(10.0);
  });

  it('tracks multiple SKUs independently', () => {
    const now = Date.now();
    recordSale({ sku: 'burger-1', name: 'Burger', amount: '5.00', timestamp: now });
    recordSale({ sku: 'soda-1', name: 'Soda', amount: '2.50', timestamp: now });
    recordSale({ sku: 'burger-1', name: 'Burger', amount: '5.00', timestamp: now + 500 });

    const summaries = getSkuDemandSummaries();
    expect(summaries).toHaveLength(2);

    const burger = summaries.find(s => s.sku === 'burger-1')!;
    const soda = summaries.find(s => s.sku === 'soda-1')!;

    expect(burger.sales_count).toBe(2);
    expect(soda.sales_count).toBe(1);
    expect(soda.total_revenue).toBeCloseTo(2.5);
  });

  it('computes velocity per minute', () => {
    const now = Date.now();
    recordSale({ sku: 'burger-1', name: 'Burger', amount: '5.00', timestamp: now });

    const summaries = getSkuDemandSummaries();
    // 1 sale in a 5-minute window = 0.2 per minute
    expect(summaries[0].velocity_per_minute).toBeCloseTo(0.2);
  });

  it('prunes old entries outside the rolling window', () => {
    const now = Date.now();
    const oldTimestamp = now - 6 * 60 * 1000; // 6 minutes ago (outside 5-min window)

    recordSale({ sku: 'burger-1', name: 'Burger', amount: '5.00', timestamp: oldTimestamp });
    recordSale({ sku: 'soda-1', name: 'Soda', amount: '2.50', timestamp: now });

    const summaries = getSkuDemandSummaries();
    // Old burger sale should be pruned
    expect(summaries).toHaveLength(1);
    expect(summaries[0].sku).toBe('soda-1');
  });

  it('resetDemandTracker clears all data', () => {
    recordSale({ sku: 'burger-1', name: 'Burger', amount: '5.00', timestamp: Date.now() });
    expect(getSkuDemandSummaries()).toHaveLength(1);

    resetDemandTracker();
    expect(getSkuDemandSummaries()).toHaveLength(0);
  });

  it('last_sale_ms_ago reflects time since last sale', () => {
    const now = Date.now();
    recordSale({ sku: 'burger-1', name: 'Burger', amount: '5.00', timestamp: now - 2000 });

    const summaries = getSkuDemandSummaries();
    // Should be approximately 2000ms ago (allow some tolerance)
    expect(summaries[0].last_sale_ms_ago).toBeGreaterThanOrEqual(1900);
    expect(summaries[0].last_sale_ms_ago).toBeLessThan(5000);
  });
});
