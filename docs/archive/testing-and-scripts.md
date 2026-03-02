# Scripts, Testing, and Environment Guide

Complete reference for all CLI scripts, testing workflows, and environment configuration.

## Environment Setup

### The `.env` file

All scripts and the dev server read configuration from a `.env` file in the project root. There is no `.env.example` checked into the repo (it is gitignored to avoid leaking generated keys). You need to create `.env` yourself.

**Minimal `.env`:**

```bash
# Blockchain
RPC_URL=https://rpc.moderato.tempo.xyz
EXPLORER_URL=https://explore.moderato.tempo.xyz
CHAIN_ID=42431

# Zoo Wallets — generate with: npm run setup:wallets
ZOO_MASTER_PRIVATE_KEY=0x...
MERCHANT_A_PRIVATE_KEY=0x...
ATTENDEE_1_PRIVATE_KEY=0x...
ATTENDEE_2_PRIVATE_KEY=0x...
ATTENDEE_3_PRIVATE_KEY=0x...

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

If you see `Missing environment variable` errors, make sure your `.env` exists at the project root and contains all five private keys plus `RPC_URL`.

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

Runs a comprehensive check of the entire system. Does not require the dev server to be running (it will report the server as unhealthy if it's down, but other checks still run).

```bash
npm run health:check
```

**What it checks:**
1. Environment variables (all 5 keys + RPC_URL)
2. Tempo blockchain connectivity (chain ID, block number)
3. Wallet balances for all 5 wallets (warns < 10 AlphaUSD, errors < 1)
4. Dev server health endpoint (`/api/health`)

**Exit codes:**
- `0` — all checks pass (or warnings only)
- `1` — one or more errors

**When to use:** Before starting the simulation, after deploying, or to diagnose issues.

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
1. Initializes zoo accounts in the local account store
2. Creates an `AgentRunner` with all 3 attendee agents
3. Funds agents if needed
4. Forces a purchase on the first agent
5. Waits up to 60 seconds for the purchase event
6. Verifies a valid `tx_hash` was returned

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

# 2. Generate wallets
npm run setup:wallets
# Copy the output into a new .env file at the project root

# 3. Add blockchain config to .env
# RPC_URL=https://rpc.moderato.tempo.xyz
# CHAIN_ID=42431

# 4. Fund wallets
npm run fund:agents

# 5. Verify everything
npm run health:check

# 6. Start simulation
npm run dev
```

### Running tests

```bash
# Terminal 1: start server without its own agents
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

# Common fixes:
npm run fund:agents          # if wallets are low
npm run setup:wallets        # if keys are compromised/lost (then re-fund)
```

### Re-funding after extended simulation

Agent balances decrease over time as they make purchases. The `AgentRunner` has built-in auto-refunding from Zoo Master, but if Zoo Master runs dry:

```bash
# 1. Check current balances
npm run health:check

# 2. Fund Zoo Master via faucet (done automatically by fund:agents)
npm run fund:agents
```

---

## Resilience Features (Phase 3)

The testing scripts exercise the following resilience mechanisms:

- **Circuit breakers** (`agents/circuit-breaker.ts`): Shared `rpcCircuitBreaker` and `merchantCircuitBreaker` instances. After 5 consecutive failures, the circuit opens for 30 seconds, then enters half-open mode for 2 test requests before closing again.
- **Transaction queue** (`agents/payment-manager.ts`): All blockchain transactions go through a singleton queue with a 500ms minimum gap to prevent nonce collisions.
- **Payment retry** (`agents/payment-manager.ts`): `makePaymentWithRetry()` retries up to 3 times with exponential backoff (2s, 4s, 8s). Non-recoverable errors (insufficient funds, unknown account) skip retry immediately.
- **Request caching** (`agents/acp-client.ts`): Zoo registry and merchant catalogs are cached for 60 seconds to reduce redundant network calls.
- **Rolling metrics** (`agents/agent-runner.ts`): Last 1000 metric points tracked for time-series stats (success rate, avg latency, tx/min).
