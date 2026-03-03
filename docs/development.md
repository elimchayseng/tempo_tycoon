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
| `npm run test:integration` | Run integration tests |
| `npm run test:load` | Run load tests |

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

### Integration Tests

```bash
npm run test:integration
```

Runs end-to-end tests against a running server: health checks, registry loading, catalog fetching, checkout flow.

### Load Tests

```bash
npm run test:load
```

Simulates concurrent agent activity to test transaction queue, circuit breakers, and nonce management under load.

## Project Conventions

- **ESM:** The project uses ES modules (`"type": "module"` in package.json). All imports use `.js` extensions.
- **Structured logging:** Use `createLogger('component')` from `shared/logger.ts` instead of `console.log`. Log levels: debug, info, warn, error.
- **Config:** All tunable values live in `server/config.ts` and are read from environment variables. Agent defaults are in `SIMULATION_DEFAULTS` in `agents/decision-engine.ts`.
- **Error responses:** All API errors include an `error` message, a machine-readable `code`, and optional `details`.
