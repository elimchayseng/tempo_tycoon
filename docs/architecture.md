# Architecture

## System Overview

```
┌──────────────────────────────────────────────────────────────┐
│  Frontend (React 19 + Vite)                                  │
│  web/App.tsx — Zoo Tycoon themed dashboard                   │
│  ← WebSocket (zoo_agents, zoo_purchase, zoo_merchant_state,  │
│     zoo_restock_event, zoo_needs) →                          │
├──────────────────────────────────────────────────────────────┤
│  Server (Hono)                                               │
│  server/index.ts — main entry, routes, WebSocket, static     │
│  ┌────────────────┬──────────────────┬────────────────────┐  │
│  │ zoo-registry   │ zoo-merchant     │ zoo-agents         │  │
│  │ /registry      │ /food/catalog    │ /agents/start|stop │  │
│  │ /status        │ /food/checkout/* │ /agents/status     │  │
│  │ /health        │                  │ /agents/metrics    │  │
│  │ /preflight     │                  │                    │  │
│  └────────────────┴──────────────────┴────────────────────┘  │
├──────────────────────────────────────────────────────────────┤
│  Agents                                                      │
│  agents/agent-runner.ts — lifecycle + event aggregation       │
│  ┌──────────────────────┬────────────────────────────────┐   │
│  │ 3x BuyerAgent        │ MerchantAgent                  │   │
│  │ buyer-agent.ts        │ merchant-agent.ts              │   │
│  │ decision-engine.ts    │ merchant-inventory.ts          │   │
│  │ acp-client.ts         │ (shared inventory singleton)   │   │
│  └──────────────────────┴────────────────────────────────┘   │
│  Shared: payment-manager.ts, balance-sync.ts,                │
│          circuit-breaker.ts, wallet-generator.ts,             │
│          wallet-funder.ts                                     │
├──────────────────────────────────────────────────────────────┤
│  Tempo Moderato Testnet (chain 42431)                        │
│  AlphaUSD TIP-20 token (6 decimals)                          │
└──────────────────────────────────────────────────────────────┘
```

## LLM Brain Layer (Heroku Managed Inference)

```
┌─────────────────────┐       HTTPS        ┌──────────────────────────┐
│  Railway App        │────────────────────►│  Heroku Managed Inference│
│  (tempo-zoo)        │  /v1/chat/completions│  (tempo-tycoon-agent-brain)│
│                     │◄────────────────────│  Claude 4.5 Haiku        │
│  BuyerAgent →       │    tool_calls resp  │  INFERENCE_URL + KEY     │
│  BuyerBrain →       │                     │  (no deployed code)      │
│  LLMClient (fetch)  │                     │                          │
└─────────────────────┘                     └──────────────────────────┘
```

When `LLM_ENABLED=true` and Heroku inference credentials are configured, buyer agents use a `BuyerBrain` powered by Claude 4.5 Haiku to make contextual purchase decisions instead of random product selection.

**Key components:**

| File | Purpose |
|------|---------|
| `agents/llm/llm-client.ts` | Raw `fetch` HTTP client for Heroku `/v1/chat/completions` endpoint |
| `agents/llm/buyer-brain.ts` | Orchestrates LLM calls with ACP-aligned tool definitions |
| `agents/llm/prompts/buyer-system.ts` | Externalized, parameterized system prompt |

**Decision flow with LLM:**

1. Need decay triggers purchase decision (same as deterministic)
2. `BuyerBrain.decide()` sends catalog + agent state to Claude
3. LLM calls `acp_select_and_purchase` (specific SKU) or `acp_skip_cycle`
4. Agent validates LLM choice (SKU exists, available, affordable)
5. Executes purchase through existing ACP checkout flow
6. On any LLM error → falls back to deterministic `DecisionEngine`

**Safety guardrails:**

- 100 LLM calls max per simulation (`maxCallsPerSimulation`)
- 10-second timeout per request
- Feature flag: `LLM_ENABLED=false` disables entirely
- Any error falls back to deterministic engine

**Environment variables:**

