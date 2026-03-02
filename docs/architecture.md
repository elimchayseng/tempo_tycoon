# Architecture

## System Overview

```
┌──────────────────────────────────────────────────────────────┐
│  Frontend (React 19 + Vite)                                  │
│  web/App.tsx — Zoo Tycoon themed dashboard                   │
│  ← WebSocket (zoo_agents, zoo_purchase, zoo_needs) →         │
├──────────────────────────────────────────────────────────────┤
│  Server (Hono)                                               │
│  server/index.ts — main entry, routes, WebSocket, static     │
│  ┌────────────────┬──────────────────┬────────────────────┐  │
│  │ zoo-registry   │ zoo-merchant     │ zoo-agents         │  │
│  │ /registry      │ /food/catalog    │ /agents/start|stop │  │
│  │ /status        │ /food/checkout/* │ /agents/status     │  │
│  │ /health        │                  │ /agents/metrics    │  │
│  │ /preflight     │                  │ /agents/fund       │  │
│  └────────────────┴──────────────────┴────────────────────┘  │
├──────────────────────────────────────────────────────────────┤
│  Agents (AgentRunner → 3x BuyerAgent)                        │
│  agents/agent-runner.ts — lifecycle + event aggregation       │
│  agents/buyer-agent.ts — autonomous loop per agent            │
│  agents/decision-engine.ts — need decay + purchase logic      │
│  agents/acp-client.ts — HTTP client for merchant endpoints    │
│  agents/payment-manager.ts — blockchain tx execution          │
│  agents/circuit-breaker.ts — resilience for RPC + merchant    │
│  agents/balance-sync.ts — on-chain balance reads              │
│  agents/funding-manager.ts — auto-refund from Zoo Master      │
├──────────────────────────────────────────────────────────────┤
│  Tempo Moderato Testnet (chain 42431)                        │
│  AlphaUSD TIP-20 token (6 decimals)                          │
└──────────────────────────────────────────────────────────────┘
```

## Component Inventory

| File | Purpose |
|------|---------|
| `server/index.ts` | Main entry — Hono app, WebSocket, static file serving, route mounting |
| `server/routes/zoo-shared.ts` | Shared state: AgentRunner instance, `loadZooRegistry()`, `refreshZooBalances()` |
| `server/routes/zoo-registry.ts` | Registry, status, health, preflight, transactions endpoints |
| `server/routes/zoo-merchant.ts` | Food catalog, checkout create/complete, session management |
| `server/routes/zoo-agents.ts` | Agent start/stop/fund, metrics, force-purchase, event wiring |
| `server/routes/zoo.ts` | Barrel file composing the three sub-routers |
| `server/config.ts` | Centralized config from environment variables |
| `server/tempo-client.ts` | viem public/wallet client for Tempo blockchain |
| `server/middleware/session-verifier.ts` | On-chain transaction verification for checkout completion |
| `server/zoo-accounts.ts` | Zoo wallet initialization from private keys |
| `server/accounts.ts` | In-memory account store with balance tracking |
| `server/instrumented-client.ts` | WebSocket broadcast + action lifecycle logging |
| `agents/agent-runner.ts` | Manages 3 BuyerAgent instances, funding monitor, event aggregation |
| `agents/buyer-agent.ts` | Autonomous loop: degrade needs → decide → purchase → update state |
| `agents/decision-engine.ts` | Need-based purchase logic with configurable thresholds |
| `agents/acp-client.ts` | HTTP client for merchant ACP endpoints with caching + retry |
| `agents/payment-manager.ts` | Blockchain tx execution via transaction queue |
| `agents/circuit-breaker.ts` | Circuit breaker pattern for RPC and merchant calls |
| `agents/balance-sync.ts` | On-chain balance synchronization |
| `agents/funding-manager.ts` | Batch funding from Zoo Master wallet |
| `agents/state-manager.ts` | Persistent agent state (file-based) |
| `shared/logger.ts` | Structured logger with `LOG_LEVEL` support |
| `shared/types.ts` | Shared TypeScript types for frontend + backend |
| `web/` | React dashboard with Zoo Tycoon (2001) game-inspired UI |

## Data Flow

1. **Need decay:** Each 3s cycle, `DecisionEngine.degradeNeeds()` reduces food_need by ~5pts (±20% randomness)
2. **Decision:** When food_need < 40 (threshold), agent decides to purchase
3. **ACP discovery:** `ACPClient` fetches registry → catalog → selects random product
4. **Checkout:** Creates checkout session → gets payment address + amount
5. **Payment:** `PaymentManager` sends AlphaUSD via `sendAction()` through transaction queue
6. **Verification:** Merchant endpoint verifies on-chain tx via `SessionVerifier`
7. **Recovery:** `DecisionEngine.calculateNeedRecovery()` restores food_need based on product category
8. **Broadcast:** Events flow to `AgentRunner` → WebSocket → React dashboard

## Resilience Features

- **Circuit breakers:** 5 failures → 30s open → 2 half-open attempts before closing
  - Separate breakers for RPC calls and merchant API calls
- **Transaction queue:** Sequential tx processing with 500ms minimum gap to avoid nonce collisions
- **Retry logic:** 3 attempts with exponential backoff (2s base) for payments
- **Non-recoverable detection:** Skips retry for "insufficient funds" and "unknown account" errors
- **Balance caching:** 60s TTL on registry and catalog responses
- **Auto-refunding:** 30s interval funding monitor refunds agents below $10 threshold

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
