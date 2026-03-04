# API Reference

Base URL: `http://localhost:4000`

## Authentication & Rate Limiting

All `POST` endpoints that mutate simulation state require a Bearer token. Rate limiting is applied to expensive endpoints in production. See [Security](./security.md) for details.

## Health

### `GET /api/health`
Simple health check.

**Response:** `{ "status": "ok", "timestamp": "..." }`

### `GET /api/health/blockchain`
Blockchain connectivity check.

**Response:**
```json
{
  "status": "ok",
  "chain": {
    "id": 42431,
    "name": "Tempo Moderato Testnet",
    "rpc": "https://rpc.moderato.tempo.xyz",
    "latestBlock": "12345678"
  }
}
```

## Zoo Registry & Status

### `GET /api/zoo/registry`
Returns the complete merchant registry for agent discovery.

**Response:** Full zoo_map.json with live wallet addresses injected.

### `GET /api/zoo/status`
Current simulation status including agent states and config.

**Response:**
```json
{
  "zoo_enabled": true,
  "simulation_status": "active",
  "config": { "agent_polling_interval": 10000, ... },
  "accounts": [{ "label": "Zoo Master", "address": "0x...", "balances": {} }],
  "agents": {
    "total_agents": 3,
    "active_agents": 3,
    "agent_states": [{ "id": "attendee_1", "status": "online", "needs": { "food_need": 72, "fun_need": 100 }, "balance": "42.50" }]
  }
}
```

### `GET /api/zoo/health`
Zoo-specific health check.

**Response:** `{ "status": "ok", "zoo_enabled": true, "zoo_accounts": { "total": 5, "initialized": true } }`

### `POST /api/zoo/preflight`
Runs pre-flight checks before starting the zoo simulation. Requires auth; rate limited to 10 req/min in production.

**Response:**
```json
{
  "success": true,
  "checks": [
    { "id": "blockchain", "label": "Blockchain connectivity", "status": "pass", "detail": "Block #123" },
    { "id": "wallets", "label": "Wallet initialization", "status": "pass", "detail": "5 ephemeral wallets generated & funded" },
    { "id": "accounts", "label": "Zoo accounts initialized", "status": "pass", "detail": "5 accounts found" },
    { "id": "balances", "label": "Wallet balances", "status": "pass" },
    { "id": "merchants", "label": "Merchant registry", "status": "pass" },
    { "id": "runner", "label": "Agent runner", "status": "pass" },
    { "id": "funding", "label": "Funding strategy metadata", "status": "pass" }
  ]
}
```

### `GET /api/zoo/transactions`
Returns recent transaction history. **Note:** Currently returns empty — not fully implemented.

## Merchant (Food)

### `GET /api/merchant/food/catalog`
Returns available products with pricing.

**Response:**
```json
{
  "merchant_id": "food_court_001",
  "merchant_name": "Zoo Food Court",
  "products": [
    { "sku": "hotdog_001", "name": "Classic Hotdog", "price": "3.50", "currency": "AlphaUSD", "category": "main", "available": true }
  ]
}
```

### `POST /api/merchant/food/checkout/create`
Creates a purchase session with payment details.

**Request:**
```json
{ "sku": "hotdog_001", "quantity": 1, "buyer_address": "0x..." }
```

**Response:**
```json
{
  "session_id": "sess_...",
  "amount": "3.50",
  "currency": "AlphaUSD",
  "recipient_address": "0x...",
  "expires_at": "2025-01-01T00:05:00.000Z",
  "memo": "Zoo Purchase: Classic Hotdog",
  "product": { "sku": "hotdog_001", "name": "Classic Hotdog", "price": "3.50", "quantity": 1 }
}
```

### `POST /api/merchant/food/checkout/complete`
Verifies payment and completes the purchase.

**Request:**
```json
{ "session_id": "sess_...", "tx_hash": "0x..." }
```

**Response:**
```json
{
  "success": true,
  "verified": true,
  "purchase_id": "purchase_...",
  "payment": { "amount": "3.50", "currency": "AlphaUSD", "tx_hash": "0x...", "block_number": "123", "gas_used": "21000" }
}
```

## Agent Management

### `GET /api/zoo/agents/status`
Full status of all agents including metrics and circuit breaker state.

