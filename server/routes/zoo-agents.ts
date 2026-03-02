import { Hono } from "hono";
import { createLogger } from "../../shared/logger.js";
import { config } from "../config.js";
import { AgentRunner } from "../../agents/agent-runner.js";
import { emitLog, broadcast } from "../instrumented-client.js";
import { getZooAccountByRole } from "../zoo-accounts.js";
import { accountStore } from "../accounts.js";
import { refreshZooBalances, loadZooRegistry, getAgentRunner, setAgentRunner } from "./zoo-shared.js";
import type { ZooAgentState, ZooPurchaseReceipt } from "../../shared/types.js";

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

  runner.on('purchase_completed', (event) => {
    emitLog({
      action: 'zoo_purchase',
      type: 'info',
      label: `Purchase: ${event.data.purchase_record.name} ($${event.data.purchase_record.amount})`,
      data: {
        agent_id: event.agent_id,
        product: event.data.purchase_record.name,
        amount: event.data.purchase_record.amount,
        tx_hash: event.data.purchase_record.tx_hash,
        new_needs: event.data.new_needs
      }
    });

    const rec = event.data.purchase_record;
    const registry = loadZooRegistry();
    const merchantName = registry.merchants?.[0]?.name ?? 'Unknown Merchant';
    const merchantAccount = getZooAccountByRole('merchantA');
    const receipt: ZooPurchaseReceipt = {
      agent_id: event.agent_id,
      product_name: rec.name ?? rec.product_name ?? '',
      sku: rec.sku ?? '',
      amount: String(rec.amount),
      merchant_name: merchantName,
      merchant_address: merchantAccount?.address ?? '',
      tx_hash: rec.tx_hash ?? '',
      block_number: String(rec.block_number ?? ''),
      gas_used: String(rec.gas_used ?? ''),
      need_before: event.data.need_before ?? 0,
      need_after: event.data.new_needs?.food_need ?? 0,
      timestamp: Date.now(),
    };
    broadcast({ type: 'zoo_purchase', receipt });

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

// POST /agents/fund
zooAgentRoutes.post("/agents/fund", async (c) => {
  try {
    if (!config.zoo.enabled) {
      return c.json({ error: "Zoo simulation is disabled", code: "ZOO_DISABLED" }, 404);
    }

    const runner = getAgentRunner();
    if (!runner) {
      return c.json({ error: "Agent runner not initialized", code: "RUNNER_NOT_INITIALIZED" }, 500);
    }

    await runner.checkAndRefundAgents();

    return c.json({
      success: true,
      message: "Funding check completed",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    log.error('Agent funding error:', error);
    return c.json({
      error: "Failed to trigger funding",
      code: "AGENT_FUNDING_ERROR",
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
