import { Hono } from "hono";
import { createLogger } from "../../shared/logger.js";
import { config } from "../config.js";
import { AgentRunner } from "../../agents/agent-runner.js";
import { emitLog, broadcast } from "../instrumented-client.js";
import { getZooAccountByRole, clearZooAccounts } from "../zoo-accounts.js";
import { accountStore } from "../accounts.js";
import { refreshZooBalances, loadZooRegistry, getAgentRunner, setAgentRunner } from "./zoo-shared.js";
import { fetchNetworkStats, incrementZooTxCount } from "./zoo-blockchain.js";
import { balanceHistoryTracker } from "../balance-history.js";
import type { ZooAgentState, ZooPurchaseReceipt, TransactionFlowEvent, BalanceUpdate, ZooMerchantState, ZooRestockEvent } from "../../shared/types.js";
import type { AgentEventType } from "../../agents/types.js";
import { getInventorySnapshot } from "../../agents/merchant-inventory.js";

const log = createLogger('zoo-agents');

export const zooAgentRoutes = new Hono();

function broadcastAgentStates() {
  const runner_ = getAgentRunner();
  if (!runner_) return;
  try {
    const agentStatuses = runner_.getAgentStatuses();
    const agents: ZooAgentState[] = agentStatuses.map((a) => ({
      agent_id: a.agent_id,
      address: a.wallet_address ?? '',
      status: a.status,
      needs: a.needs ?? { food_need: 100, fun_need: 100 },
      balance: String(a.balance ?? '0'),
      purchase_count: a.purchase_count ?? 0,
      total_spent: String(a.total_spent ?? '0'),
    }));
    broadcast({ type: 'zoo_agents', agents });
  } catch (err) {
    log.debug('Failed to broadcast agent states', err);
  }
}

