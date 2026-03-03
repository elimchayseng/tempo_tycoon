# Scripts, Testing, and Environment Guide

> **Note:** This document is partially archived. Wallet management is now ephemeral — private keys
> are generated automatically during preflight and do not need to be stored in `.env`.
> See `docs/development.md` for the current testing guide.

Complete reference for all CLI scripts, testing workflows, and environment configuration.

## Environment Setup

### The `.env` file

The `.env` file is optional for most workflows. Wallets are now **ephemeral** — generated fresh during each preflight — so no private keys are needed in `.env`.

**Minimal `.env` (if needed):**

```bash
# Blockchain (usually auto-configured)
RPC_URL=https://rpc.moderato.tempo.xyz
EXPLORER_URL=https://explore.moderato.tempo.xyz
CHAIN_ID=42431

# Simulation Parameters (all optional, shown with defaults)
ZOO_SIMULATION_ENABLED=true
AGENT_POLLING_INTERVAL=10000   # ms between agent decision cycles
NEED_DECAY_RATE=2              # need points lost per cycle
PURCHASE_THRESHOLD=30          # agents buy when need drops below this
MIN_BALANCE_THRESHOLD=10.0     # AlphaUSD — triggers refunding
```

### How `.env` is loaded

- **Dev server** (`npm run dev:server`): loaded via `server/env.ts`, which calls `dotenv.config()` pointing at the root `.env`.
- **Scripts** (`npm run fund:agents`, `test:integration`, etc.): loaded via `import 'dotenv/config'` at the top of each script.
- **Agents** (`npm run dev:agents`): loaded through the server's env.ts when imported transitively.

---

## Scripts Reference

All scripts are run from the project root.

### `npm run setup:wallets`

**Script:** `scripts/setup-wallets.ts`

Generates 5 fresh Ethereum private keys and prints them to stdout. Does not write any files — you copy the output into your `.env` manually.

```bash
npm run setup:wallets
```

**When to use:** First-time setup, or when you want to rotate to new wallets.

**Output:**
```
Zoo Wallet Setup
================

Generated 5 new wallets for Zoo Tycoon simulation:

ZOO_MASTER_PRIVATE_KEY=0xabc123...
  Address: 0x742d35Cc...

MERCHANT_A_PRIVATE_KEY=0xdef456...
  Address: 0x8ba1f109...
...
```

Copy the `*_PRIVATE_KEY=0x...` lines into your `.env`.

---

### `npm run fund:agents`

**Script:** `scripts/fund-agents.ts`

Distributes AlphaUSD from the Zoo Master wallet to all other wallets. If Zoo Master doesn't have enough balance, it automatically requests funds from the Tempo faucet first.

```bash
npm run fund:agents
```

**Prerequisites:**
- All 5 private keys set in `.env`
- Network connectivity to Tempo RPC

**Default funding amounts:**
| Wallet | Amount |
|--------|--------|
| Merchant A | 100.0 AlphaUSD |
| Attendee 1 | 50.0 AlphaUSD |
| Attendee 2 | 50.0 AlphaUSD |
| Attendee 3 | 50.0 AlphaUSD |

**When to use:** After generating new wallets, or whenever agent balances run low.

---

### `npm run health:check`

**Script:** `scripts/health-check.ts`

Runs a comprehensive check of the entire system. Does not require the dev server to be running (blockchain checks still run; server-dependent checks report warnings if server is down).

```bash
npm run health:check
```

**What it checks:**
1. Tempo blockchain connectivity (chain ID, block number)
2. Server health endpoint (`/api/health`)
3. Preflight endpoint (`POST /api/zoo/preflight`)
4. Zoo registry endpoint (`GET /api/zoo/registry`)
5. Merchant catalog endpoint (`GET /api/merchant/food/catalog`)
6. WebSocket connectivity (`ws://localhost:4000/ws`)

**Exit codes:**
- `0` — all checks pass (or warnings only)
- `1` — one or more errors

