import { DurableObject } from "cloudflare:workers";
import { app, initApp } from "../server/app.js";
import {
  addClient,
  removeClient,
  getClientCount,
  getClientLimit,
} from "../server/instrumented-client.js";
import { setInternalFetch } from "../server/runtime.js";
import { getAgentRunner } from "../server/routes/zoo-shared.js";
import { setDefaultStateBackend, MemoryStateBackend } from "../agents/state-manager.js";
import { createLogger } from "../shared/logger.js";
import type { Env } from "./index.js";

const log = createLogger("zoo-server");

/** How often the keep-alive alarm fires while a simulation is running. */
const KEEPALIVE_MS = 10_000;

/** Origin used for agent → merchant (ACP) requests dispatched in-process. */
const INTERNAL_ORIGIN = "http://zoo.internal";

/**
 * The simulation host. Exactly one instance exists (see worker/index.ts).
 *
 * All the server's module-level state — AgentRunner, account store, checkout
 * sessions, WebSocket clients — lives in this object's isolate, so the
 * existing Hono app runs unchanged inside it.
 *
 * Lifetime: agent loops use setTimeout, which only fires while the object is
 * in memory. Connected (non-hibernating) WebSockets keep it resident, and a
 * self-rescheduling alarm keeps it resident for the whole simulation even if
 * every viewer disconnects. If the object is evicted anyway (deploy, crash),
 * the in-flight simulation is lost — same as a Node server restart; wallets are
 * ephemeral testnet wallets regenerated on every preflight.
 */
export class ZooServer extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    // No filesystem on Workers — agent state is per-simulation, keep it in memory.
    setDefaultStateBackend(() => new MemoryStateBackend());

    // There is no localhost here: route agent ACP calls straight into the app.
    setInternalFetch(
      (input, init) => Promise.resolve(app.fetch(new Request(input, init))),
      INTERNAL_ORIGIN,
    );

    initApp();

    getAgentRunner()?.on("simulation_started", () => {
      this.scheduleKeepAlive().catch((err) => log.warn("Failed to schedule keep-alive", err));
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/ws") {
      return this.acceptWebSocket(request);
    }

    return app.fetch(request);
  }

  async alarm(): Promise<void> {
    if (getAgentRunner()?.running) {
      await this.scheduleKeepAlive();
    } else {
      log.info("Simulation not running — keep-alive alarm stopped");
    }
  }

  private async scheduleKeepAlive(): Promise<void> {
    await this.ctx.storage.setAlarm(Date.now() + KEEPALIVE_MS);
  }

  private acceptWebSocket(request: Request): Response {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    const { 0: client, 1: server } = new WebSocketPair();
    // Standard (non-hibernating) accept: an open socket keeps the object in
    // memory, which the setTimeout-driven agent loops rely on.
    server.accept();

    if (!addClient(server)) {
      server.close(1013, "Connection limit reached");
      return new Response(null, { status: 101, webSocket: client });
    }

    server.send(JSON.stringify({
      type: "connection",
      connected: true,
      clientCount: getClientCount(),
      maxClients: getClientLimit(),
    }));

    server.addEventListener("close", (event) => {
      removeClient(server);
      try {
        server.close(event.code, event.reason);
      } catch {
        // already closed
      }
    });
    server.addEventListener("error", (event) => {
      log.error("WebSocket error:", event);
      removeClient(server);
    });

    return new Response(null, { status: 101, webSocket: client });
  }
}
