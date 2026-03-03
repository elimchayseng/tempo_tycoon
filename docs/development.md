# Development Guide

## npm Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start server + Vite dev server concurrently |
| `npm run dev:server` | Start server only (tsx watch mode) |
| `npm run dev:web` | Start Vite dev server only |
| `npm run build` | Build frontend with Vite |
| `npm run start` | Start production server |
| `npm run check` | TypeScript type check (`tsc --noEmit`) |
| `npm run health:check` | Run health checks against running server |
| `npm run test:unit` | Pure logic tests (no server needed) |
| `npm run test:api` | API endpoint tests (requires server) |
| `npm run test:ws` | WebSocket connectivity test (requires server) |
| `npm run test:lifecycle` | Full simulation lifecycle test (requires server + blockchain) |
| `npm run test:integration` | Single purchase cycle test (requires server + blockchain) |
| `npm run test:load` | Load/performance test (requires server + blockchain) |
| `npm run test:all` | Run unit + API + WebSocket tests |

## First-Time Setup

```bash
# Install dependencies
npm install

# Copy .env (included in repo with sensible defaults)
cp .env.example .env  # if not already present

# Start development
npm run dev
```

No wallet generation or manual funding is needed — wallets are ephemeral and generated automatically during each preflight.

## Common Workflows

### Running the Full Simulation

1. Start the server: `npm run dev`
2. Open `http://localhost:4000`
3. Click **Start Zoo** — runs preflight (generates ephemeral wallets, funds via faucet)
4. When preflight passes, click **Open Gates** to start agents
5. Agents will autonomously purchase food as needs decay
6. Simulation auto-stops when all buyers deplete below $10
7. Click **New Simulation** to start fresh (clears all state, generates new wallets)

### Forcing a Purchase (Testing)

```bash
curl -X POST http://localhost:4000/api/zoo/agents/attendee_1/purchase \
  -H "Content-Type: application/json" \
  -d '{"max_budget": 10}'
```

### Debugging with Verbose Logs

```bash
LOG_LEVEL=debug npm run dev
```

This shows all debug-level logs including:
- HTTP request/response details
- ACP client cache hits/misses
- Balance sync comparisons
- Decision engine evaluations
- Circuit breaker state transitions

### Checking System Status

```bash
# Pre-flight checks
curl -X POST http://localhost:4000/api/zoo/preflight | jq

# Agent status
curl http://localhost:4000/api/zoo/agents/status | jq

# Aggregate metrics
curl http://localhost:4000/api/zoo/agents/metrics | jq

# Blockchain health
curl http://localhost:4000/api/health/blockchain | jq
```

## Testing

### Test Tiers

The test suite is organized in tiers by dependency requirements:

**Tier 1 — No dependencies (runs instantly):**
```bash
npm run test:unit       # DecisionEngine, CircuitBreaker, MerchantInventory, WalletGenerator
```

**Tier 2 — Requires running server (`npm run dev:server`):**
```bash
npm run test:api        # All REST endpoints: shapes, status codes, error handling
npm run test:ws         # WebSocket connect, verify connection message, disconnect
```

**Tier 3 — Requires server + blockchain:**
```bash
npm run test:lifecycle  # Preflight -> start -> verify -> catalog -> stop -> verify
npm run test:integration # Single purchase cycle with forced purchase
npm run test:load       # Multi-agent performance test (configurable duration)
```

**Run all fast tests:**
```bash
npm run test:all        # unit + api + ws (no blockchain needed)
```

### Quick Start

```bash
# 1. Run unit tests immediately (no setup needed)
npm run test:unit

# 2. Start the dev server, then run server-dependent tests
npm run dev:server
npm run test:api
npm run test:ws

# 3. Full lifecycle (server must have blockchain access)
npm run test:lifecycle
```

### Integration Tests

```bash
# Start server with agents disabled (test runs its own AgentRunner):
ZOO_SIMULATION_ENABLED=false npm run dev:server

# In another terminal:
npm run test:integration
```

Runs a single end-to-end purchase cycle: initializes ephemeral wallets, starts agents, forces one purchase, verifies tx_hash, receipt shape, and need recovery.

### Load Tests

```bash
# Start server with agents disabled:
ZOO_SIMULATION_ENABLED=false npm run dev:server

# Default 2 minutes:
npm run test:load

# Custom duration:
npm run test:load -- 5
```

Simulates concurrent agent activity and reports purchase rate, latency, success rate, and merchant metrics (revenue, restocks).

## Project Conventions

- **ESM:** The project uses ES modules (`"type": "module"` in package.json). All imports use `.js` extensions.
- **Structured logging:** Use `createLogger('component')` from `shared/logger.ts` instead of `console.log`. Log levels: debug, info, warn, error.
- **Config:** All tunable values live in `server/config.ts` and are read from environment variables. Agent defaults are in `SIMULATION_DEFAULTS` in `agents/decision-engine.ts`.
- **Error responses:** All API errors include an `error` message, a machine-readable `code`, and optional `details`.
