import "./env.js";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "@hono/node-server/serve-static";
import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import {
  addClient,
  removeClient,
  runAction,
  emitLog,
  getClientCount,
  getClientLimit,
} from "./instrumented-client.js";
import { publicClient, CHAIN_CONFIG } from "./tempo-client.js";
import { accountStore } from "./accounts.js";
import { config, validateConfig } from "./config.js";
import { createLogger } from "../shared/logger.js";
import { initializeZooAccounts, areZooAccountsInitialized, getAllZooAccounts } from "./zoo-accounts.js";
import {
  validateSendRequest,
  validateBatchRequest,
  validateHistoryRequest,
} from "../shared/validation.js";
import { setupAction } from "./actions/setup.js";
import { balanceAction } from "./actions/balance.js";
import { transferAlphaUsdAction } from "./actions/send.js";
import { sendSponsoredAction } from "./actions/send-sponsored.js";
import { batchAction } from "./actions/batch.js";
import { historyAction } from "./actions/history.js";
import { zooRoutes } from "./routes/zoo.js";

const log = createLogger('server');

// Validate configuration on startup
validateConfig();

// Initialize zoo accounts if enabled
initializeZooAccounts();

const app = new Hono();

const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

// Middleware
app.use("/*", cors());

// Request logging middleware (if enabled)
if (config.logging.enableRequestLogging) {
  app.use("*", async (c, next) => {
    const start = Date.now();
    log.debug(`${c.req.method} ${c.req.url}`);
    await next();
    const duration = Date.now() - start;
    log.debug(`${c.req.method} ${c.req.url} - ${c.res.status} (${duration}ms)`);
  });
}

// Serve static files from dist directory
app.use("/*", serveStatic({ root: "./dist" }));

// WebSocket endpoint with connection limits and error handling
app.get(
  "/ws",
  upgradeWebSocket(() => ({
    onOpen(_event, ws) {
      const success = addClient(ws);
      if (!success) {
        // Connection limit reached, close the connection
        ws.close(1013, "Connection limit reached");
        return;
      }

      // Send connection acknowledgment
      ws.send(JSON.stringify({
        type: "connection",
        connected: true,
        clientCount: getClientCount(),
        maxClients: getClientLimit(),
      }));
    },
    onClose(_event, ws) {
      removeClient(ws);
    },
    onError(event, ws) {
      log.error("WebSocket error:", event);
      removeClient(ws);
    },
  }))
);

// Simple health check for Railway deployment
app.get("/api/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

// Blockchain connectivity check — verifies testnet connectivity
app.get("/api/health/blockchain", async (c) => {
  try {
    const chainId = await publicClient.getChainId();
    const blockNumber = await publicClient.getBlockNumber();
    return c.json({
      status: "ok",
      chain: {
        id: chainId,
        name: CHAIN_CONFIG.chainName,
        rpc: CHAIN_CONFIG.rpcUrl,
        latestBlock: blockNumber.toString(),
      },
    });
  } catch (err) {
    return c.json(
      {
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      },
      500
    );
  }
});

// Return current accounts state (for initial frontend load)
app.get("/api/accounts", (c) => {
  return c.json({ accounts: accountStore.toPublic() });
});

// ---------------------------------------------------------------------------
// Action routes — each wraps its logic in runAction() which handles
// the action_start / action_complete / action_error lifecycle and
// broadcasts account updates after completion.
// ---------------------------------------------------------------------------

app.post("/api/setup", async (c) => {
  try {
    await runAction("setup", setupAction);
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

app.post("/api/balance", async (c) => {
  try {
    await runAction("balance", balanceAction);
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

app.post("/api/send", async (c) => {
  try {
    const body = await c.req.json();
    const validation = validateSendRequest(body);

    if (!validation.isValid) {
      return c.json({
        error: "Validation failed",
        details: validation.errors
      }, 400);
    }

    await runAction("send", () => transferAlphaUsdAction(validation.data!));
    return c.json({ ok: true });
  } catch (err) {
    log.error("api/send error:", err);
    return c.json({ error: String(err) }, 500);
  }
});

app.post("/api/send-sponsored", async (c) => {
  try {
    const body = await c.req.json();
    const validation = validateSendRequest(body);

    if (!validation.isValid) {
      return c.json({
        error: "Validation failed",
        details: validation.errors
      }, 400);
    }

    await runAction("send-sponsored", () => sendSponsoredAction(validation.data!));
    return c.json({ ok: true });
  } catch (err) {
    log.error("api/send-sponsored error:", err);
    return c.json({ error: String(err) }, 500);
  }
});

app.post("/api/batch", async (c) => {
  try {
    const body = await c.req.json();
    const validation = validateBatchRequest(body);

    if (!validation.isValid) {
      return c.json({
        error: "Validation failed",
        details: validation.errors
      }, 400);
    }

    await runAction("batch", () => batchAction(validation.data!));
    return c.json({ ok: true });
  } catch (err) {
    log.error("api/batch error:", err);
    return c.json({ error: String(err) }, 500);
  }
});

app.post("/api/history", async (c) => {
  try {
    const body = await c.req.json();
    const validation = validateHistoryRequest(body);

    if (!validation.isValid) {
      return c.json({
        error: "Validation failed",
        details: validation.errors
      }, 400);
    }

    await runAction("history", () => historyAction(validation.data!));
    return c.json({ ok: true });
  } catch (err) {
    log.error("api/history error:", err);
    return c.json({ error: String(err) }, 500);
  }
});

// ---------------------------------------------------------------------------
// Zoo simulation routes (when enabled)
// ---------------------------------------------------------------------------

app.route("/api/zoo", zooRoutes);
app.route("/api/merchant", zooRoutes); // Merchant endpoints are in the same route handler

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

const server = serve({
  fetch: app.fetch,
  port: config.server.port,
  // For Railway deployment, don't specify hostname - let it bind to all interfaces
});
injectWebSocket(server);

log.info(`Server running on port ${config.server.port}`);
log.info(`WebSocket available on /ws`);
log.info(`Environment: ${config.server.environment}`);
log.info(`Targeting ${CHAIN_CONFIG.chainName} (chain ${CHAIN_CONFIG.chainId})`);
log.debug(`Max WebSocket connections: ${config.limits.maxWebSocketConnections}`);
log.debug(`Request logging: ${config.logging.enableRequestLogging ? 'enabled' : 'disabled'}`);

// Zoo simulation status
if (config.zoo.enabled) {
  const zooAccountsInitialized = areZooAccountsInitialized();
  log.info('Zoo simulation: enabled');
  log.info(`Zoo accounts initialized: ${zooAccountsInitialized}`);
  if (zooAccountsInitialized) {
    const zooAccounts = getAllZooAccounts();
    log.info(`Total zoo accounts: ${zooAccounts.length}`);
    log.debug('Registry available at: /api/zoo/registry');
    log.debug('Merchant catalog at: /api/merchant/food/catalog');
  }
} else {
  log.info('Zoo simulation: disabled');
}
