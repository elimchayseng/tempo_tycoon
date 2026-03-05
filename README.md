# Stablecoin Zoo Tycoon

> Autonomous agents making real blockchain purchases in a virtual zoo economy

[![CI](https://github.com/elimchayseng/stablecoin_zoo_tycoon/actions/workflows/ci.yml/badge.svg)](https://github.com/elimchayseng/stablecoin_zoo_tycoon/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## What is this?

Stablecoin Zoo Tycoon is an autonomous agent commerce simulation built on the Tempo Moderato Testnet. Three AI-driven "zoo attendee" agents discover merchants, make need-based purchase decisions, and execute real on-chain stablecoin transactions — all visualized through a retro Zoo Tycoon-themed dashboard.

The simulation implements the **Agentic Commerce Protocol (ACP)**: agents autonomously browse a merchant registry, evaluate catalogs against their internal needs, create checkout sessions, sign blockchain transactions, and verify purchases. An optional LLM integration lets agents make purchase decisions via tool-calling instead of hard-coded rules.

Every transaction is a real AlphaUSD (TIP-20) transfer on the Tempo blockchain. Wallets are ephemeral — generated fresh each run, funded via faucet, and discarded when the simulation ends. No private keys are stored or reused.

## Quick Start

```bash
# 1. Clone
git clone https://github.com/elimchayseng/stablecoin_zoo_tycoon.git
cd stablecoin_zoo_tycoon

# 2. Install
npm install

# 3. Configure
cp .env.example .env

# 4. Start dev server + dashboard
npm run dev

# 5. Open http://localhost:5173 and click "Start Zoo"
```

## Architecture

The system has four main layers:

- **Server** — Hono API server with WebSocket push, merchant registry, and checkout endpoints
- **Agents** — Three autonomous buyer agents with need-decay loops and a merchant agent managing inventory
- **Blockchain** — All payments via `viem` on Tempo Moderato Testnet (chain 42431, AlphaUSD stablecoin)
- **Dashboard** — React 19 real-time UI showing agent state, transaction flow, and merchant inventory

See [docs/architecture.md](docs/architecture.md) for the full system design and data flow.

## How It Works

### Wallet Lifecycle

Each simulation uses **ephemeral wallets** — 5 fresh keys generated at start (Zoo Master, Merchant, 3 Guests). The Zoo Master receives funds from the testnet faucet and distributes to all agents via batch payment. When agents deplete their balance below $10, the simulation auto-stops. Click "New Simulation" to start fresh.

### Agent Behavior

Agents run on a configurable polling loop. Each cycle:
1. **Need decay** — food need decreases over time (0-100 scale)
2. **Threshold check** — when need drops below 30, the agent decides to purchase
3. **ACP flow** — discover merchants, browse catalog, create checkout, sign tx, verify
4. **State update** — balance and needs update based on purchase

With LLM enabled, agents use tool-calling to decide *what* and *whether* to buy, adding personality and variety.

### Purchase Flow

```
Agent Need Assessment → Registry Discovery → Catalog Query → Checkout Session
→ Transaction Signing → On-chain Payment → Merchant Verification → State Update
```

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/zoo/registry` | Merchant registry for agent discovery |
| `GET` | `/api/zoo/status` | Current simulation status |
| `GET` | `/api/merchant/food/catalog` | Available products and prices |
| `POST` | `/api/merchant/food/checkout/create` | Create purchase session |
| `POST` | `/api/merchant/food/checkout/complete` | Verify on-chain payment |
| `GET` | `/api/health` | System health check |
| `POST` | `/api/zoo/agents/start` | Start simulation |
| `POST` | `/api/zoo/agents/stop` | Stop simulation |

Full documentation: [docs/api.md](docs/api.md)

## Documentation

- [Architecture](docs/architecture.md) — system design and data flow
- [API Reference](docs/api.md) — HTTP and WebSocket endpoints
- [ACP Protocol](docs/acp-protocol.md) — Agentic Commerce Protocol spec
- [Configuration](docs/configuration.md) — environment variables
- [Security](docs/security.md) — auth, rate limiting, CORS
- [Deployment](docs/deployment.md) — Railway deployment guide
- [Development](docs/development.md) — dev workflows, scripts, testing
- [WebSocket Events](docs/websocket-events.md) — real-time event reference

## Testing

```bash
# Unit + integration tests
npm test

# With coverage report
npm run test:coverage

# Script-based tests (require running server)
npm run health:check
npm run test:integration
npm run test:load
```

See [docs/development.md](docs/development.md) for detailed testing instructions.

## Deployment

Deploy to Railway with zero config:

```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

Set `RPC_URL` and `ZOO_SIMULATION_ENABLED=true` in the Railway dashboard. See [docs/deployment.md](docs/deployment.md) for full instructions.

## Tech Stack

- **TypeScript** (ESM) — end-to-end type safety
- **React 19** + **Tailwind CSS 4** — dashboard UI
- **Hono** — lightweight API server with WebSocket
- **viem** — blockchain interactions (Tempo Moderato Testnet)
- **Vitest** — unit and integration testing
- **Vite** — frontend build tooling

## License

MIT — see [LICENSE](LICENSE) for details.