| Variable | Description |
|----------|-------------|
| `LLM_ENABLED` | Feature flag (`true`/`false`) |
| `INFERENCE_URL` | Heroku inference endpoint base URL |
| `INFERENCE_KEY` | Heroku addon-scoped API key |
| `LLM_MODEL` | Model ID (default: `claude-4-5-haiku`) |

## Merchant Brain Layer

When `LLM_ENABLED=true`, the merchant agent also receives a `MerchantBrain` powered by the same LLM endpoint (shared `LLMClient` instance). The merchant brain runs on a separate 30-second cycle and makes strategic decisions about pricing and restocking.

**Key components:**

| File | Purpose |
|------|---------|
| `agents/llm/merchant-brain.ts` | Orchestrates LLM calls with merchant ACP tools |
| `agents/llm/prompts/merchant-system.ts` | Merchant system prompt with pricing strategy guidance |
| `agents/demand-tracker.ts` | Rolling 5-minute sales window for demand analysis |

**Decision flow:**

1. Every 30s, `MerchantAgent.runBrainCycle()` builds context (inventory + demand + guardrails)
2. `MerchantBrain.decide()` sends context to Claude
3. LLM calls `acp_adjust_prices`, `acp_restock_inventory`, or `acp_skip_cycle`
4. Price changes are clamped to guardrail bounds (not rejected)
5. Restocks use existing `executeRestock()` flow (on-chain payment)

**Price guardrails:**

- Max change per cycle: +/-30% of current price
- Price floor: cost_basis + $0.25 (minimum margin)
- Price ceiling: 3x base_price (original zoo_map.json price)
- LLM proposals outside bounds are clamped with a warning log

**Note:** Merchant and buyer LLM calls share the same `maxCallsPerSimulation` cap.

## Agent-to-Agent Commerce

The zoo simulation implements true **agent-to-agent commerce** — not just agent-to-API:

1. **BuyerAgents** autonomously decide to purchase food based on need decay, then pay the Merchant on-chain
2. **MerchantAgent** autonomously monitors inventory and restocks by paying Zoo Master (supplier) on-chain
3. Both directions involve real AlphaUSD transfers on the Tempo blockchain

```
BuyerAgent ──$AlphaUSD──► MerchantAgent ──$AlphaUSD──► Zoo Master (supplier)
  (buyer)                   (merchant)                   (wholesaler)
```

The MerchantAgent maintains a shared inventory singleton (`merchant-inventory.ts`) that both the agent and the HTTP merchant routes read from. When buyers purchase items, stock decrements; when stock drops to ≤1, the merchant autonomously restocks.

## Component Inventory

