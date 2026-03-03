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
| `agents/decision-engine.ts` | Need-based purchase logic with configurable thresholds |
| `agents/acp-client.ts` | HTTP client for merchant ACP endpoints with caching + retry |
| `agents/payment-manager.ts` | Blockchain tx execution via transaction queue |
| `agents/circuit-breaker.ts` | Circuit breaker pattern for RPC and merchant calls |
| `agents/balance-sync.ts` | On-chain balance synchronization |
| `agents/wallet-generator.ts` | Generates 5 ephemeral wallets per simulation run |
| `agents/wallet-funder.ts` | Faucet request + batch distribution to all agents |
| `agents/state-manager.ts` | Persistent agent state (file-based) |
| `shared/logger.ts` | Structured logger with `LOG_LEVEL` support |
| `shared/types.ts` | Shared TypeScript types for frontend + backend |
| `web/` | React dashboard with Zoo Tycoon (2001) game-inspired UI |

## Data Flow

### Buyer Agent (demand side)

1. **Need decay:** Each 3s cycle, `DecisionEngine.degradeNeeds()` reduces food_need by ~5pts (±20% randomness)
2. **Decision:** When food_need < 40 (threshold), agent decides to purchase
3. **ACP discovery:** `ACPClient` fetches registry → catalog → selects random product
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

1. **User clicks "Open Gates"** in the dashboard
2. `AgentRunner.start()` clears previous agent state files
3. `generateAllWallets()` creates 5 random wallets (Zoo Master, Merchant A, Attendee 1-3)
4. `resetZooAccounts()` registers them in the in-memory `accountStore`
5. `fundZooWallets()`:
   - Requests faucet funds for Zoo Master via `Actions.faucet.fund()`
   - Polls balance for up to 30s until faucet confirms
   - Distributes via `batchAction()`: Merchant $100, each Attendee $50
6. Agents start their autonomous loops

### Depletion and Auto-Stop

- Every 10s, `startDepletionMonitor()` checks on-chain balances of all 3 buyer agents
- When **all** buyers are below `minBalanceThreshold` ($10), the simulation emits `simulation_depleted` and calls `stop()`
- The frontend transitions to a "Simulation Complete" phase with a "New Simulation" button

### Batch Payment Distribution

Wallet funding uses the Tempo batch payment feature (`server/actions/batch.ts`):
- Zoo Master is the single payer
- 4 sequential `Actions.token.transferSync()` calls distribute funds
- Each transfer includes a memo identifying the purpose ("Zoo Init: Merchant A", etc.)
- Fees are paid by the sender (Zoo Master) in AlphaUSD
