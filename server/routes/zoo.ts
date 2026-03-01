import { Hono } from "hono";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { getZooAccountByRole, getAllZooAccounts } from "../zoo-accounts.js";
import { config } from "../config.js";
import { SessionVerifier } from "../middleware/session-verifier.js";
import { AgentRunner } from "../../agents/agent-runner.js";
import { emitLog } from "../instrumented-client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const zooRoutes = new Hono();

// Global AgentRunner instance
let agentRunner: AgentRunner | null = null;

// Initialize AgentRunner if zoo simulation is enabled
if (config.zoo.enabled) {
  agentRunner = new AgentRunner();

  // Subscribe to agent events and broadcast via WebSocket
  agentRunner.on('simulation_started', (event) => {
    emitLog({
      action: 'zoo_simulation',
      type: 'info',
      label: '🎪 Zoo Simulation Started',
      data: event.data
    });
  });

  agentRunner.on('purchase_completed', (event) => {
    emitLog({
      action: 'zoo_purchase',
      type: 'info',
      label: `🛍️  Purchase: ${event.data.purchase_record.name} ($${event.data.purchase_record.amount})`,
      data: {
        agent_id: event.agent_id,
        product: event.data.purchase_record.name,
        amount: event.data.purchase_record.amount,
        tx_hash: event.data.purchase_record.tx_hash,
        new_needs: event.data.new_needs
      }
    });
  });

  agentRunner.on('needs_updated', (event) => {
    // Broadcast need updates for dashboard visualization
    emitLog({
      action: 'zoo_needs',
      type: 'rpc_result',
      label: `📊 ${event.agent_id} needs: food=${event.data.current_needs.food_need}`,
      data: {
        agent_id: event.agent_id,
        needs: event.data.current_needs,
        cycle: event.data.cycle_count
      }
    });
  });

  console.log('[zoo-routes] 🤖 AgentRunner initialized and ready');
}

// Helper to load and process zoo registry
function loadZooRegistry() {
  try {
    // Load the zoo_map.json file from the config directory
    const zooMapPath = join(__dirname, '../../config/zoo_map.json');
    const zooMapContent = readFileSync(zooMapPath, 'utf-8');
    const zooMap = JSON.parse(zooMapContent);

    // Replace placeholder addresses with actual wallet addresses
    const zooMasterAccount = getZooAccountByRole('zooMaster');
    const merchantAccount = getZooAccountByRole('merchantA');

    if (zooMasterAccount) {
      zooMap.zoo_info.facilitator_address = zooMasterAccount.address;
    }

    if (merchantAccount && zooMap.merchants && zooMap.merchants.length > 0) {
      zooMap.merchants[0].wallet_address = merchantAccount.address;
    }

    // Update timestamps
    const now = new Date().toISOString();
    zooMap.zoo_info.updated_at = now;

    return zooMap;
  } catch (error) {
    console.error('[zoo-routes] Error loading zoo registry:', error);
    throw new Error('Failed to load zoo registry');
  }
}