| File | Purpose |
|------|---------|
| `server/index.ts` | Main entry — Hono app, WebSocket, static file serving, route mounting |
| `server/routes/zoo-shared.ts` | Shared state: AgentRunner instance, `loadZooRegistry()`, `refreshZooBalances()` |
| `server/routes/zoo-registry.ts` | Registry, status, health, preflight, transactions endpoints |
| `server/routes/zoo-merchant.ts` | Food catalog (live inventory), checkout create/complete, session management |
| `server/routes/zoo-agents.ts` | Agent start/stop, metrics, force-purchase, event wiring |
| `server/routes/zoo.ts` | Barrel file composing the three sub-routers |
| `server/config.ts` | Centralized config from environment variables |
| `server/tempo-client.ts` | viem public/wallet client for Tempo blockchain |
| `server/middleware/session-verifier.ts` | On-chain transaction verification for checkout completion |
| `server/zoo-accounts.ts` | Zoo wallet registration (ephemeral, generated per run) |
| `server/accounts.ts` | In-memory account store with balance tracking |
| `server/instrumented-client.ts` | WebSocket broadcast + action lifecycle logging |
| `agents/agent-runner.ts` | Manages 3 BuyerAgents + 1 MerchantAgent, wallet lifecycle, depletion monitor, event aggregation |
| `agents/buyer-agent.ts` | Autonomous loop: degrade needs → decide → purchase → update state |
| `agents/merchant-agent.ts` | Autonomous loop: check inventory → restock low items → on-chain payment |
| `agents/merchant-inventory.ts` | Shared inventory singleton (stock tracking, restock logic) |
| `agents/llm/llm-client.ts` | HTTP client for Heroku Managed Inference (OpenAI-compatible) |
| `agents/llm/buyer-brain.ts` | LLM orchestration with ACP-aligned tool definitions |
| `agents/llm/prompts/buyer-system.ts` | Externalized buyer system prompt |
| `agents/decision-engine.ts` | Need-based purchase logic with configurable thresholds (deterministic fallback) |
| `agents/acp-client.ts` | HTTP client for merchant ACP endpoints with caching + retry |
| `agents/payment-manager.ts` | Blockchain tx execution via transaction queue |
| `agents/circuit-breaker.ts` | Circuit breaker pattern for RPC and merchant calls |
| `agents/balance-sync.ts` | On-chain balance synchronization |
| `agents/wallet-generator.ts` | Generates 5 ephemeral wallets per simulation run |
| `agents/wallet-funder.ts` | Faucet request + batch distribution to all agents |
| `agents/state-manager.ts` | Persistent agent state (file-based) |
| `shared/logger.ts` | Structured logger with `LOG_LEVEL` support |
| `shared/types.ts` | Shared TypeScript types for frontend + backend |
| `web/App.tsx` | Main dashboard — floating window state, simulation lifecycle, results overlay |
| `web/FloatingWindow.tsx` | Draggable window with Zoo Tycoon wood-grain title bar |
| `web/MobileDrawer.tsx` | Bottom-drawer panel for mobile (single panel at a time) |
| `web/ZooToolbar.tsx` | Bottom toolbar with panel toggles, connection status, balance readout |
| `web/ZooParkView.tsx` | Fullscreen animated zoo park canvas (visitors, shop, animations) |
| `web/ZooHeader.tsx` | Top header bar with simulation title |
| `web/MerchantPanel.tsx` | Shop inventory and purchase history panel |
| `web/BlockchainExplorer.tsx` | Network stats, transaction flow, wallet balances |
| `web/TransactionFlowViz.tsx` | Segmented progress bar for transaction stages |
| `web/PreflightPanel.tsx` | Wallet funding and preflight check display |
| `web/useIsMobile.ts` | Responsive hook (breakpoint at 640px) |

## Data Flow

### Buyer Agent (demand side)

1. **Need decay:** Each 3s cycle, `DecisionEngine.degradeNeeds()` reduces food_need by ~5pts (±20% randomness)
2. **Decision:** When food_need < 40 (threshold), agent decides to purchase
3. **Product selection:**
   - **With LLM** (`LLM_ENABLED=true`): `BuyerBrain.decide()` sends catalog + state to Claude → LLM picks specific product with reasoning
   - **Without LLM** (fallback): `ACPClient` selects random product from catalog
4. **Checkout:** Creates checkout session → gets payment address + amount
5. **Payment:** `PaymentManager` sends AlphaUSD via `sendAction()` through transaction queue
6. **Verification:** Merchant endpoint verifies on-chain tx via `SessionVerifier`
7. **Inventory:** Stock decremented, sale recorded on MerchantAgent
8. **Recovery:** `DecisionEngine.calculateNeedRecovery()` restores food_need based on product category
9. **Broadcast:** Events flow to `AgentRunner` → WebSocket → React dashboard

### Merchant Agent (supply side)

1. **Tick:** Every 5s, merchant agent checks inventory via `getSkusNeedingRestock()`
2. **Detection:** Items with stock ≤ 1 (restock_threshold) are flagged
3. **Cost calculation:** Units needed × cost_basis (retail price - $1.00)
4. **Payment:** Merchant pays Zoo Master (supplier) via `PaymentManager.executeAlphaUsdTransferWithRetry()`
5. **Restock:** On payment success, `restockItem(sku)` refills to max_stock (5)
6. **Broadcast:** `restock_completed` → WebSocket → dashboard inventory update + restock animation

## Resilience Features

- **Circuit breakers:** 5 failures → 30s open → 2 half-open attempts before closing
  - Separate breakers for RPC calls and merchant API calls
