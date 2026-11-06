import { Hono } from "hono";
import { cors } from "hono/cors";
import { runAction } from "./instrumented-client.js";
import { publicClient, CHAIN_CONFIG } from "./tempo-client.js";
import { accountStore } from "./accounts.js";
import { config, validateConfig } from "./config.js";
import { createLogger } from "../shared/logger.js";
// Zoo accounts are generated dynamically at simulation start
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
import { initZooAgents } from "./routes/zoo-agents.js";
import { getClientIp } from "./middleware/client-ip.js";

/**
 * Runtime-agnostic Hono app: all API routes, no transport concerns.
 *
 * Hosts:
 *   - server/index.ts         — Node (local dev): adds node-ws, static files, listen()
 *   - worker/zoo-server.ts    — Cloudflare Durable Object: adds WebSocketPair handling
 *
 * The /ws endpoint and static assets are wired up by each host.
 */

const log = createLogger('server');

// In-memory unique visitor tracking
const uniqueVisitors = new Set<string>();

export const app = new Hono();

// Middleware
app.use("/*", cors({
  origin: config.cors.allowedOrigins,
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  maxAge: 3600,
}));

// Unique visitor logging middleware
app.use("*", async (c, next) => {
  const ip = getClientIp(c);
  if (!uniqueVisitors.has(ip)) {
    uniqueVisitors.add(ip);
    log.info(`New visitor: ${ip} (total unique: ${uniqueVisitors.size})`);
  }
  await next();
});

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

// Simple health check
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

let initialized = false;

/**
 * One-time startup: validate config and create the AgentRunner.
 * Must be called from request/startup context, never at module load —
 * Workers forbid timers and I/O in global scope.
 */
export function initApp(): void {
  if (initialized) return;
  initialized = true;

  validateConfig();
  initZooAgents();

  log.info(`Environment: ${config.server.environment}`);
  log.info(`Targeting ${CHAIN_CONFIG.chainName} (chain ${CHAIN_CONFIG.chainId})`);
  log.debug(`Max WebSocket connections: ${config.limits.maxWebSocketConnections}`);
  log.debug(`Request logging: ${config.logging.enableRequestLogging ? 'enabled' : 'disabled'}`);

  if (config.zoo.enabled) {
    log.info('Zoo simulation: enabled (ephemeral wallets generated on start)');
  } else {
    log.info('Zoo simulation: disabled');
  }
}
