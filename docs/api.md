# API Reference

Base URL: `http://localhost:4000`

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
Runs pre-flight checks before starting the zoo simulation.

**Response:**
```json
{
  "success": true,
  "checks": [
    { "id": "blockchain", "label": "Blockchain connectivity", "status": "pass", "detail": "Block #123" },
    { "id": "accounts", "label": "Zoo accounts initialized", "status": "pass", "detail": "5 accounts found" },
    { "id": "balances", "label": "Wallet balances", "status": "pass" },
    { "id": "merchants", "label": "Merchant registry", "status": "pass" },
    { "id": "runner", "label": "Agent runner", "status": "pass" }
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
Start all agents. Performs initial funding, then starts autonomous loops.

### `POST /api/zoo/agents/stop`
Stop all agents.

### `POST /api/zoo/agents/fund`
Trigger manual funding check. Refunds agents below the $10 threshold.

### `POST /api/zoo/agents/:agentId/purchase`
Force a specific agent to make an immediate purchase (for testing).

**Request (optional):**
```json
{ "max_budget": 10.0 }
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

### Error Response Format

All error responses include a `code` field for programmatic handling:

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE",
  "details": "Additional context"
}
```