- **Transaction queue:** Sequential tx processing with 500ms minimum gap to avoid nonce collisions
- **Retry logic:** 3 attempts with exponential backoff (2s base) for payments
- **Non-recoverable detection:** Skips retry for "insufficient funds" and "unknown account" errors
- **Balance caching:** 60s TTL on registry and catalog responses
- **Depletion detection:** 10s interval checks if all buyer agents are below $10 threshold; auto-stops simulation when depleted

## Tempo Blockchain Data Layer

The Tempo Moderato testnet (chain 42431) is the authoritative source for all balance and transaction data.

### What we read from the blockchain

| Data | Method | Contract / RPC |
|------|--------|----------------|
| AlphaUSD balances | `balanceOf(address)` via `readContract` | TIP-20 token contract |
| Transaction receipts | `getTransactionReceipt(hash)` | RPC |
| Transaction details | `getTransaction(hash)` | RPC (memo decoding, explorer) |
| Transfer events | `getLogs` for `TransferWithMemo` | TIP-20 token contract |
| Network metadata | `getChainId()`, `getBlockNumber()`, `getGasPrice()` | RPC (stats dashboard) |

### How we fetch it

| Component | File | Purpose |
|-----------|------|---------|
| `publicClient` | `server/tempo-client.ts` | viem client configured for Tempo Moderato |
| `refreshZooBalances()` | `server/routes/zoo-shared.ts` | Batch refresh of all zoo account balances from chain |
| `BalanceSync.getAlphaUsdOnChainBalance()` | `agents/balance-sync.ts` | Per-agent on-chain balance read via `readContract` |
| `SessionVerifier` | `server/middleware/session-verifier.ts` | Verifies payment transactions on-chain |

### Source-of-truth principle

- The blockchain is the authoritative source for all balance and transaction data
- The in-memory `accountStore` is a cache updated after on-chain reads
- API endpoints and agents always refresh from chain before reading balances
- `balanceHistoryTracker` and `StateManager` are supplementary tracking, not authoritative

## Wallet Lifecycle (Ephemeral Model)

Each simulation run generates fresh wallets. No private keys are stored in `.env` or persisted between runs.

### Flow

1. **User clicks "Start Zoo"** → `POST /preflight`
2. `AgentRunner.initializeWallets()` clears old state, generates wallets, funds via faucet + batch:
   - `clearZooAccounts()` removes any wallets from a prior run
   - `clearAllStates()` removes agent state files
   - `generateAllWallets()` creates 5 random wallets (Zoo Master, Merchant A, Attendee 1-3)
   - `resetZooAccounts()` registers them in the in-memory `accountStore`
   - `fundZooWallets()`: requests faucet funds for Zoo Master, then distributes via batch (Merchant $100, each Attendee $50)
3. Preflight phase transitions to **ready**
4. **User clicks "Open Gates"** → `POST /agents/start` — agents are created using the already-funded wallets

### Depletion and Auto-Stop

- Every 10s, `startDepletionMonitor()` checks on-chain balances of all 3 buyer agents
- When **all** buyers are below `minBalanceThreshold` ($10), the simulation emits `simulation_depleted` and calls `stop()`
- The server broadcasts `zoo_simulation_complete` via WebSocket
- The frontend transitions to a "Simulation Complete" phase with a "New Simulation" button

### Batch Payment Distribution

Wallet funding uses the Tempo batch payment feature (`server/actions/batch.ts`):
- Zoo Master is the single payer
- 4 sequential `Actions.token.transferSync()` calls distribute funds
- Each transfer includes a memo identifying the purpose ("Zoo Init: Merchant A", etc.)
- Fees are paid by the sender (Zoo Master) in AlphaUSD

