import "./env.js";
import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import {
  addClient,
  removeClient,
  getClientCount,
  getClientLimit,
} from "./instrumented-client.js";
import { config } from "./config.js";
import { createLogger } from "../shared/logger.js";
import { app, initApp } from "./app.js";

/**
 * Node host (local development / any Node platform).
 * The Cloudflare host lives in worker/ — both share server/app.ts.
 */

const log = createLogger('server');

initApp();

const host = new Hono();
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app: host });

// Serve static files from dist directory
host.use("/*", serveStatic({ root: "./dist" }));

// WebSocket endpoint with connection limits and error handling
host.get(
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

host.route("/", app);

const server = serve({
  fetch: host.fetch,
  port: config.server.port,
  // Don't specify hostname — bind to all interfaces
});
injectWebSocket(server);

log.info(`Server running on port ${config.server.port}`);
log.info(`WebSocket available on /ws`);