// Initialize AgentRunner if zoo simulation is enabled
if (config.zoo.enabled) {
  const runner = new AgentRunner();
  setAgentRunner(runner);

  refreshZooBalances().then(() => {
    log.info('Zoo account balances refreshed from chain');
    broadcast({ type: "accounts", accounts: accountStore.toPublic() });
  }).catch((err) => {
    log.warn('Failed to refresh zoo balances:', err);
  });

  runner.on('simulation_started', (event) => {
    emitLog({
      action: 'zoo_simulation',
      type: 'info',
      label: 'Zoo Simulation Started',
      data: event.data
    });
  });

  // Broadcast funding progress during wallet init
  runner.on('funding_progress' as AgentEventType, (event: any) => {
    broadcast({ type: 'zoo_funding_progress', step: event.data.step, detail: event.data.detail });
  });

  // Auto-stop on depletion — broadcast completion event
  runner.on('simulation_depleted' as AgentEventType, (event: any) => {
    emitLog({
      action: 'zoo_simulation',
      type: 'info',
      label: 'Simulation Complete — All buyers depleted',
      data: event.data,
    });
    broadcast({ type: 'zoo_simulation_complete', data: event.data });
  });

  // Broadcast network stats every 5 seconds while simulation is active
  let networkStatsInterval: ReturnType<typeof setInterval> | null = null;

  runner.on('simulation_started', () => {
    networkStatsInterval = setInterval(async () => {
      try {
        const stats = await fetchNetworkStats();
        broadcast({ type: 'zoo_network_stats', stats });
      } catch (err) {
        log.debug('Failed to broadcast network stats', err);
      }
    }, 5000);
  });

  runner.on('simulation_stopped', () => {
    if (networkStatsInterval) {
      clearInterval(networkStatsInterval);
      networkStatsInterval = null;
    }
    // Clear ephemeral zoo accounts so next preflight starts fresh
    clearZooAccounts();
  });

  // Emit tx flow events at purchase stages
  runner.on('purchase_initiated', (event) => {
    const flowEvent: TransactionFlowEvent = {
      agent_id: event.agent_id,
      stage: 'decision',
      timestamp: Date.now(),
      data: { max_budget: event.data.max_budget, needs: event.data.current_needs },
    };
    broadcast({ type: 'zoo_tx_flow', event: flowEvent });
  });

  // Forward tx_flow events from buyer agents
  runner.on('tx_flow', (event: any) => {
    const flowEvent: TransactionFlowEvent = {
      agent_id: event.agent_id,
      stage: event.data.stage,
      timestamp: event.data.timestamp,
      data: event.data.data ?? {},
    };
    broadcast({ type: 'zoo_tx_flow', event: flowEvent });
  });

  runner.on('purchase_completed', (event) => {
    const rec = event.data.purchase_record;
    const itemNames = rec.items?.map((i: { name: string }) => i.name).join(' + ') ?? 'Unknown';

    emitLog({
      action: 'zoo_purchase',
      type: 'info',
      label: `Purchase: ${itemNames} ($${rec.amount})`,
      data: {
        agent_id: event.agent_id,
        items: rec.items,
        amount: rec.amount,
        tx_hash: rec.tx_hash,
        new_needs: event.data.new_needs
      }
    });

    // Increment zoo tx counter
    incrementZooTxCount();

    const registry = loadZooRegistry();
    const merchantName = registry.merchants?.[0]?.name ?? 'Unknown Merchant';
    const merchantAccount = getZooAccountByRole('merchantA');
    // Map agent_id (guest_1) → role key (guest1) for account lookup
    const agentRoleKey = event.agent_id.replace('_', '') as any;
    const agentAccount = getZooAccountByRole(agentRoleKey);
    const receipt: ZooPurchaseReceipt = {
      agent_id: event.agent_id,
      agent_address: agentAccount?.address ?? '',
      items: rec.items ?? [],
      amount: String(rec.amount),
      merchant_name: merchantName,
      merchant_address: merchantAccount?.address ?? '',
      tx_hash: rec.tx_hash ?? '',
      block_number: String(rec.block_number ?? ''),
      gas_used: String(rec.gas_used ?? ''),
      fee_ausd: rec.fee_ausd ?? undefined,
      fee_payer: rec.fee_payer ?? undefined,
      need_before: rec.need_before?.food_need ?? 0,
      need_after: event.data.new_needs?.food_need ?? 0,
      timestamp: Date.now(),
    };
    broadcast({ type: 'zoo_purchase', receipt });

    // Emit tx flow: confirmed stage
    const confirmedFlow: TransactionFlowEvent = {
      agent_id: event.agent_id,
      stage: 'confirmed',
      timestamp: Date.now(),
      data: { tx_hash: rec.tx_hash, block_number: rec.block_number },
    };
    broadcast({ type: 'zoo_tx_flow', event: confirmedFlow });

    // Emit balance update
    const balanceUpdate: BalanceUpdate = {
      agent_id: event.agent_id,
      balance: String(event.data.new_balance ?? '0'),
      previous: '', // We don't track previous here; the frontend can diff
      event: 'purchase',
      tx_hash: rec.tx_hash,
    };
    broadcast({ type: 'zoo_balance_update', update: balanceUpdate });

    // Record balance history
    balanceHistoryTracker.record(event.agent_id, {
      timestamp: Date.now(),
      balance: String(event.data.new_balance ?? '0'),
      event: 'purchase',
      tx_hash: rec.tx_hash,
    });

    broadcastAgentStates();

    refreshZooBalances().then(() => {
      broadcast({ type: "accounts", accounts: accountStore.toPublic() });
    }).catch((err) => {
      log.debug('Failed to refresh balances after purchase', err);
    });
  });

  runner.on('needs_updated', (event) => {
    emitLog({
      action: 'zoo_needs',
      type: 'rpc_result',
      label: `${event.agent_id} needs: food=${event.data.current_needs.food_need}`,
      data: {
        agent_id: event.agent_id,
        needs: event.data.current_needs,
        cycle: event.data.cycle_count
      }
    });

    broadcastAgentStates();
  });

  // Merchant agent event wiring
  runner.on('merchant_cycle_completed', (event) => {
    const merchantState: ZooMerchantState = event.data;
    broadcast({ type: 'zoo_merchant_state', merchant: merchantState });
  });

  runner.on('restock_initiated', (event) => {
    emitLog({
      action: 'zoo_restock',
      type: 'info',
      label: `Merchant restocking ${event.data.name}, low stock: ${event.data.current_stock}`,
      data: {
        sku: event.data.sku,
        name: event.data.name,
        units: event.data.units,
        cost: event.data.cost,
      }
    });
  });

  runner.on('restock_completed', (event) => {
    const rec = event.data.record;
    const restockEvent: ZooRestockEvent = {
      sku: rec.sku,
      name: rec.name,
      quantity: rec.units,
      cost: rec.cost,
      tx_hash: rec.tx_hash,
      block_number: rec.block_number,
      fee_ausd: rec.fee_ausd ?? undefined,
      fee_payer: rec.fee_payer ?? undefined,
      timestamp: Date.now(),
    };
    broadcast({ type: 'zoo_restock_event', event: restockEvent });

    emitLog({
      action: 'zoo_restock',
      type: 'tx_confirmed',
      label: `Restocked ${rec.name}: +${rec.units} units ($${rec.cost})`,
      data: {
        sku: rec.sku,
        tx_hash: rec.tx_hash,
        block_number: rec.block_number,
      }
    });

    // Increment zoo tx counter for restock transactions
    incrementZooTxCount();

    // Refresh balances after restock payment
    refreshZooBalances().then(() => {
      broadcast({ type: "accounts", accounts: accountStore.toPublic() });
    }).catch((err) => {
      log.debug('Failed to refresh balances after restock', err);
    });
  });

  runner.on('restock_failed', (event) => {
    emitLog({
      action: 'zoo_restock',
      type: 'error',
      label: `Restock failed for ${event.data.name}: ${event.data.error}`,
      data: event.data,
    });
  });

  runner.on('sale_recorded', (event) => {
    emitLog({
      action: 'zoo_merchant',
      type: 'info',
      label: `Sale: ${event.data.sku} $${event.data.amount} (profit: $${event.data.profit})`,
      data: event.data,
    });
  });

  runner.on('llm_decision', (event) => {
    broadcast({
      type: 'zoo_llm_decision',
      decision: { ...event.data, timestamp: Date.now() },
    });
  });

  log.info('AgentRunner initialized and ready');
}