**When to use:** Before starting the simulation, after deploying, or to diagnose issues.

---

### `npm run test:unit`

**Script:** `scripts/test-unit-logic.ts`

Pure logic tests that run instantly with no external dependencies (no server, no blockchain).

```bash
npm run test:unit
```

**What it tests:**
- **DecisionEngine**: need degradation, purchase threshold, urgency calculation, budget allocation, food category selection
- **CircuitBreaker**: state transitions (CLOSED/OPEN/HALF_OPEN), failure counting, reset timeout, manual reset
- **MerchantInventory**: initialize, decrement stock, availability check, restock detection/execution
- **WalletGenerator**: generates 5 wallets, valid addresses, unique keys

---

### `npm run test:api`

**Script:** `scripts/test-api-endpoints.ts`

Tests every REST endpoint for correct status codes and response shapes. Requires a running server.

```bash
npm run dev:server   # in one terminal
npm run test:api     # in another
```

---

### `npm run test:ws`

**Script:** `scripts/test-websocket.ts`

Connects to the WebSocket endpoint, verifies the connection acknowledgment message, and disconnects.

```bash
npm run dev:server   # in one terminal
npm run test:ws      # in another
```

---

### `npm run test:lifecycle`

**Script:** `scripts/test-simulation-lifecycle.ts`

Full end-to-end lifecycle: preflight -> start agents -> verify running -> check catalog -> stop -> verify stopped.

```bash
npm run dev:server       # in one terminal
npm run test:lifecycle   # in another
```

---

### `npm run test:all`

Runs the three fast test suites in sequence:

```bash
npm run test:all   # = test:unit && test:api && test:ws
```

---

### `npm run test:integration`

**Script:** `scripts/integration-test.ts`

Runs a single end-to-end purchase cycle: starts agents, forces one purchase, waits for the blockchain transaction to confirm, then verifies the result.

```bash
# 1. Start the dev server in a separate terminal (with agents disabled):
ZOO_SIMULATION_ENABLED=false npm run dev:server

# 2. Run the integration test:
npm run test:integration
```

**Why `ZOO_SIMULATION_ENABLED=false`?**
The integration test creates its own `AgentRunner` internally. If the server also starts an `AgentRunner` (the default when `ZOO_SIMULATION_ENABLED=true`), you get two competing runners fighting over the same wallets and nonces. Disabling it on the server side lets the test control the full lifecycle.

**What it does:**
1. Creates an `AgentRunner` and calls `initializeWallets()` (generates ephemeral wallets + funds via faucet)
2. Calls `start()` to create buyer agents + merchant agent
3. Verifies merchant agent starts alongside buyer agents
4. Forces a purchase on the first buyer agent
5. Waits up to 60 seconds for the purchase event
6. Verifies a valid `tx_hash` and receipt data shape (product_name, amount, tx_hash, block_number)
7. Verifies agent needs recovered after purchase

**Exit codes:**
- `0` — purchase completed with valid tx hash
- `1` — purchase failed or timed out

**What to look for on failure:**
- `No valid tx_hash returned` — the blockchain transaction didn't confirm. Check RPC connectivity and wallet balances.
- `Purchase did not complete. Error: timeout` — the agent loop didn't trigger a purchase within 60s. Check that the server is running and merchant endpoints are responding.
- `Unexpected error` — usually a missing env var or import error.

---

### `npm run test:load`

**Script:** `scripts/load-test.ts`

Runs all 3 agents autonomously for a configurable duration and reports aggregate performance stats.

```bash
# 1. Start the dev server in a separate terminal (with agents disabled):
ZOO_SIMULATION_ENABLED=false npm run dev:server

# 2. Run the load test (default: 2 minutes):
npm run test:load

# Or specify duration in minutes:
npm run test:load -- 5
```

**Why `ZOO_SIMULATION_ENABLED=false`?**
Same reason as the integration test — the load test runs its own `AgentRunner`.