// GET /api/zoo/registry - Returns the complete merchant registry for agent discovery
zooRoutes.get("/registry", async (c) => {
  try {
    if (!config.zoo.enabled) {
      return c.json({ error: "Zoo simulation is disabled" }, 404);
    }

    const registry = loadZooRegistry();

    return c.json(registry);
  } catch (error) {
    console.error('[zoo-routes] Registry endpoint error:', error);
    return c.json({
      error: "Failed to load registry",
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// GET /api/zoo/status - Returns current simulation status and agent states
zooRoutes.get("/status", async (c) => {
  try {
    if (!config.zoo.enabled) {
      return c.json({
        zoo_enabled: false,
        message: "Zoo simulation is disabled"
      });
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
      agents: agentRunner ? (() => {
        const runnerStatus = agentRunner.getStatus();
        return {
          total_agents: runnerStatus.agents.length,
          active_agents: runnerStatus.agents.filter((a: any) => a.status !== 'offline').length,
          agent_states: runnerStatus.agents.map((a: any) => ({
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
    console.error('[zoo-routes] Status endpoint error:', error);
    return c.json({
      error: "Failed to get status",
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// GET /api/zoo/health - Simple health check for zoo-specific functionality
zooRoutes.get("/health", async (c) => {
  try {
    const health = {
      status: "ok",
      zoo_enabled: config.zoo.enabled,
      timestamp: new Date().toISOString(),
    };

    if (config.zoo.enabled) {
      const zooAccounts = getAllZooAccounts();
      health.zoo_accounts = {
        total: zooAccounts.length,
        initialized: zooAccounts.length === 5, // Should have all 5 zoo accounts
        accounts: zooAccounts.map(acc => ({
          label: acc.label,
          address: acc.address,
        })),
      };
    }

    return c.json(health);
  } catch (error) {
    console.error('[zoo-routes] Health endpoint error:', error);
    return c.json({
      status: "error",
      error: "Health check failed",
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// ---------------------------------------------------------------------------
// Merchant ACP Endpoints
// ---------------------------------------------------------------------------

// In-memory session storage for MVP (could be upgraded to Redis/DB later)
interface CheckoutSession {
  session_id: string;
  buyer_address: string;
  merchant_address: string;
  sku: string;
  quantity: number;
  amount: string;
  currency: string;
  created_at: Date;
  expires_at: Date;
  status: 'pending' | 'completed' | 'expired';
}

const activeSessions = new Map<string, CheckoutSession>();
const sessionVerifier = new SessionVerifier();

// Clean up expired sessions periodically
setInterval(() => {
  const now = new Date();
  for (const [sessionId, session] of activeSessions.entries()) {
    if (now > session.expires_at && session.status === 'pending') {
      session.status = 'expired';
      activeSessions.delete(sessionId);
    }
  }
}, 30000); // Clean up every 30 seconds

// GET /api/merchant/food/catalog - Returns available products with current pricing
zooRoutes.get("/food/catalog", async (c) => {
  try {
    if (!config.zoo.enabled) {
      return c.json({ error: "Zoo simulation is disabled" }, 404);
    }

    const registry = loadZooRegistry();
    const merchant = registry.merchants?.find((m: any) => m.category === 'food');

    if (!merchant) {
      return c.json({ error: "Food merchant not found" }, 404);
    }

    const catalog = {
      merchant_id: merchant.id,
      merchant_name: merchant.name,
      category: merchant.category,
      description: merchant.description,
      products: merchant.menu.map((item: any) => ({
        sku: item.sku,
        name: item.name,
        description: item.description,
        price: item.price,
        currency: "AlphaUSD",
        category: item.category,
        available: item.available
      })),
      operating_hours: merchant.operating_hours,
      updated_at: new Date().toISOString()
    };

    return c.json(catalog);
  } catch (error) {
    console.error('[zoo-routes] Catalog endpoint error:', error);
    return c.json({
      error: "Failed to load catalog",
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// POST /api/merchant/food/checkout/create - Creates a purchase session with payment details
zooRoutes.post("/food/checkout/create", async (c) => {
  try {
    if (!config.zoo.enabled) {
      return c.json({ error: "Zoo simulation is disabled" }, 404);
    }

    const body = await c.req.json();
    const { sku, quantity = 1, buyer_address } = body;

    // Validate request
    if (!sku || !buyer_address) {
      return c.json({
        error: "Missing required fields",
        details: "sku and buyer_address are required"
      }, 400);
    }

    if (typeof quantity !== 'number' || quantity <= 0) {
      return c.json({
        error: "Invalid quantity",
        details: "quantity must be a positive number"
      }, 400);
    }

    // Load registry and find product
    const registry = loadZooRegistry();
    const merchant = registry.merchants?.find((m: any) => m.category === 'food');

    if (!merchant) {
      return c.json({ error: "Food merchant not found" }, 404);
    }

    const product = merchant.menu.find((item: any) => item.sku === sku);
    if (!product) {
      return c.json({ error: "Product not found" }, 404);
    }

    if (!product.available) {
      return c.json({ error: "Product not available" }, 400);
    }

    // Calculate total amount
    const unitPrice = parseFloat(product.price);
    const totalAmount = (unitPrice * quantity).toFixed(2);

    // Generate session ID and create session
    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + config.zoo.sessionTimeoutMinutes * 60 * 1000);

    const merchantAccount = getZooAccountByRole('merchantA');
    if (!merchantAccount) {
      return c.json({ error: "Merchant account not found" }, 500);
    }

    const session: CheckoutSession = {
      session_id: sessionId,
      buyer_address: buyer_address.toLowerCase(),
      merchant_address: merchantAccount.address,
      sku,
      quantity,
      amount: totalAmount,
      currency: "AlphaUSD",
      created_at: now,
      expires_at: expiresAt,
      status: 'pending'
    };

    activeSessions.set(sessionId, session);

    // Return session details for payment
    const response = {
      session_id: sessionId,
      amount: totalAmount,
      currency: "AlphaUSD",
      recipient_address: merchantAccount.address,
      expires_at: expiresAt.toISOString(),
      memo: `Zoo Purchase: ${product.name}`,
      product: {
        sku: product.sku,
        name: product.name,
        price: product.price,
        quantity
      }
    };

    console.log(`[zoo-routes] Created checkout session ${sessionId} for ${sku} (${totalAmount} AlphaUSD)`);

    return c.json(response);
  } catch (error) {
    console.error('[zoo-routes] Checkout create error:', error);
    return c.json({
      error: "Failed to create checkout session",
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// POST /api/merchant/food/checkout/complete - Verifies payment and completes the purchase
zooRoutes.post("/food/checkout/complete", async (c) => {
  try {
    if (!config.zoo.enabled) {
      return c.json({ error: "Zoo simulation is disabled" }, 404);
    }

    const body = await c.req.json();
    const { session_id, tx_hash } = body;

    // Validate request
    if (!session_id || !tx_hash) {
      return c.json({
        error: "Missing required fields",
        details: "session_id and tx_hash are required"
      }, 400);
    }

    if (!sessionVerifier.isValidTransactionHash(tx_hash)) {
      return c.json({
        error: "Invalid transaction hash",
        details: "tx_hash must be a valid Ethereum transaction hash"
      }, 400);
    }

    // Find the session
    const session = activeSessions.get(session_id);
    if (!session) {
      return c.json({
        error: "Session not found",
        details: "Invalid or expired session_id"
      }, 404);
    }

    // Check if session is already completed
    if (session.status === 'completed') {
      return c.json({
        error: "Session already completed",
        details: "This session has already been processed"
      }, 400);
    }

    // Check if session has expired
    if (new Date() > session.expires_at) {
      session.status = 'expired';
      activeSessions.delete(session_id);
      return c.json({
        error: "Session expired",
        details: "Session has expired, please create a new checkout session"
      }, 400);
    }

    console.log(`[zoo-routes] Verifying payment for session ${session_id}: ${tx_hash}`);

    // Verify the transaction on blockchain
    const verificationResult = await sessionVerifier.verifyTransaction(
      tx_hash,
      session.buyer_address,
      session.merchant_address,
      session.amount
    );

    if (!verificationResult.verified) {
      console.log(`[zoo-routes] ❌ Payment verification failed for session ${session_id}: ${verificationResult.error}`);
      return c.json({
        success: false,
        verified: false,
        error: "Payment verification failed",
        details: verificationResult.error
      }, 400);
    }

    // Mark session as completed
    session.status = 'completed';
    activeSessions.delete(session_id); // Clean up completed session

    // Generate purchase ID for record keeping
    const purchaseId = `purchase_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    console.log(`[zoo-routes] ✅ Payment verified and purchase completed: ${purchaseId}`);
    console.log(`[zoo-routes] Transaction: ${verificationResult.transaction?.hash} (block #${verificationResult.transaction?.blockNumber})`);

    // Return success response
    const response = {
      success: true,
      verified: true,
      purchase_id: purchaseId,
      session_id: session_id,
      product: {
        sku: session.sku,
        quantity: session.quantity
      },
      payment: {
        amount: session.amount,
        currency: session.currency,
        tx_hash: tx_hash,
        block_number: verificationResult.transaction?.blockNumber?.toString(),
        gas_used: verificationResult.transaction?.gasUsed?.toString()
      },
      completed_at: new Date().toISOString()
    };

    return c.json(response);

  } catch (error) {
    console.error('[zoo-routes] Checkout complete error:', error);
    return c.json({
      error: "Failed to complete checkout",
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// GET /api/zoo/transactions - Returns recent transaction history (for monitoring)
zooRoutes.get("/transactions", async (c) => {
  try {
    if (!config.zoo.enabled) {
      return c.json({ error: "Zoo simulation is disabled" }, 404);
    }

    // For now, return empty array - this would be populated with transaction history
    // In a full implementation, this would query a database or transaction log
    const transactions = {
      total: 0,
      recent_transactions: [],
      timestamp: new Date().toISOString(),
      note: "Transaction history not yet implemented - will be populated when agents are active"
    };

    return c.json(transactions);
  } catch (error) {
    console.error('[zoo-routes] Transactions endpoint error:', error);
    return c.json({
      error: "Failed to load transactions",
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// ---------------------------------------------------------------------------
// Agent Management Endpoints
// ---------------------------------------------------------------------------

// GET /api/zoo/agents/status - Get status of all agents
zooRoutes.get("/agents/status", async (c) => {
  try {
    if (!config.zoo.enabled) {
      return c.json({ error: "Zoo simulation is disabled" }, 404);
    }

    if (!agentRunner) {
      return c.json({ error: "Agent runner not initialized" }, 500);
    }

    const status = agentRunner.getStatus();
    return c.json(status);

  } catch (error) {
    console.error('[zoo-routes] Agent status error:', error);
    return c.json({
      error: "Failed to get agent status",
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// GET /api/zoo/agents/metrics - Get aggregate metrics
zooRoutes.get("/agents/metrics", async (c) => {
  try {
    if (!config.zoo.enabled) {
      return c.json({ error: "Zoo simulation is disabled" }, 404);
    }

    if (!agentRunner) {
      return c.json({ error: "Agent runner not initialized" }, 500);
    }

    const metrics = agentRunner.getMetrics();
    return c.json(metrics);

  } catch (error) {
    console.error('[zoo-routes] Agent metrics error:', error);
    return c.json({
      error: "Failed to get agent metrics",
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// POST /api/zoo/agents/start - Start all agents
zooRoutes.post("/agents/start", async (c) => {
  try {
    if (!config.zoo.enabled) {
      return c.json({ error: "Zoo simulation is disabled" }, 404);
    }

    if (!agentRunner) {
      return c.json({ error: "Agent runner not initialized" }, 500);
    }

    await agentRunner.start();

    return c.json({
      success: true,
      message: "All agents started successfully",
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[zoo-routes] Agent start error:', error);
    return c.json({
      error: "Failed to start agents",
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// POST /api/zoo/agents/stop - Stop all agents
zooRoutes.post("/agents/stop", async (c) => {
  try {
    if (!config.zoo.enabled) {
      return c.json({ error: "Zoo simulation is disabled" }, 404);
    }

    if (!agentRunner) {
      return c.json({ error: "Agent runner not initialized" }, 500);
    }

    await agentRunner.stop();

    return c.json({
      success: true,
      message: "All agents stopped successfully",
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[zoo-routes] Agent stop error:', error);
    return c.json({
      error: "Failed to stop agents",
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// POST /api/zoo/agents/fund - Trigger funding check and refill
zooRoutes.post("/agents/fund", async (c) => {
  try {
    if (!config.zoo.enabled) {
      return c.json({ error: "Zoo simulation is disabled" }, 404);
    }

    if (!agentRunner) {
      return c.json({ error: "Agent runner not initialized" }, 500);
    }

    await agentRunner.checkAndRefundAgents();

    return c.json({
      success: true,
      message: "Funding check completed",
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[zoo-routes] Agent funding error:', error);
    return c.json({
      error: "Failed to trigger funding",
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// POST /api/zoo/agents/:agentId/purchase - Force a purchase for testing
zooRoutes.post("/agents/:agentId/purchase", async (c) => {
  try {
    if (!config.zoo.enabled) {
      return c.json({ error: "Zoo simulation is disabled" }, 404);
    }

    if (!agentRunner) {
      return c.json({ error: "Agent runner not initialized" }, 500);
    }

    const agentId = c.req.param('agentId');
    const body = await c.req.json().catch(() => ({}));
    const maxBudget = body.max_budget;

    await agentRunner.forcePurchase(agentId, maxBudget);

    return c.json({
      success: true,
      message: `Purchase triggered for agent ${agentId}`,
      agent_id: agentId,
      max_budget: maxBudget,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[zoo-routes] Force purchase error:', error);
    return c.json({
      error: "Failed to trigger purchase",
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// GET /api/zoo/agents/:agentId - Get specific agent status
zooRoutes.get("/agents/:agentId", async (c) => {
  try {
    if (!config.zoo.enabled) {
      return c.json({ error: "Zoo simulation is disabled" }, 404);
    }

    if (!agentRunner) {
      return c.json({ error: "Agent runner not initialized" }, 500);
    }

    const agentId = c.req.param('agentId');
    const agent = agentRunner.getAgent(agentId);

    if (!agent) {
      return c.json({ error: `Agent ${agentId} not found` }, 404);
    }

    const status = agent.getStatus();
    return c.json(status);

  } catch (error) {
    console.error('[zoo-routes] Individual agent status error:', error);
    return c.json({
      error: "Failed to get agent status",
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});