// GET /agents/status
zooAgentRoutes.get("/agents/status", async (c) => {
  try {
    if (!config.zoo.enabled) {
      return c.json({ error: "Zoo simulation is disabled", code: "ZOO_DISABLED" }, 404);
    }

    const runner = getAgentRunner();
    if (!runner) {
      return c.json({ error: "Agent runner not initialized", code: "RUNNER_NOT_INITIALIZED" }, 500);
    }

    return c.json(runner.getStatus());
  } catch (error) {
    log.error('Agent status error:', error);
    return c.json({
      error: "Failed to get agent status",
      code: "AGENT_STATUS_ERROR",
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// GET /agents/metrics
zooAgentRoutes.get("/agents/metrics", async (c) => {
  try {
    if (!config.zoo.enabled) {
      return c.json({ error: "Zoo simulation is disabled", code: "ZOO_DISABLED" }, 404);
    }

    const runner = getAgentRunner();
    if (!runner) {
      return c.json({ error: "Agent runner not initialized", code: "RUNNER_NOT_INITIALIZED" }, 500);
    }

    return c.json(runner.getMetrics());
  } catch (error) {
    log.error('Agent metrics error:', error);
    return c.json({
      error: "Failed to get agent metrics",
      code: "AGENT_METRICS_ERROR",
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// POST /agents/start
zooAgentRoutes.post("/agents/start", async (c) => {
  try {
    if (!config.zoo.enabled) {
      return c.json({ error: "Zoo simulation is disabled", code: "ZOO_DISABLED" }, 404);
    }

    const runner = getAgentRunner();
    if (!runner) {
      return c.json({ error: "Agent runner not initialized", code: "RUNNER_NOT_INITIALIZED" }, 500);
    }

    await runner.start();

    // Broadcast fresh zero-state so UI starts clean
    const initialMerchant: ZooMerchantState = {
      inventory: getInventorySnapshot(),
      total_revenue: '0.00',
      total_cost: '0.00',
      profit: '0.00',
      status: 'online',
      balance: '0',
      restock_count: 0,
      sale_count: 0,
    };
    broadcast({ type: 'zoo_merchant_state', merchant: initialMerchant });
    broadcastAgentStates();

    return c.json({
      success: true,
      message: "All agents started successfully",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    log.error('Agent start error:', error);
    return c.json({
      error: "Failed to start agents",
      code: "AGENT_START_ERROR",
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// POST /agents/stop
zooAgentRoutes.post("/agents/stop", async (c) => {
  try {
    if (!config.zoo.enabled) {
      return c.json({ error: "Zoo simulation is disabled", code: "ZOO_DISABLED" }, 404);
    }

    const runner = getAgentRunner();
    if (!runner) {
      return c.json({ error: "Agent runner not initialized", code: "RUNNER_NOT_INITIALIZED" }, 500);
    }

    await runner.stop();

    // Clear ephemeral zoo accounts so next preflight starts fresh
    clearZooAccounts();

    return c.json({
      success: true,
      message: "All agents stopped successfully",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    log.error('Agent stop error:', error);
    return c.json({
      error: "Failed to stop agents",
      code: "AGENT_STOP_ERROR",
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// POST /agents/:agentId/purchase
zooAgentRoutes.post("/agents/:agentId/purchase", async (c) => {
  try {
    if (!config.zoo.enabled) {
      return c.json({ error: "Zoo simulation is disabled", code: "ZOO_DISABLED" }, 404);
    }

    const runner = getAgentRunner();
    if (!runner) {
      return c.json({ error: "Agent runner not initialized", code: "RUNNER_NOT_INITIALIZED" }, 500);
    }

    const agentId = c.req.param('agentId');
    const body = await c.req.json().catch(() => ({}));
    const maxBudget = body.max_budget;

    await runner.forcePurchase(agentId, maxBudget);

    return c.json({
      success: true,
      message: `Purchase triggered for agent ${agentId}`,
      agent_id: agentId,
      max_budget: maxBudget,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    log.error('Force purchase error:', error);
    return c.json({
      error: "Failed to trigger purchase",
      code: "FORCE_PURCHASE_ERROR",
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// GET /agents/:agentId
zooAgentRoutes.get("/agents/:agentId", async (c) => {
  try {
    if (!config.zoo.enabled) {
      return c.json({ error: "Zoo simulation is disabled", code: "ZOO_DISABLED" }, 404);
    }

    const runner = getAgentRunner();
    if (!runner) {
      return c.json({ error: "Agent runner not initialized", code: "RUNNER_NOT_INITIALIZED" }, 500);
    }

    const agentId = c.req.param('agentId');
    const agent = runner.getAgent(agentId);

    if (!agent) {
      return c.json({ error: `Agent ${agentId} not found`, code: "AGENT_NOT_FOUND" }, 404);
    }

    return c.json(agent.getStatus());
  } catch (error) {
    log.error('Individual agent status error:', error);
    return c.json({
      error: "Failed to get agent status",
      code: "AGENT_STATUS_ERROR",
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});
