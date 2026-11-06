/**
 * Depletion monitor: a buyer counts as depleted when below the threshold, or when the
 * amount above its reserve cannot cover the cheapest menu item.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DecisionEngine } from '../agents/decision-engine.js';

const balances: Record<string, number> = {};
let inventory: Array<{ price: string }> = [];

vi.mock('../server/config.js', () => ({
  config: { zoo: { minBalanceThreshold: 10 } },
}));
vi.mock('../server/tempo-client.js', () => ({ ALPHA_USD: 'alpha' }));
vi.mock('../server/zoo-accounts.js', () => ({
  resetZooAccounts: vi.fn(),
  getAllZooAccounts: vi.fn(() => []),
  getZooAccountByRole: (role: string) =>
    role in balances
      ? { balances: { alpha: BigInt(Math.round(balances[role] * 1_000_000)) } }
      : undefined,
}));
vi.mock('../server/routes/zoo-shared.js', () => ({
  refreshZooBalances: vi.fn(async () => {}),
  loadZooRegistry: () => ({
    merchants: [{ category: 'food', menu: [{ price: '3.50' }, { price: '2.50' }] }],
  }),
}));
vi.mock('../agents/merchant-inventory.js', () => ({
  getInventorySnapshot: () => inventory,
}));
vi.mock('../agents/buyer-agent.js', () => ({ BuyerAgent: class {} }));
vi.mock('../agents/merchant-agent.js', () => ({ MerchantAgent: class {} }));
vi.mock('../agents/state-manager.js', () => ({ getStateManager: vi.fn() }));
vi.mock('../agents/wallet-generator.js', () => ({ generateAllWallets: vi.fn() }));
vi.mock('../agents/wallet-funder.js', () => ({ fundZooWallets: vi.fn() }));
vi.mock('../agents/llm/llm-client.js', () => ({ LLMClient: class {} }));
vi.mock('../agents/llm/buyer-brain.js', () => ({ BuyerBrain: class {} }));
vi.mock('../agents/llm/merchant-brain.js', () => ({ MerchantBrain: class {} }));
vi.mock('../agents/demand-tracker.js', () => ({ resetDemandTracker: vi.fn() }));

const { AgentRunner } = await import('../agents/agent-runner.js');

/** Minimal stand-in for BuyerAgent backed by a real DecisionEngine with a $10 reserve. */
function fakeBuyer(id: string) {
  const engine = new DecisionEngine(id, { minBalanceThreshold: 10 });
  return { canAffordPurchase: (b: number, p?: number) => engine.canAffordPurchase(b, p) };
}

function setupRunner() {
  const runner = new AgentRunner();
  const internals = runner as unknown as {
    isRunning: boolean;
    agents: Map<string, unknown>;
    startDepletionMonitor: () => void;
    stop: () => Promise<void>;
  };
  internals.isRunning = true;
  for (const id of ['guest_1', 'guest_2', 'guest_3']) internals.agents.set(id, fakeBuyer(id));

  const stop = vi.fn(async () => {
    internals.isRunning = false;
  });
  internals.stop = stop;

  const events: Array<{ type: string; data: Record<string, unknown> }> = [];
  runner.on('simulation_depleted', (e) => events.push({ type: e.type, data: e.data as Record<string, unknown> }));

  internals.startDepletionMonitor();
  return { stop, events };
}

describe('AgentRunner depletion monitor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    for (const k of Object.keys(balances)) delete balances[k];
    inventory = [];
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('stops when every buyer is above the threshold but cannot afford the cheapest item', async () => {
    inventory = [{ price: '3.50' }, { price: '2.50' }];
    Object.assign(balances, { guest1: 12, guest2: 11.5, guest3: 12.49 });
    const { stop, events } = setupRunner();

    await vi.advanceTimersByTimeAsync(10_000);

    expect(stop).toHaveBeenCalledTimes(1);
    expect(events[0].data.cheapest_price).toBe(2.5);
  });

  it('keeps running while any buyer can still afford the cheapest item', async () => {
    inventory = [{ price: '3.50' }, { price: '2.50' }];
    Object.assign(balances, { guest1: 12, guest2: 5, guest3: 12.5 });
    const { stop } = setupRunner();

    await vi.advanceTimersByTimeAsync(10_000);

    expect(stop).not.toHaveBeenCalled();
  });

  it('still stops when every buyer is below the threshold', async () => {
    inventory = [{ price: '2.50' }];
    Object.assign(balances, { guest1: 9, guest2: 0, guest3: 9.99 });
    const { stop } = setupRunner();

    await vi.advanceTimersByTimeAsync(10_000);

    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('falls back to registry menu prices when live inventory is empty', async () => {
    // Registry cheapest is $2.50: $12 leaves $2 spendable
    Object.assign(balances, { guest1: 12, guest2: 12, guest3: 12 });
    const { stop } = setupRunner();

    await vi.advanceTimersByTimeAsync(10_000);

    expect(stop).toHaveBeenCalledTimes(1);
  });
});
