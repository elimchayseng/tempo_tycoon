# Zoo Tycoon ACP - API Specification

## Agentic Commerce Protocol (ACP) Endpoints

This document defines the REST API specification for the Zoo Tycoon Agentic Commerce Protocol.

## Base Configuration

- **Base URL**: `https://your-railway-app.up.railway.app` (production) or `http://localhost:4000` (development)
- **Content-Type**: `application/json`
- **Authentication**: None (testnet simulation)
- **Rate Limiting**: 100 requests per minute per IP

## Registry Endpoints

### GET /api/zoo/registry

Returns the complete merchant registry for agent discovery.

**Response:**
```json
{
  "zoo_info": {
    "name": "Tempo Zoo Simulation",
    "version": "1.0.0",
    "facilitator_address": "0x742d35Cc6634C0532925a3b8d31B0da4e10a8Aef",
    "chain_id": 42431,
    "currency": "AlphaUSD",
    "currency_address": "0x20c0000000000000000000000000000000000001",
    "polling_interval_ms": 10000
  },
  "merchants": [
    {
      "id": "food_stand_01",
      "name": "Zoo Snacks",
      "category": "food",
      "endpoint": "/api/merchant/food",
      "wallet_address": "0x8ba1f109551bD432803012645Hac136c30b0C0Da",
      "menu": [...],
      "operating_hours": {...},
      "status": "active"
    }
  ],
  "agent_needs": {...},
  "simulation_config": {...}
}
```

**Status Codes:**
- `200 OK`: Registry returned successfully
- `503 Service Unavailable`: Registry temporarily unavailable

## Merchant Endpoints

### GET /api/merchant/{type}/catalog

Returns the current product catalog for the specified merchant type.

**Path Parameters:**
- `type`: Merchant type (e.g., `food`, `entertainment`)

**Example Request:**
```
GET /api/merchant/food/catalog
```

**Response:**
```json
{
  "merchant_id": "food_stand_01",
  "merchant_name": "Zoo Snacks",
  "category": "food",
  "products": [
    {
      "sku": "hotdog",
      "name": "Hot Dog",
      "description": "Classic grilled hot dog with your choice of toppings",
      "price": "3.50",
      "currency": "AlphaUSD",
      "category": "main",
      "available": true
    },
    {
      "sku": "nachos",
      "name": "Nachos",
      "description": "Crispy tortilla chips with cheese and jalapeños",
      "price": "4.00",
      "currency": "AlphaUSD",
      "category": "snack",
      "available": true
    }
  ],
  "operating_hours": {
    "start": 9,
    "end": 18,
    "timezone": "UTC"
  },
  "updated_at": "2024-12-01T12:00:00Z"
}
```

**Status Codes:**
- `200 OK`: Catalog returned successfully
- `404 Not Found`: Merchant type not found
- `503 Service Unavailable`: Merchant temporarily unavailable

### POST /api/merchant/{type}/checkout/create

Creates a new checkout session for a purchase.

**Path Parameters:**
- `type`: Merchant type (e.g., `food`, `entertainment`)

**Request Body:**
```json
{
  "sku": "hotdog",
  "quantity": 1,
  "buyer_address": "0x742d35Cc6634C0532925a3b8d31B0da4e10a8Aef"
}
```

**Request Schema:**
- `sku` (string, required): Product SKU from catalog
- `quantity` (integer, required): Number of items (1-10)
- `buyer_address` (string, required): Ethereum address of the buyer

