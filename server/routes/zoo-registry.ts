import { Hono } from "hono";
import { createLogger } from "../../shared/logger.js";
import { getZooAccountByRole, getAllZooAccounts } from "../zoo-accounts.js";
import { config } from "../config.js";
import { publicClient } from "../tempo-client.js";
import type { PreflightCheck, PreflightResult } from "../../shared/types.js";
import { loadZooRegistry, getAgentRunner, refreshZooBalances } from "./zoo-shared.js";
import { broadcast } from "../instrumented-client.js";
import { accountStore } from "../accounts.js";
import { requireAdmin } from "../middleware/admin-auth.js";
import { createRateLimit } from "../middleware/rate-limit.js";

const log = createLogger('zoo-registry');

export const zooRegistryRoutes = new Hono();

// POST /preflight
zooRegistryRoutes.post("/preflight", requireAdmin, createRateLimit(10, 60_000), async (c) => {
  const checks: PreflightCheck[] = [
    { id: "blockchain", label: "Blockchain connectivity", status: "checking" },
    { id: "accounts", label: "Zoo accounts (and wallets) initialized", status: "pending" },
    { id: "funding", label: "Wallet funding strategy", status: "pending" },
    { id: "balances", label: "Wallet balances", status: "pending" },
    { id: "merchants", label: "Merchant registry", status: "pending" },
    { id: "runner", label: "Agent runner", status: "pending" },
    { id: "llm", label: "LLM inference endpoint", status: "pending" },
  ];

  function check(id: string) {
    return checks.find((ch) => ch.id === id)!;
  }

  // 1. Blockchain connectivity
  try {
    const blockNumber = await publicClient.getBlockNumber();
    check("blockchain").status = "pass";
    check("blockchain").detail = `Block #${blockNumber}`;
    check("blockchain").metadata = {
      chainName: config.chain.chainName,
      chainId: config.chain.chainId,
      rpcUrl: config.chain.rpcUrl,
      explorerUrl: config.chain.explorerUrl,
      tokenContract: config.contracts.alphaUsd,
      tokenStandard: "TIP-20",
      tokenDecimals: 6,
    };
  } catch (e) {
    check("blockchain").status = "fail";
    check("blockchain").detail = e instanceof Error ? e.message : "Cannot reach chain";
  }

  // 2. Zoo accounts (and wallets)
  const runner = getAgentRunner();
  try {
    // Initialize wallets first (requires blockchain + runner)
    if (runner && check("blockchain").status === "pass") {
      await runner.initializeWallets();
      // Broadcast funded accounts so the UI wallet panel can render immediately
      broadcast({ type: "accounts", accounts: accountStore.toPublic() });
    } else if (!runner) {
      throw new Error("Agent runner not initialized");
    } else {
      throw new Error("Skipped — blockchain unreachable");
    }

    // Then verify accounts
    const accounts = getAllZooAccounts();
    if (accounts.length >= 5) {
      check("accounts").status = "pass";
      check("accounts").detail = `${accounts.length} accounts, wallets funded`;
      check("accounts").metadata = {
        accounts: accounts.map((a) => ({ label: a.label, address: a.address })),
      };
    } else {
      check("accounts").status = "fail";
      check("accounts").detail = `Only ${accounts.length} accounts found (need 5)`;
    }
  } catch (e) {
    check("accounts").status = "fail";
    check("accounts").detail = e instanceof Error ? e.message : "Account/wallet init failed";
  }

  // 3. Wallet balances
  try {
    const accounts = getAllZooAccounts();
    if (accounts.length >= 5) {
      await refreshZooBalances();
      const master = getZooAccountByRole("zooMaster");
      const merchantA = getZooAccountByRole("merchantA");
      const guests = [
        getZooAccountByRole("guest1"),
        getZooAccountByRole("guest2"),
        getZooAccountByRole("guest3"),
      ];
      check("balances").status = "pass";
      check("balances").detail = "Master + 3 guests available";
      const walletList: { label: string; address: string; balance: string }[] = [];
      if (master) {
        const bal = master.balances[config.contracts.alphaUsd]?.toString() ?? "0";
        walletList.push({ label: "Zoo Master", address: master.address, balance: bal });
      }
      if (merchantA) {
        const bal = merchantA.balances[config.contracts.alphaUsd]?.toString() ?? "0";
        // Use merchant name from registry for display
        const registry = loadZooRegistry();
        const merchantName = registry.merchants?.[0]?.name ?? "Merchant";
        walletList.push({ label: `Merchant: ${merchantName}`, address: merchantA.address, balance: bal });
      }
      guests.forEach((a, i) => {
        if (a) {
          const bal = a.balances[config.contracts.alphaUsd]?.toString() ?? "0";
          walletList.push({ label: `Guest ${i + 1}`, address: a.address, balance: bal });
        }
      });
      check("balances").metadata = { wallets: walletList };
    } else {
      check("balances").status = "fail";
      check("balances").detail = "No accounts to check balances for";
    }
  } catch (e) {
    check("balances").status = "fail";
    check("balances").detail = e instanceof Error ? e.message : "Balance check failed";
  }

  // 4. Merchant registry
  try {
    const registry = loadZooRegistry();
    const merchants = registry.merchants ?? [];
    const merchantCount = merchants.length;
    if (merchantCount > 0) {
      check("merchants").status = "pass";
      check("merchants").detail = `${merchantCount} merchant(s) loaded`;
      const merchantAccount = getZooAccountByRole("merchantA");
      check("merchants").metadata = {
        merchants: merchants.map((m: any) => ({
          name: m.name,
          category: m.category ?? "general",
          itemCount: m.menu?.length ?? 0,
          walletAddress: merchantAccount?.address ?? "unknown",
          menu: (m.menu ?? []).map((item: any) => ({
            name: item.name,
            price: item.price,
            category: item.category,
            costBasis: (Math.max(0, parseFloat(item.price) - 1.0)).toFixed(2),
          })),
        })),
      };
    } else {
      check("merchants").status = "fail";
      check("merchants").detail = "No merchants in registry";
    }
  } catch (e) {
    check("merchants").status = "fail";
    check("merchants").detail = e instanceof Error ? e.message : "Registry load failed";
  }

  // 5. Agent runner
  if (runner) {
    const zooMaster = getZooAccountByRole("zooMaster");
    check("runner").status = "pass";
    check("runner").detail = "Agent runner ready";
    check("runner").metadata = {
      buyerAgents: {
        count: 3,
        pollingInterval: 12000,
        needDecayRate: "1–20 (random)",
        purchaseThreshold: 40,
      },
      merchantAgent: {
        agentId: "merchant_a",
        pollingInterval: 5000,
        restockThreshold: 1,
        maxStock: 5,
        supplierAddress: zooMaster?.address ?? "unknown",
        initialFunding: "$50.00",
      },
    };
  } else {
    check("runner").status = "fail";
    check("runner").detail = "Agent runner not initialized (ZOO_SIMULATION_ENABLED?)";
  }

  // 6. LLM inference endpoint
  try {
    if (config.llm.enabled) {
      // Make a lightweight request to verify connectivity
      const inferenceUrl = config.llm.inferenceUrl;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch(`${inferenceUrl}/v1/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${config.llm.inferenceKey}`,
          },
          body: JSON.stringify({
            model: config.llm.model,
            messages: [{ role: "user", content: "ping" }],
            max_tokens: 1,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (response.ok || response.status === 200) {
          check("llm").status = "pass";
          check("llm").detail = `Heroku Managed Inference — ${config.llm.model}`;
        } else {
          check("llm").status = "fail";
          check("llm").detail = `Endpoint returned ${response.status}: ${response.statusText}`;
        }
      } catch (fetchErr) {
        clearTimeout(timeout);
        check("llm").status = "fail";
        check("llm").detail = fetchErr instanceof Error ? fetchErr.message : "Inference endpoint unreachable";
      }
      // Mask the key for metadata display
      const maskedKey = config.llm.inferenceKey
        ? config.llm.inferenceKey.slice(0, 8) + "..." + config.llm.inferenceKey.slice(-4)
        : "(not set)";
      check("llm").metadata = {
        model: config.llm.model,
        endpoint: config.llm.inferenceUrl || "(not set)",
        apiKey: maskedKey,
        maxTokens: config.llm.maxTokensPerResponse,
        callLimit: config.llm.maxCallsPerSimulation,
      };
    } else {
      check("llm").status = "pass";
      check("llm").detail = "Disabled (rule-based fallback active)";
      check("llm").metadata = {
        model: "N/A",
        endpoint: "N/A",
        maxTokens: "N/A",
        callLimit: "N/A",
      };
    }
  } catch (e) {
    check("llm").status = "fail";
    check("llm").detail = e instanceof Error ? e.message : "LLM check failed";
  }

  // 7. Wallet funding strategy
  check("funding").status = "pass";
  check("funding").detail = "Tempo Batch Payment";
  check("funding").metadata = {
    method: "Tempo Batch Payment",
    lifecycle: "Ephemeral — fresh wallets each simulation",
    distribution: { merchant: "$100", guests: "$50 each" },
    total: "$250",
    refunding: "None — agents spend until depleted",
    autoStop: `When all buyers below $${config.zoo.minBalanceThreshold}`,
  };

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

    await refreshZooBalances();
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
          { id: "guest_1", status: "offline", needs: { food_need: 100, fun_need: 100 }, last_purchase: null, balance: "0.00" },
          { id: "guest_2", status: "offline", needs: { food_need: 100, fun_need: 100 }, last_purchase: null, balance: "0.00" },
          { id: "guest_3", status: "offline", needs: { food_need: 100, fun_need: 100 }, last_purchase: null, balance: "0.00" }
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
