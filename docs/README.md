# Tempo Zoo Experiment

An autonomous agent commerce simulation on the Tempo blockchain. Three AI-driven "zoo attendee" agents autonomously discover merchants, make purchase decisions based on need levels, and execute on-chain transactions — all visualized through a retro Zoo Tycoon-themed dashboard.

## Tech Stack

- **Server:** Hono (Node.js)
- **Frontend:** React 19, Vite, Tailwind CSS 4
- **Blockchain:** viem + Tempo Moderato Testnet
- **Language:** TypeScript (ESM)

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure .env (RPC and simulation params only — no private keys needed)
# A sensible .env is included; adjust RPC_URL if needed

# 3. Start dev server + dashboard
npm run dev
```

The dashboard is available at `http://localhost:5173` (dev) or `http://localhost:4000` (production). Click **Start Zoo** to begin. Wallets are generated automatically each run — no manual wallet setup required.

## Project Structure

```
server/           Hono API server + WebSocket
  routes/         Zoo route modules (registry, merchant, agents)
  middleware/     Auth, rate limiting, tx verification
  actions/        Blockchain operations (send, batch, etc.)
  config.ts       Centralized configuration
agents/           Autonomous buyer agents
  agent-runner.ts Manages 3 buyer agent instances + wallet lifecycle
  buyer-agent.ts  Core agent loop
  wallet-generator.ts  Ephemeral wallet generation
  wallet-funder.ts     Faucet + batch distribution
  decision-engine.ts   Need-based purchase logic
  acp-client.ts   HTTP client for merchant APIs
  payment-manager.ts   Blockchain tx execution + queue
shared/           Shared utilities (logger, types, validation)
web/              React dashboard (Zoo Tycoon UI theme)
config/           zoo_map.json merchant registry
scripts/          Test and health check scripts
docs/             Documentation
```

## Documentation

- [Architecture](./architecture.md) — system design and data flow
- [API Reference](./api.md) — all HTTP and WebSocket endpoints
- [Security](./security.md) — authentication, rate limiting, and CORS
- [Configuration](./configuration.md) — environment variables and config
- [Deployment](./deployment.md) — Railway deployment guide
- [Development](./development.md) — dev workflows and testing
