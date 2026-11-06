# Tempo Tycoon: A Stablecoin Zoo Simulation

> Autonomous agents making real blockchain purchases in a virtual zoo economy

[![CI](https://github.com/elimchayseng/tempo_tycoon/actions/workflows/ci.yml/badge.svg)](https://github.com/elimchayseng/tempo_tycoon/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Live demo: https://tempo-tycoon.com**. It is hosted on Cloudflare Workers; the [workers.dev URL](https://tempo-tycoon.elimchayseng13.workers.dev) serves the same deployment.

> **LLM decision-making is disabled on the live demo (as of 2026-11-06).** The public deployment runs with `LLM_ENABLED=false`, so visitors cannot generate inference costs. Buyer and merchant agents use the built-in rules-based engine instead. Purchases, restocks and payments still happen on-chain exactly the same way. The preflight panel shows this as "LLM inference endpoint: Disabled (rule-based fallback active)". See [Enabling the LLM](#enabling-the-llm) to turn it back on.

## What is this?

Tempo Tycoon is an autonomous agent commerce simulation built on the Tempo Moderato Testnet. Three "zoo attendee" agents discover merchants, make need-based purchase decisions, and execute real on-chain stablecoin transactions. A retro Zoo Tycoon-themed dashboard visualizes all of it.

The simulation implements the **Agentic Commerce Protocol (ACP)**. Agents browse a merchant registry, evaluate catalogs against their internal needs, create checkout sessions, sign blockchain transactions, and verify purchases. An optional LLM integration lets agents decide what to buy via tool-calling instead of rules.

Every transaction is a real AlphaUSD (TIP-20) transfer on the Tempo blockchain. Wallets are ephemeral: generated fresh each run, funded via the testnet faucet, and discarded when the simulation ends. No private keys are stored or reused.

## Using the live demo

1. Open https://tempo-tycoon.com and click **Start Zoo**.
2. Preflight checks the chain connection, generates 5 wallets, funds them from the faucet, and loads the merchant. Each check should show a green tick.
3. Click **Open Gates**. Agents start buying every few seconds; watch purchases, restocks and balances update live.
4. The run stops on its own when buyers can no longer afford anything, or you can stop it yourself.

There is one shared simulation for everyone: all visitors see the same zoo.

## Quick Start (local)

```bash
git clone https://github.com/elimchayseng/tempo_tycoon.git
cd tempo_tycoon
npm install
cp .env.example .env
npm run dev          # Node API server + Vite dashboard
# open http://localhost:5173 and click "Start Zoo"
```

`npm run dev` runs a plain Node server, which is the fastest loop for day-to-day work. To run the same code in Cloudflare's runtime locally, see [Local Workers runtime](#local-workers-runtime).

## Architecture

- **Server**: Hono API (`server/app.ts`) with WebSocket push, merchant registry, and checkout endpoints
- **Agents**: three autonomous buyer agents with need-decay loops, plus a merchant agent managing inventory
- **Blockchain**: all payments via `viem` on Tempo Moderato Testnet (chain 42431, AlphaUSD stablecoin)
- **Dashboard**: React 19 real-time UI with draggable floating windows (desktop) and a bottom drawer (mobile)

The same Hono app runs under two hosts:

| Host | Entry | Used for |
|------|-------|----------|
| Cloudflare Durable Object | `worker/zoo-server.ts` | Production |
| Node | `server/index.ts` | Local development (`npm run dev`) |

See [docs/architecture.md](docs/architecture.md) for the full system design and data flow.

## How It Works

### Wallet Lifecycle

Each simulation uses **ephemeral wallets**: 5 fresh keys generated during preflight (Zoo Master, Merchant, 3 Guests). The Zoo Master receives funds from the testnet faucet and distributes them by batch payment: $100 to the merchant and $50 to each guest. Transfers that hit a transient RPC error are retried without double-sending, and preflight fails if any wallet ends up unfunded.

### Agent Behavior

Each buyer runs a 12-second loop:

1. **Need decay**: food need (0–100) decreases each cycle.
2. **Decision**: below a food need of 40, the agent works out a budget from the money it holds above a $10 reserve, scaled by how hungry it is. It buys only if that budget covers at least the cheapest item on the menu.
3. **ACP flow**: it fetches the catalog, creates a checkout, signs and sends the payment, and the merchant verifies it on-chain.
4. **State update**: need recovers by the item's satisfaction value, and the balance is re-read from the chain.

Without the LLM, the agent picks a random affordable item. With the LLM enabled, it picks its cart via tool-calling and falls back to the rules on any error.

The merchant restocks automatically when an item runs low, paying the Zoo Master on-chain. The simulation auto-stops when every buyer is below the $10 reserve or can no longer afford the cheapest item.

### Purchase Flow

```
Agent Need Assessment → Registry Discovery → Catalog Query → Checkout Session
→ Transaction Signing → On-chain Payment → Merchant Verification → State Update
```

## Deployment

Production runs on **Cloudflare Workers**:

```
Browser ──► Worker (worker/index.ts)
              /api/health      answered at the edge
              /api/*, /ws      forwarded to the Durable Object
              everything else  dashboard (Vite build embedded in the bundle)
              ▼
            Durable Object "ZooServer": exactly one instance
              runs the Hono app and holds the simulation in memory
              ▼
            Tempo Moderato RPC
```

| | |
|---|---|
| URL | https://tempo-tycoon.com (also https://tempo-tycoon.elimchayseng13.workers.dev) |
| Cloudflare account | `9897c3ca5369aac50924bf7b7a68143c` |
| Worker name | `tempo-tycoon` |
| Config | `wrangler.jsonc` (non-secret settings in `vars`) |
| Secrets | `ADMIN_TOKEN` (required). `INFERENCE_KEY` only if the LLM is enabled |
| Logs | Cloudflare dashboard → Workers & Pages → tempo-tycoon → Logs, or `npx wrangler tail` |

### Deploy

You need a Cloudflare API token with **Workers Scripts: Edit** (the "Edit Cloudflare Workers" template), or run `npx wrangler login`.

```bash
export CLOUDFLARE_API_TOKEN=...
export CLOUDFLARE_ACCOUNT_ID=9897c3ca5369aac50924bf7b7a68143c
```

The admin token is baked into the dashboard at build time (`VITE_ADMIN_TOKEN`) and must match the Worker's `ADMIN_TOKEN` secret. It only deters casual misuse, since anyone can read it from the bundle; see [docs/security.md](docs/security.md).

```bash
npx wrangler secret put ADMIN_TOKEN                # first deploy, or to rotate
rm -rf dist                                        # Vite does not clear it (outDir is outside its root)
VITE_ADMIN_TOKEN=<same token> npm run cf:deploy    # vite build → embed dist/ → wrangler deploy
```

**Deploys and running simulations.** When someone has the page open, a new deploy takes up to 5 minutes to reach the Durable Object; this is Cloudflare's default deferred code update. The object then restarts on the new code: viewers' WebSockets reconnect and any simulation in progress is lost. The frontend updates immediately.

### Local Workers runtime

```bash
echo "ADMIN_TOKEN=local-dev-token" > .dev.vars
VITE_ADMIN_TOKEN=local-dev-token npm run cf:dev   # http://localhost:8787
```

### Enabling the LLM

The LLM is disabled on the live demo; see the note at the top. To turn it on for a deployment, set `LLM_ENABLED: "true"`, `INFERENCE_URL` and `LLM_MODEL` in `wrangler.jsonc` → `vars`, then add the key and redeploy:

```bash
npx wrangler secret put INFERENCE_KEY
```

Each simulation is capped at 100 LLM calls, and any LLM error falls back to the rules engine. Leave it off on a public deployment unless you are comfortable paying for visitors' token usage.

See [docs/deployment.md](docs/deployment.md) for the full deployment guide, including runtime details and how to switch the frontend to Workers Static Assets.

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Liveness check |
| `GET` | `/api/health/blockchain` | Chain connectivity |
| `GET` | `/api/zoo/registry` | Merchant registry for agent discovery |
| `GET` | `/api/zoo/status` | Current simulation status |
| `GET` | `/api/merchant/food/catalog` | Available products and prices |
| `POST` | `/api/merchant/food/checkout/create` | Create purchase session |
| `POST` | `/api/merchant/food/checkout/complete` | Verify on-chain payment |
| `POST` | `/api/zoo/preflight` | Generate and fund wallets, run checks (admin) |
| `POST` | `/api/zoo/agents/start` | Start simulation (admin) |
| `POST` | `/api/zoo/agents/stop` | Stop simulation (admin) |

Admin endpoints need `Authorization: Bearer <ADMIN_TOKEN>` and are rate-limited per IP. Full documentation: [docs/api.md](docs/api.md)

## Testing

```bash
npm run check   # typecheck the app and the Worker
npm test        # unit + integration tests (Vitest)

# Script-based tests (require a running server)
npm run health:check
npm run test:integration
npm run test:load
```

CI runs typecheck, tests and build on every pull request. See [docs/development.md](docs/development.md) for details.

## Documentation

- [Architecture](docs/architecture.md): system design and data flow
- [API Reference](docs/api.md): HTTP and WebSocket endpoints
- [ACP Protocol](docs/acp-protocol.md): Agentic Commerce Protocol spec
- [Configuration](docs/configuration.md): environment variables
- [Security](docs/security.md): auth, rate limiting, CORS
- [Deployment](docs/deployment.md): Cloudflare Workers deployment guide
- [Development](docs/development.md): dev workflows, scripts, testing
- [WebSocket Events](docs/websocket-events.md): real-time event reference

## Tech Stack

- **TypeScript** (ESM): end-to-end type safety
- **React 19** + **Tailwind CSS 4**: dashboard UI
- **Hono**: API server with WebSocket
- **viem**: blockchain interactions (Tempo Moderato Testnet)
- **Cloudflare Workers + Durable Objects**: hosting
- **Vitest**: unit and integration testing
- **Vite**: frontend build tooling

## License

MIT. See [LICENSE](LICENSE) for details.