**What it reports:**
```
=== Load Test Results ===
Duration:        2 minute(s)
Agents:          3
Total attempts:  12
Purchases:       11
Failures:        1
Success rate:    91.7%
Avg latency:     1432ms
Purchases/min:   5.50
Total spent:     $43.50
```

**Exit codes:**
- `0` — success rate >= 50%
- `1` — success rate < 50%

**Tips:**
- Run with a longer duration (`5` or `10` minutes) to stress-test resilience and circuit breaker recovery.
- Watch the server terminal for circuit breaker state transitions (`CLOSED -> OPEN -> HALF_OPEN -> CLOSED`).
- If purchases/min is 0 for the first minute, agents may still be in their initial funding cycle.

---

### `npm run dev`

Starts both the dev server and agents together using `concurrently`.

```bash
npm run dev
```

This is equivalent to running `npm run dev:server` and `npm run dev:agents` in two terminals. The server starts with `ZOO_SIMULATION_ENABLED=true` by default, which means it creates its own `AgentRunner` — so you should **not** also run `npm run dev:agents` separately (or you'll get duplicate runners).

---

### `npm run dev:server`

Starts only the Hono dev server (merchant endpoints, registry, health check).

```bash
npm run dev:server

# Or with agents disabled (for running tests separately):
ZOO_SIMULATION_ENABLED=false npm run dev:server
```

---

### `npm run dev:agents`

Starts only the agent simulation runner (no server).

```bash
npm run dev:agents
```

Requires the dev server to already be running on port 4000 so agents can reach merchant endpoints.

---

## Common Workflows

### First-time setup (from scratch)

```bash
# 1. Install dependencies
npm install

# 2. (Optional) Create .env with RPC_URL if not using default
# echo "RPC_URL=https://rpc.moderato.tempo.xyz" > .env

# 3. Run unit tests to verify project builds
npm run test:unit

# 4. Verify everything
npm run health:check

# 5. Start simulation
npm run dev
```

No wallet generation or manual funding is needed — wallets are ephemeral and generated automatically during each preflight.

### Running tests

```bash
# Unit tests (no server needed)
npm run test:unit

# Terminal 1: start server
npm run dev:server

# Terminal 2: run API and WebSocket tests
npm run test:api
npm run test:ws

# Terminal 2: full lifecycle test
npm run test:lifecycle

# Terminal 1: restart server with agents disabled for integration/load tests
ZOO_SIMULATION_ENABLED=false npm run dev:server

# Terminal 2: run integration test
npm run test:integration

# Terminal 2: run load test (after integration test passes)
npm run test:load
```

### Diagnosing issues

```bash
# Check everything at once
npm run health:check

# Run quick tests to isolate issues:
npm run test:unit        # verify core logic works
npm run test:api         # verify API endpoints respond correctly
npm run test:ws          # verify WebSocket connectivity
```

### Re-funding

With ephemeral wallets, funding happens automatically during preflight. If a simulation runs out of funds, simply start a new one — the preflight will generate fresh wallets and fund them from the faucet.

---

## Resilience Features (Phase 3)

The testing scripts exercise the following resilience mechanisms:

- **Circuit breakers** (`agents/circuit-breaker.ts`): Shared `rpcCircuitBreaker` and `merchantCircuitBreaker` instances. After 5 consecutive failures, the circuit opens for 30 seconds, then enters half-open mode for 2 test requests before closing again.
- **Transaction queue** (`agents/payment-manager.ts`): All blockchain transactions go through a singleton queue with a 500ms minimum gap to prevent nonce collisions.
- **Payment retry** (`agents/payment-manager.ts`): `makePaymentWithRetry()` retries up to 3 times with exponential backoff (2s, 4s, 8s). Non-recoverable errors (insufficient funds, unknown account) skip retry immediately.
- **Request caching** (`agents/acp-client.ts`): Zoo registry and merchant catalogs are cached for 60 seconds to reduce redundant network calls.
- **Rolling metrics** (`agents/agent-runner.ts`): Last 1000 metric points tracked for time-series stats (success rate, avg latency, tx/min).
