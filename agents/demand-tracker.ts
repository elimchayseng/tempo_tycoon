import { createLogger } from '../shared/logger.js';
import type { SaleRecord, SkuDemandSummary } from './types.js';

const log = createLogger('DemandTracker');

const WINDOW_MS = 5 * 60 * 1000; // 5-minute rolling window

// Module-level singleton (mirrors merchant-inventory.ts pattern)
const sales: SaleRecord[] = [];

export function recordSale(record: SaleRecord): void {
  sales.push(record);
}

export function getSkuDemandSummaries(): SkuDemandSummary[] {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;

  // Prune old entries
  while (sales.length > 0 && sales[0].timestamp < cutoff) {
    sales.shift();
  }

  // Aggregate per SKU
  const map = new Map<string, { name: string; count: number; revenue: number; lastSale: number }>();

  for (const sale of sales) {
    const existing = map.get(sale.sku);
    if (existing) {
      existing.count += 1;
      existing.revenue += parseFloat(sale.amount);
      existing.lastSale = Math.max(existing.lastSale, sale.timestamp);
    } else {
      map.set(sale.sku, {
        name: sale.name,
        count: 1,
        revenue: parseFloat(sale.amount),
        lastSale: sale.timestamp,
      });
    }
  }

  const summaries: SkuDemandSummary[] = [];

  for (const [sku, data] of map) {
    const windowMinutes = WINDOW_MS / 60_000;
    const summary: SkuDemandSummary = {
      sku,
      name: data.name,
      sales_count: data.count,
      total_revenue: data.revenue,
      velocity_per_minute: data.count / windowMinutes,
      last_sale_ms_ago: now - data.lastSale,
    };
    summaries.push(summary);

    log.debug(`Demand summary: ${sku} velocity=${summary.velocity_per_minute.toFixed(2)}/min, sales=${data.count}, last_sale=${summary.last_sale_ms_ago}ms ago`);
  }

  return summaries;
}

export function resetDemandTracker(): void {
  sales.length = 0;
  log.info('Demand tracker reset');
}
