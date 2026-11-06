# Deployment

## Cloudflare Workers (primary)

Live at **https://tempo-tycoon.elimchayseng13.workers.dev**.

### How it runs

```
Browser ──► Worker (worker/index.ts)
              │  /api/health           → answered at the edge
              │  /api/*, /ws           → forwarded to the Durable Object
              │  everything else       → embedded frontend (worker/static.ts)
              ▼
            Durable Object "ZooServer" (worker/zoo-server.ts) — exactly one instance
              runs server/app.ts (the same Hono app the Node server uses)
              holds AgentRunner, accounts, checkout sessions, WebSocket clients
              ▼
            Tempo Moderato RPC
```

The Node server was a single long-lived process with all state in memory. On
Cloudflare, one global Durable Object plays that role: every API request and
WebSocket goes to the same instance (`idFromName("zoo")`), so the module-level
singletons in `server/` and `agents/` behave exactly as they did on Node.

**Lifetime.** Agent loops are `setTimeout` chains, which only fire while the
object is in memory. Two things keep it resident during a simulation:

- open WebSockets (accepted with the standard, non-hibernating API), and
- a keep-alive alarm that re-arms every 10s while `AgentRunner.running` is true,
  so the simulation keeps going with zero viewers connected.

When the simulation stops, the alarm stops re-arming and the object is evicted
once idle. If it is evicted mid-run (a deploy, a runtime restart), the run is
lost. That is the same as a Railway restart: wallets are ephemeral testnet
wallets that every preflight regenerates.

**Runtime differences handled in code:**

| Node | Workers |
|------|---------|
| `@hono/node-ws` WebSockets | `WebSocketPair` in the Durable Object (`BroadcastSocket` interface in `server/instrumented-client.ts`) |
| Agents call `http://localhost:PORT` for ACP | In-process `app.fetch()` via `server/runtime.ts` |
| Agent state as JSON files in `agent-states/` | `MemoryStateBackend` (`agents/state-manager.ts`) |
| `readFileSync(config/zoo_map.json)` | JSON import, bundled at build time |
| Module-level `setInterval` cleanup timers | Lazy cleanup on request (Workers forbid timers and I/O at module load) |
| `serveStatic("./dist")` | `dist/` embedded into the bundle (`scripts/build-worker-assets.ts`) |

The frontend is embedded in the Worker bundle rather than uploaded as Workers
Static Assets, so a deploy is a single script upload. Static requests are
therefore Worker invocations. To switch to Static Assets later, add an
`assets` block to `wrangler.jsonc` (`directory: "./dist"`,
`run_worker_first: ["/api/*", "/ws"]`) and return `env.ASSETS.fetch(request)`
in `worker/index.ts`.

### Deploy

Requires a Cloudflare API token with **Workers Scripts: Edit** (the "Edit
Cloudflare Workers" template works).

```bash
export CLOUDFLARE_API_TOKEN=...      # or: npx wrangler login
export CLOUDFLARE_ACCOUNT_ID=9897c3ca5369aac50924bf7b7a68143c
```

The admin token is baked into the frontend bundle at build time
(`VITE_ADMIN_TOKEN`) and must match the Worker's `ADMIN_TOKEN` secret (see
[Security](./security.md)):

```bash
npx wrangler secret put ADMIN_TOKEN            # first deploy, or to rotate it
```

```bash
VITE_ADMIN_TOKEN=<same token> npm run cf:deploy
```

`cf:deploy` runs `vite build`, embeds `dist/` into
`worker/static-manifest.generated.js`, then runs `wrangler deploy`. Delete
`dist/` before building. Vite does not empty it, because it sits outside
Vite's root, so stale bundles would get embedded too.

Non-secret configuration lives in `vars` in `wrangler.jsonc`. To turn on the
LLM brains, set `LLM_ENABLED`, `INFERENCE_URL` and `LLM_MODEL` in `vars`, and
`INFERENCE_KEY` with `wrangler secret put`.

### Local Workers runtime

```bash
echo "ADMIN_TOKEN=local-dev-token" > .dev.vars
VITE_ADMIN_TOKEN=local-dev-token npm run cf:dev
```

This runs the real workerd runtime on http://localhost:8787. `npm run dev`
(the Node server and Vite) is still the faster loop for day-to-day work.

### Logs

Workers Logs are enabled (`observability` in `wrangler.jsonc`). View them in
the Cloudflare dashboard under Workers & Pages → tempo-tycoon → Logs, or
stream them with `npx wrangler tail`.

### Verification

```bash
curl https://tempo-tycoon.elimchayseng13.workers.dev/api/health
curl https://tempo-tycoon.elimchayseng13.workers.dev/api/health/blockchain
curl https://tempo-tycoon.elimchayseng13.workers.dev/api/zoo/status
curl -X POST https://tempo-tycoon.elimchayseng13.workers.dev/api/zoo/preflight \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

## Node (Railway or any Node host)

The Node entry (`server/index.ts`) still works and shares `server/app.ts` with
the Worker. `railway.toml` is kept until the Railway service is retired.

1. Build command: `npm run build`
2. Start command: `npm run start`
3. Environment variables (see [Configuration](./configuration.md)):

```
PORT=4000
NODE_ENV=production
ADMIN_TOKEN=<strong-random-token>
RPC_URL=https://rpc.moderato.tempo.xyz
ZOO_SIMULATION_ENABLED=true
LOG_LEVEL=info
```

> **Note:** `ADMIN_TOKEN` is required in production. The server refuses to start without it. No private keys are needed: wallets are generated automatically each simulation run.

Health check path: `/api/health`. No external databases are required; all state is in memory.