## Simulation State Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    SIMULATION STATE FLOW                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────┐   Start Zoo   ┌───────────┐  all pass  ┌───────┐    │
│  │ IDLE │──────────────►│ PREFLIGHT │───────────►│ READY │    │
│  └──┬───┘               └───────────┘            └───┬───┘    │
│     ▲                     │ Steps:                    │        │
│     │                     │ 1. Check blockchain       │        │
│     │                     │ 2. Generate wallets       │        │
│     │                     │ 3. Fund via faucet+batch  │        │
│     │                     │ 4. Verify balances        │        │
│     │                     │ 5. Load merchant registry │        │
│     │                     │ 6. Validate agent runner  │        │
│     │                     │ 7. Funding strategy meta  │        │
│     │                                                 │        │
│     │               Open Gates                        │        │
│     │                     ┌───────────┐               │        │
│     │                     │ STARTING  │◄──────────────┘        │
│     │                     └─────┬─────┘                        │
│     │                           │ Creates agents               │
│     │                           │ from funded wallets           │
│     │                           ▼                              │
│     │                     ┌─────────┐                          │
│     │                     │ RUNNING │                          │
│     │                     └────┬────┘                          │
│     │                          │                               │
│     │               ┌─────────┴──────────┐                    │
│     │               │                    │                     │
│     │          Manual Stop        All buyers                   │
│     │               │           depleted < $10                 │
│     │               ▼                    ▼                     │
│     │          ┌─────────┐       ┌──────────┐                 │
│     │          │ STOPPED │       │ COMPLETE │                 │
│     │          └────┬────┘       └─────┬────┘                 │
│     │               │                  │                       │
│     │               │    New Simulation │                      │
│     └───────────────┴──────────────────┘                      │
│                                                                │
│  On every transition to IDLE:                                  │
│  • clearZooAccounts() removes ephemeral wallets                │
│  • clearAllStates() removes agent state files                  │
│  • resetSimulationData() clears frontend WebSocket state       │
│                                                                │
└─────────────────────────────────────────────────────────────────┘
```

### State Loading Timeline

| Phase Transition | What Happens |
|-----------------|--------------|
| idle → preflight | Blockchain check, wallet generation, faucet funding, batch distribution, balance verification, merchant registry load, runner validation |
| preflight → ready | All checks passed; wallets funded and ready |
| ready → starting | `POST /agents/start` — agents created with pre-funded wallets |
| starting → running | Agent autonomous loops begin (buyers every 3s, merchant every 5s) |
| running → complete | All buyers depleted below $10; `simulation_depleted` event triggers auto-stop |
| running → stopping | Manual stop requested via dashboard |
| stopping/complete → idle | `restart()` called; all ephemeral state cleared |

## Testing

Test scripts live in `scripts/` and run via `tsx` with no test framework dependency.

| Script | Command | Requires Server | Description |
|--------|---------|-----------------|-------------|
| `test-unit-logic.ts` | `npm run test:unit` | No | Pure logic: DecisionEngine, CircuitBreaker, MerchantInventory, WalletGenerator |
| `test-llm-inference.ts` | `npx tsx scripts/test-llm-inference.ts` | No | LLM endpoint connectivity, tool-call completions, BuyerBrain.decide() with mock catalog |
| `test-api-endpoints.ts` | `npm run test:api` | Yes | HTTP endpoint smoke tests |
| `test-websocket.ts` | `npm run test:ws` | Yes | WebSocket event delivery |
| `test-simulation-lifecycle.ts` | `npm run test:lifecycle` | Yes | Full preflight → run → depletion lifecycle |

### LLM Inference Tests (`test-llm-inference.ts`)

Validates the Heroku Managed Inference integration end-to-end without running the simulation. Requires `INFERENCE_URL` and `INFERENCE_KEY` in `.env`.

**What it covers:**
1. **Endpoint connectivity** — raw fetch to `/v1/chat/completions`, verifies HTTP 200 + valid response shape
2. **LLMClient basic chat** — tool call with a simple math prompt, verifies call count tracking
3. **ACP tool-call completion** — sends mock catalog, verifies LLM returns `acp_select_and_purchase` or `acp_skip_cycle` with valid args
4. **BuyerBrain.decide() moderate hunger** — full orchestration with food_need=30, verifies valid SKU selection + reasoning
5. **BuyerBrain.decide() very hungry** — food_need=10 with purchase history, verifies LLM prefers main courses and avoids recent items
6. **Call count tracking** — verifies increment on call, reset to 0 on `resetCallCount()`