**Response:**
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "merchant_id": "food_stand_01",
  "product": {
    "sku": "hotdog",
    "name": "Hot Dog",
    "price": "3.50"
  },
  "quantity": 1,
  "total_amount": "3.50",
  "currency": "AlphaUSD",
  "recipient_address": "0x8ba1f109551bD432803012645Hac136c30b0C0Da",
  "buyer_address": "0x742d35Cc6634C0532925a3b8d31B0da4e10a8Aef",
  "memo": "Zoo Purchase: hotdog x1",
  "created_at": "2024-12-01T12:00:00Z",
  "expires_at": "2024-12-01T12:05:00Z",
  "status": "pending"
}
```

**Status Codes:**
- `201 Created`: Session created successfully
- `400 Bad Request`: Invalid request parameters
- `404 Not Found`: Product SKU not found
- `409 Conflict`: Product not available
- `503 Service Unavailable`: Merchant temporarily unavailable

**Error Response:**
```json
{
  "error": "Product not available",
  "code": "PRODUCT_UNAVAILABLE",
  "details": {
    "sku": "hotdog",
    "reason": "Out of stock"
  }
}
```

### POST /api/merchant/{type}/checkout/complete

Completes a checkout session by verifying the payment transaction.

**Path Parameters:**
- `type`: Merchant type (e.g., `food`, `entertainment`)

**Request Body:**
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "tx_hash": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
}
```

**Request Schema:**
- `session_id` (string, required): Session ID from checkout/create
- `tx_hash` (string, required): Ethereum transaction hash

**Response (Success):**
```json
{
  "success": true,
  "verified": true,
  "purchase_id": "880e8400-e29b-41d4-a716-446655440001",
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "merchant_id": "food_stand_01",
  "product": {
    "sku": "hotdog",
    "name": "Hot Dog"
  },
  "quantity": 1,
  "total_amount": "3.50",
  "currency": "AlphaUSD",
  "tx_hash": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
  "block_number": "12345678",
  "confirmation_time": "2024-12-01T12:01:30Z",
  "purchase_time": "2024-12-01T12:01:30Z"
}
```

**Response (Failed Verification):**
```json
{
  "success": false,
  "verified": false,
  "error": "Transaction verification failed",
  "code": "TX_VERIFICATION_FAILED",
  "details": {
    "session_id": "550e8400-e29b-41d4-a716-446655440000",
    "tx_hash": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    "reason": "Amount mismatch",
    "expected_amount": "3.50",
    "actual_amount": "3.00"
  }
}
```

**Status Codes:**
- `200 OK`: Transaction verified successfully
- `400 Bad Request`: Invalid request parameters
- `404 Not Found`: Session not found or expired
- `409 Conflict`: Transaction verification failed
- `503 Service Unavailable`: Blockchain verification temporarily unavailable

## Health and Status Endpoints

### GET /api/health

