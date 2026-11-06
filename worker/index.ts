/**
 * Cloudflare Worker entry.
 *
 * /api/* and /ws are forwarded to a single global Durable Object that hosts
 * the whole simulation — the one-process model the Node server had, with the
 * DO playing the part of the process. Everything else is the frontend, served
 * from the Vite build embedded in this bundle (see worker/static.ts).
 */
import { ZooServer } from "./zoo-server.js";
import { serveStatic } from "./static.js";

export { ZooServer };

export interface Env {
  ZOO: DurableObjectNamespace<ZooServer>;
}

/** Name of the single simulation instance. */
const ZOO_INSTANCE = "zoo";

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    // www.tempo-tycoon.com → tempo-tycoon.com (both hostnames are attached to this Worker)
    if (url.hostname.startsWith("www.")) {
      url.hostname = url.hostname.slice(4);
      return Response.redirect(url.toString(), 301);
    }

    // Liveness check answered at the edge, without waking the Durable Object.
    if (url.pathname === "/api/health") {
      return Response.json({ status: "ok", timestamp: new Date().toISOString() });
    }

    if (url.pathname.startsWith("/api/") || url.pathname === "/ws") {
      const stub = env.ZOO.get(env.ZOO.idFromName(ZOO_INSTANCE));
      return stub.fetch(request);
    }

    return serveStatic(request);
  },
} satisfies ExportedHandler<Env>;
