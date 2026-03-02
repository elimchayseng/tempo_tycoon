import { Hono } from "hono";
import { createLogger } from "../../shared/logger.js";
import { getZooAccountByRole, getAllZooAccounts } from "../zoo-accounts.js";
import { config } from "../config.js";
import { publicClient } from "../tempo-client.js";
import type { PreflightCheck, PreflightResult } from "../../shared/types.js";
import { loadZooRegistry, getAgentRunner } from "./zoo-shared.js";

const log = createLogger('zoo-registry');

export const zooRegistryRoutes = new Hono();

// POST /preflight
zooRegistryRoutes.post("/preflight", async (c) => {
  const checks: PreflightCheck[] = [
    { id: "blockchain", label: "Blockchain connectivity", status: "checking" },
    { id: "accounts", label: "Zoo accounts initialized", status: "pending" },
    { id: "balances", label: "Wallet balances", status: "pending" },
    { id: "merchants", label: "Merchant registry", status: "pending" },
    { id: "runner", label: "Agent runner", status: "pending" },
  ];

  try {
    const blockNumber = await publicClient.getBlockNumber();
    checks[0].status = "pass";
    checks[0].detail = `Block #${blockNumber}`;
  } catch (e) {
    checks[0].status = "fail";
    checks[0].detail = e instanceof Error ? e.message : "Cannot reach chain";
  }

  try {
    const accounts = getAllZooAccounts();
    if (accounts.length >= 5) {
      checks[1].status = "pass";
      checks[1].detail = `${accounts.length} accounts found`;
    } else {
      checks[1].status = "fail";
      checks[1].detail = `Only ${accounts.length}/5 accounts found`;
    }
  } catch (e) {
    checks[1].status = "fail";
    checks[1].detail = e instanceof Error ? e.message : "Account check failed";
  }

  try {
    const master = getZooAccountByRole("zooMaster");
    const attendees = [
      getZooAccountByRole("attendee1"),
      getZooAccountByRole("attendee2"),
      getZooAccountByRole("attendee3"),
    ];
    const allFunded = master && attendees.every((a) => a !== undefined);
    if (allFunded) {
      checks[2].status = "pass";
      checks[2].detail = "Master + 3 attendees available";
    } else {
      checks[2].status = "fail";
      checks[2].detail = "Some wallets missing";
    }
  } catch (e) {
    checks[2].status = "fail";
    checks[2].detail = e instanceof Error ? e.message : "Balance check failed";
  }

  try {
    const registry = loadZooRegistry();
    const merchantCount = registry.merchants?.length ?? 0;
    if (merchantCount > 0) {
      checks[3].status = "pass";
      checks[3].detail = `${merchantCount} merchant(s) loaded`;
    } else {
      checks[3].status = "fail";
      checks[3].detail = "No merchants in registry";
    }
  } catch (e) {
    checks[3].status = "fail";
    checks[3].detail = e instanceof Error ? e.message : "Registry load failed";
  }

  if (getAgentRunner()) {
    checks[4].status = "pass";
    checks[4].detail = "Agent runner ready";
  } else {
    checks[4].status = "fail";
    checks[4].detail = "Agent runner not initialized (ZOO_SIMULATION_ENABLED?)";
  }

  const success = checks.every((ch) => ch.status === "pass");
  const result: PreflightResult = { success, checks };
  return c.json(result);
});

// GET /registry
zooRegistryRoutes.get("/registry", async (c) => {
  try {
    if (!config.zoo.enabled) {
      return c.json({ error: "Zoo simulation is disabled", code: "ZOO_DISABLED" }, 404);
    }

    const registry = loadZooRegistry();
    return c.json(registry);
  } catch (error) {
    log.error('Registry endpoint error:', error);
    return c.json({
      error: "Failed to load registry",
      code: "REGISTRY_LOAD_FAILED",
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// GET /status
zooRegistryRoutes.get("/status", async (c) => {
  try {
    if (!config.zoo.enabled) {
      return c.json({ zoo_enabled: false, message: "Zoo simulation is disabled" });
    }

    const zooAccounts = getAllZooAccounts();
    const status = {
      zoo_enabled: true,
      simulation_status: "active",
      timestamp: new Date().toISOString(),
      config: {
        agent_polling_interval: config.zoo.agentPollingInterval,
        need_decay_rate: config.zoo.needDecayRate,
        purchase_threshold: config.zoo.purchaseThreshold,
        min_balance_threshold: config.zoo.minBalanceThreshold,
        session_timeout_minutes: config.zoo.sessionTimeoutMinutes,
      },
      accounts: zooAccounts.map(account => ({
        label: account.label,
        address: account.address,
        balances: Object.fromEntries(
          Object.entries(account.balances).map(([token, balance]) => [
            token,
            balance.toString()
          ])
        ),
      })),
      agents: getAgentRunner() ? (() => {
        const runnerStatus = getAgentRunner()!.getStatus();
        return {
          total_agents: runnerStatus.agents.length,
          active_agents: runnerStatus.agents.filter((a) => a.status !== 'offline').length,
          agent_states: runnerStatus.agents.map((a) => ({
            id: a.agent_id,
            status: a.status,
            needs: a.needs,
            last_purchase: null,
            balance: a.balance
          }))
        };
      })() : {
        total_agents: 3,
        active_agents: 0,
        agent_states: [
          { id: "attendee_1", status: "offline", needs: { food_need: 100, fun_need: 100 }, last_purchase: null, balance: "0.00" },
          { id: "attendee_2", status: "offline", needs: { food_need: 100, fun_need: 100 }, last_purchase: null, balance: "0.00" },
          { id: "attendee_3", status: "offline", needs: { food_need: 100, fun_need: 100 }, last_purchase: null, balance: "0.00" }
        ]
      }
    };

    return c.json(status);
  } catch (error) {
    log.error('Status endpoint error:', error);
    return c.json({
      error: "Failed to get status",
      code: "STATUS_ERROR",
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// GET /health
zooRegistryRoutes.get("/health", async (c) => {
  try {
    const health: Record<string, unknown> = {
      status: "ok",
      zoo_enabled: config.zoo.enabled,
      timestamp: new Date().toISOString(),
    };

    if (config.zoo.enabled) {
      const zooAccounts = getAllZooAccounts();
      health.zoo_accounts = {
        total: zooAccounts.length,
        initialized: zooAccounts.length === 5,
        accounts: zooAccounts.map(acc => ({
          label: acc.label,
          address: acc.address,
        })),
      };
    }

    return c.json(health);
  } catch (error) {
    log.error('Health endpoint error:', error);
    return c.json({
      status: "error",
      error: "Health check failed",
      code: "HEALTH_CHECK_FAILED",
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// GET /transactions
zooRegistryRoutes.get("/transactions", async (c) => {
  try {
    if (!config.zoo.enabled) {
      return c.json({ error: "Zoo simulation is disabled", code: "ZOO_DISABLED" }, 404);
    }

    return c.json({
      total: 0,
      recent_transactions: [],
      timestamp: new Date().toISOString(),
      note: "Transaction history not yet implemented"
    });
  } catch (error) {
    log.error('Transactions endpoint error:', error);
    return c.json({
      error: "Failed to load transactions",
      code: "TRANSACTIONS_ERROR",
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});
