import { createLogger } from '../shared/logger.js';
import type { BalanceHistoryEntry } from '../shared/types.js';

const log = createLogger('BalanceHistory');

const MAX_ENTRIES_PER_AGENT = 200;

/**
 * In-memory tracker for agent balance history.
 * Subscribes to purchase_completed and funding_completed events
 * to build a timestamped balance history per agent.
 */
export class BalanceHistoryTracker {
  private history: Map<string, BalanceHistoryEntry[]> = new Map();

  record(agentId: string, entry: BalanceHistoryEntry): void {
    if (!this.history.has(agentId)) {
      this.history.set(agentId, []);
    }
    const entries = this.history.get(agentId)!;
    entries.push(entry);

    // Cap at max entries
    if (entries.length > MAX_ENTRIES_PER_AGENT) {
      entries.splice(0, entries.length - MAX_ENTRIES_PER_AGENT);
    }

    log.debug(`Recorded ${entry.event} for ${agentId}: $${entry.balance}`);
  }

  getHistory(agentId: string): BalanceHistoryEntry[] {
    return this.history.get(agentId) ?? [];
  }

  getAllAgentIds(): string[] {
    return Array.from(this.history.keys());
  }

  clear(): void {
    this.history.clear();
  }
}

// Singleton instance
export const balanceHistoryTracker = new BalanceHistoryTracker();
