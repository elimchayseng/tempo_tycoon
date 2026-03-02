import { Hono } from "hono";
import { zooRegistryRoutes } from "./zoo-registry.js";
import { zooMerchantRoutes } from "./zoo-merchant.js";
import { zooAgentRoutes } from "./zoo-agents.js";
import { zooBlockchainRoutes } from "./zoo-blockchain.js";

/**
 * Composed zoo routes — barrel file that re-exports the sub-routers.
 *
 * Mounted in server/index.ts as:
 *   app.route("/api/zoo", zooRoutes);
 *   app.route("/api/merchant", zooRoutes);
 */
export const zooRoutes = new Hono();

// Registry, status, health, preflight, transactions
zooRoutes.route("/", zooRegistryRoutes);

// Merchant catalog and checkout
zooRoutes.route("/", zooMerchantRoutes);

// Agent management
zooRoutes.route("/", zooAgentRoutes);

// Blockchain explorer data endpoints
zooRoutes.route("/", zooBlockchainRoutes);