Returns overall service health status.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-12-01T12:00:00Z",
  "services": {
    "server": "healthy",
    "blockchain": "healthy",
    "merchants": "healthy"
  }
}
```

### GET /api/health/blockchain

Returns blockchain connectivity status.

**Response:**
```json
{
  "status": "ok",
  "chain": {
    "id": 42431,
    "name": "Tempo Moderato Testnet",
    "rpc": "https://rpc.moderato.tempo.xyz",
    "latest_block": "12345678"
  },
  "contracts": {
    "alpha_usd": {
      "address": "0x20c0000000000000000000000000000000000001",
      "status": "accessible"
    }
  }
}
```

## Zoo Dashboard Endpoints

### GET /api/zoo/status

Returns current simulation status and agent states.

**Response:**
```json
{
  "simulation": {
    "status": "running",
    "uptime_seconds": 3600,
    "active_agents": 3,
    "total_transactions": 45
  },
  "agents": [
    {
      "id": "attendee_1",
      "status": "active",
      "current_state": {
        "food_need": 75,
        "fun_need": 45,
        "balance": "47.50",
        "last_purchase": "2024-12-01T11:45:00Z"
      },
      "next_action": "considering_purchase",
      "next_action_eta": "2024-12-01T12:02:00Z"
    }
  ],
  "merchants": [
    {
      "id": "food_stand_01",
      "status": "active",
      "sales_today": 15,
      "revenue_today": "52.50",
      "active_sessions": 2
    }
  ]
}
```

### GET /api/zoo/transactions

Returns recent transaction history.

**Query Parameters:**
- `limit` (integer, optional): Number of transactions to return (default: 50, max: 500)
- `since` (ISO 8601 string, optional): Only return transactions after this timestamp

**Example Request:**
```
GET /api/zoo/transactions?limit=10&since=2024-12-01T12:00:00Z
```

**Response:**
```json
{
  "transactions": [
    {
      "id": "tx_001",
      "type": "purchase",
      "agent_id": "attendee_1",
      "merchant_id": "food_stand_01",
      "product": {
        "sku": "hotdog",
        "name": "Hot Dog"
      },
      "amount": "3.50",
      "currency": "AlphaUSD",
      "tx_hash": "0x1234567890abcdef...",
      "status": "completed",
      "timestamp": "2024-12-01T12:01:30Z",
      "block_number": "12345678"
    }
  ],
  "pagination": {
    "total": 45,
    "limit": 10,
    "has_more": true,
    "next_cursor": "2024-12-01T11:55:00Z"
  }
}
```

## Error Handling

### Standard Error Response Format

All endpoints return errors in a consistent format:

```json
{
  "error": "Human readable error message",
  "code": "MACHINE_READABLE_CODE",
  "details": {
    "field": "Additional error context",
    "timestamp": "2024-12-01T12:00:00Z"
  }
}
```

### Common Error Codes

- `INVALID_REQUEST`: Malformed request body or parameters
- `PRODUCT_NOT_FOUND`: Requested product SKU does not exist
- `PRODUCT_UNAVAILABLE`: Product exists but is not currently available
- `SESSION_NOT_FOUND`: Checkout session does not exist
- `SESSION_EXPIRED`: Checkout session has expired
- `TX_VERIFICATION_FAILED`: Transaction verification failed
- `INSUFFICIENT_BALANCE`: Buyer has insufficient balance
- `MERCHANT_UNAVAILABLE`: Merchant is temporarily offline
- `BLOCKCHAIN_ERROR`: Blockchain connectivity issues
- `RATE_LIMIT_EXCEEDED`: Request rate limit exceeded

### HTTP Status Code Summary

- `200 OK`: Successful request
- `201 Created`: Resource created successfully
- `400 Bad Request`: Client error (invalid request)
- `404 Not Found`: Resource not found
- `409 Conflict`: Request conflicts with current state
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error
- `503 Service Unavailable`: Service temporarily unavailable

## Authentication & Security

### Current Implementation
- **Authentication**: None (testnet simulation environment)
- **Authorization**: None (public endpoints)
- **HTTPS**: Required in production via Railway
- **CORS**: Enabled for all origins in development

### Future Considerations
- API key authentication for production use
- Rate limiting per agent/IP address
- Request signing for transaction verification
- Webhook notifications for real-time updates

## Rate Limiting

### Current Limits
- **General endpoints**: 100 requests per minute per IP
- **Checkout endpoints**: 10 checkout sessions per minute per IP
- **Health endpoints**: 20 requests per minute per IP

### Headers
All responses include rate limiting headers:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1638360000
```

## WebSocket Events (Optional)

For real-time updates, clients can connect to `/ws` and receive events:

### Agent State Change
```json
{
  "type": "agent_state_change",
  "agent_id": "attendee_1",
  "state": {
    "food_need": 65,
    "fun_need": 40,
    "balance": "44.00"
  },
  "timestamp": "2024-12-01T12:00:00Z"
}
```

### Purchase Completed
```json
{
  "type": "purchase_completed",
  "purchase_id": "880e8400-e29b-41d4-a716-446655440001",
  "agent_id": "attendee_1",
  "merchant_id": "food_stand_01",
  "amount": "3.50",
  "tx_hash": "0x1234567890abcdef...",
  "timestamp": "2024-12-01T12:01:30Z"
}
```

This API specification provides a complete interface for the Agentic Commerce Protocol, enabling autonomous agents to discover merchants, create purchase sessions, and complete transactions on the Tempo blockchain.