### `GET /api/zoo/agents/metrics`
Aggregate metrics.

**Response:**
```json
{
  "total_agents": 3,
  "active_agents": 3,
  "total_purchases": 15,
  "total_spent": "52.50",
  "average_need_levels": { "food_need": 65, "fun_need": 100 },
  "purchases_per_minute": 1.5,
  "error_rate": 0.0
}
```

### `POST /api/zoo/agents/start`
Start all agents. Creates agents using already-funded wallets from preflight, then starts autonomous loops. No initial funding occurs at start — wallets are funded during the preflight phase. Requires auth; rate limited to 10 req/min.

### `POST /api/zoo/agents/stop`
Stop all agents. Requires auth; rate limited to 10 req/min.

### `POST /api/zoo/agents/:agentId/purchase`
Force a specific agent to make an immediate purchase (for testing). Requires auth; rate limited to 30 req/min.

**Request (optional):**
```json
{ "max_budget": 10.0 }
```

## Blockchain Explorer

### `GET /api/zoo/network/stats`
Live network statistics from the Tempo RPC.

**Response:**
```json
{
  "chain_id": 42431,
  "chain_name": "Tempo Moderato Testnet",
  "latest_block": 12345678,
  "gas_price_gwei": "1.0",
  "rpc_latency_ms": 45,
  "zoo_tx_count": 27,
  "zoo_tx_throughput_per_min": 3.5
}
```

### `GET /api/zoo/network/token-info`
Static metadata about the AlphaUSD TIP-20 token.

**Response:**
```json
{
  "name": "AlphaUSD",
  "symbol": "AUSD",
  "address": "0x...",
  "standard": "TIP-20",
  "decimals": 6,
  "transfer_with_memo_signature": "transferWithMemo(address,uint256,bytes32)"
}
```

### `GET /api/zoo/network/wallets`
All zoo wallet addresses with live on-chain balances (refreshed on each request).

**Response:**
```json
{
  "wallets": [
    {
      "role": "facilitator",
      "label": "Zoo Master",
      "address": "0x...",
      "balance": "1000.00",
      "balance_raw": "1000000000",
      "nonce": 42,
      "explorer_link": "https://explorer.tempo.xyz/address/0x..."
    }
  ]
}
```

### `GET /api/zoo/network/balance-history/:agentId`
Balance history for a specific agent over time.

**Response:**
```json
{
  "agent_id": "attendee_1",
  "history": [
    { "timestamp": 1700000000000, "balance": "50.00", "event": "funding" },
    { "timestamp": 1700000030000, "balance": "46.50", "event": "purchase", "tx_hash": "0x..." }
  ]
}
```

### `GET /api/zoo/network/tx/:txHash`
Detailed transaction information decoded from the blockchain.

**Response:**
```json
{
  "tx_hash": "0x...",
  "block_number": 12345678,
  "gas_used": "21000",
  "fee_ausd": "0.000021",
  "decoded_memo": "Zoo Purchase: Classic Hotdog",
  "confirmations": 5,
  "from": "0x...",
  "to": "0x...",
  "amount": "",
  "explorer_link": "https://explorer.tempo.xyz/tx/0x..."
}
```

## WebSocket

Connect to `ws://localhost:4000/ws`.

### Event Types

| Type | Description |
|------|-------------|
| `connection` | Connection acknowledgment with client count |
| `zoo_simulation` | Simulation started/stopped |
| `zoo_purchase` | Purchase completed with receipt details |
| `zoo_needs` | Agent need level updates |
| `zoo_agents` | Full agent state array broadcast |
| `accounts` | Updated account balances |
| `zoo_merchant_state` | Merchant cycle data (inventory, revenue, sales) |
| `zoo_restock_event` | Merchant restock completed |
| `zoo_balance_update` | Agent balance change |
| `zoo_tx_flow` | Transaction lifecycle stages |
| `zoo_network_stats` | Network metrics (periodic) |
| `zoo_funding_progress` | Wallet funding progress during preflight |
| `zoo_simulation_complete` | All buyers depleted, simulation ending |

### Error Response Format

All error responses include a `code` field for programmatic handling:

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE",
  "details": "Additional context"
}
```
