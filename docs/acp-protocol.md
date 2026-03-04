# Agentic Commerce Protocol (ACP) Flow

The ACP defines how autonomous buyer agents discover merchants, negotiate purchases, execute on-chain payments, and verify transactions on the Tempo Moderato Testnet.

## Protocol Stages

### 1. Discovery (Registry)

The buyer agent fetches the zoo registry to discover available merchants.

- **Endpoint:** `GET /api/zoo/registry`
- **Source:** `server/routes/zoo-registry.ts` → `loadZooRegistry()` in `server/routes/zoo-shared.ts`
- **Data:** `config/zoo_map.json` (cached in memory after first read)
- **Returns:** Merchant list with endpoints, wallet addresses, and menu items

### 2. Catalog

The buyer agent queries a specific merchant's catalog for current product availability and pricing.

- **Endpoint:** `GET /api/merchant/{category}/catalog`
- **Source:** `server/routes/zoo-merchant.ts` (`/food/catalog`)
- **Returns:** Products with live inventory stock levels and availability

### 3. Checkout Session

The buyer agent creates a checkout session for a specific product. This locks the price and generates a payment address + memo.

- **Endpoint:** `POST /api/merchant/{category}/checkout/create`
- **Source:** `server/routes/zoo-merchant.ts` (`/food/checkout/create`)
- **Request:** `{ sku, quantity, buyer_address }`
- **Returns:** `{ session_id, amount, recipient_address, expires_at, memo }`

### 4. On-chain Payment

The buyer agent signs and broadcasts an AlphaUSD (TIP-20) transfer on the Tempo blockchain.

- **Source:** `agents/payment-manager.ts` → `server/actions/send.ts` (`transferAlphaUsdAction`)
- **Chain:** Tempo Moderato Testnet (Chain ID: 42431)
- **Token:** AlphaUSD at `0x20c0000000000000000000000000000000000001`
- **Mechanism:** Sequential transaction queue with retry logic and circuit breaker

### 5. Merchant Verification

The buyer agent submits the transaction hash to the merchant for on-chain verification.

- **Endpoint:** `POST /api/merchant/{category}/checkout/complete`
- **Source:** `server/routes/zoo-merchant.ts` (`/food/checkout/complete`)
- **Request:** `{ session_id, tx_hash }`
- **Verification:** `server/middleware/session-verifier.ts` reads the transaction receipt from chain
- **Returns:** `{ success, verified, purchase_id, payment: { tx_hash, block_number } }`

## Sequence Diagram

```
Buyer Agent              Zoo Server (Registry + Merchant)        Tempo Blockchain
    │                              │                                    │
    │── GET /registry ────────────>│                                    │
    │<─ zoo_map.json ──────────────│                                    │
    │                              │                                    │
    │── GET /food/catalog ────────>│                                    │
    │<─ products[] ────────────────│                                    │
    │                              │                                    │
    │── POST /checkout/create ────>│                                    │
    │<─ { session_id, amount } ────│                                    │
    │                              │                                    │
    │── AlphaUSD transfer ─────────────────────────────────────────────>│
    │<─ tx_hash, block_number ─────────────────────────────────────────│
    │                              │                                    │
    │── POST /checkout/complete ──>│── verify tx on chain ─────────────>│
    │                              │<─ receipt ─────────────────────────│
    │<─ { verified, purchase_id } ─│                                    │
    │                              │                                    │
    │  [Update needs, record       │  [Decrement stock,                 │
    │   purchase, re-read balance] │   record sale revenue]             │
```

## Decision Paths

### Deterministic Path (LLM disabled)

1. `DecisionEngine.evaluatePurchaseDecision()` checks food need vs threshold
2. `ACPClient.initiatePurchase()` randomly selects an available product
3. `executeACPPurchase()` handles payment → checkout → state update

### LLM Path (LLM enabled)

1. `DecisionEngine` triggers purchase (same threshold logic)
2. `BuyerBrain.decide()` asks LLM which specific product to buy (tool-use)
3. LLM returns `acp_select_and_purchase` (with SKU) or `acp_skip_cycle`
4. On LLM error → falls back to deterministic path
5. `executeACPPurchase()` handles payment → checkout → state update

## Key Files

| File | Role |
|------|------|
| `agents/buyer-agent.ts` | Orchestrates the full purchase cycle |
| `agents/acp-client.ts` | HTTP client for ACP endpoints (with cache + retry) |
| `agents/payment-manager.ts` | Transaction execution with queue + retry + circuit breaker |
| `agents/decision-engine.ts` | Need-based purchase decision logic |
| `agents/llm/buyer-brain.ts` | LLM-powered product selection |
| `server/routes/zoo-merchant.ts` | Merchant ACP endpoints (catalog, checkout) |
| `server/routes/zoo-registry.ts` | Registry + preflight endpoints |
| `server/middleware/session-verifier.ts` | On-chain payment verification |
| `config/zoo_map.json` | Static merchant registry data |
