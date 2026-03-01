# Zoo Tycoon Agentic Commerce Simulation (ACP) - Complete Specification

## Executive Summary

This project transforms the existing `tempo-zoo-experiment` wallet prototype into an autonomous "Zoo Tycoon" simulation using the **Agentic Commerce Protocol (ACP)** on the **Tempo Moderato Testnet**. The simulation features autonomous buyer agents (zoo attendees) that make need-based purchases from seller agents (zoo merchants) using real blockchain transactions.

## Project Architecture

### Core Components

1. **Zoo Master** (`ZooMaster`) - Protocol Facilitator
   - Hosts the merchant registry (`zoo_map.json`)
   - Manages ecosystem payments and coordination
   - Wallet: Standard EVM wallet on Tempo testnet

2. **Seller Agent** (`MerchantA`) - Service Provider
   - Manages inventory and provides price quotes
   - Exposes ACP-compliant REST endpoints
   - Verifies on-chain payments before fulfilling orders
   - Wallet: Standard EVM wallet on Tempo testnet

3. **Buyer Agents** (`Attendee1-3`) - Consumers
   - Autonomous scripts with internal "needs" system
   - Monitor hunger/entertainment levels over time
   - Execute ACP checkout flows when needs trigger purchases
   - Wallets: Standard EVM wallets on Tempo testnet

### The Facilitator Model

The simulation uses a "Discovery & Peer-to-Peer" approach instead of centralized processing:

1. **Discovery**: Buyer agents query Zoo Master for `zoo_map.json` to find available merchants
2. **Negotiation**: Buyer agents connect directly to seller APIs to initiate purchase sessions
3. **Settlement**: Buyer agents sign and broadcast transactions on Tempo Testnet (Chain ID: `42431`)
4. **Verification**: Seller agents monitor transaction hashes to confirm payment before finalizing orders

## Technical Specifications

### Network Configuration
- **Network**: Tempo Moderato Testnet
- **Chain ID**: `42431`
- **RPC URL**: `https://rpc.moderato.tempo.xyz`
- **Currency**: AlphaUSD (TIP-20 token at `0x20c0000000000000000000000000000000000001`)
- **Explorer**: `https://explore.moderato.tempo.xyz`

### Merchant Registry Structure

```json
{
  "zoo_info": {
    "name": "Tempo Zoo Simulation",
    "version": "1.0.0",
    "facilitator_address": "0xZooMasterAddress",
    "chain_id": 42431,
    "currency": "AlphaUSD",
    "polling_interval_ms": 10000
  },
  "merchants": [
    {
      "id": "food_stand_01",
      "name": "Zoo Snacks",
      "category": "food",
      "description": "Delicious snacks and beverages for hungry zoo visitors",
      "endpoint": "https://your-railway-app.up.railway.app/api/merchant/food",
      "wallet_address": "0xMerchantAddress",
      "menu": [
        { "sku": "hotdog", "name": "Hot Dog", "price": "3.50" },
        { "sku": "nachos", "name": "Nachos", "price": "4.00" },
        { "sku": "soda", "name": "Soda", "price": "2.50" }
      ],
      "operating_hours": { "start": 9, "end": 18 },
      "location": { "zone": "food_court", "coordinates": [100, 200] }
    }
  ],
  "agent_needs": {
    "food_need": ["food"],
    "fun_need": ["entertainment", "games"]
  }
}
```

### ACP REST API Specification

All merchant endpoints must implement these ACP-compliant routes:

#### GET /api/merchant/{type}/catalog
Returns available products with current pricing.

**Response:**
```json
{
  "merchant_id": "food_stand_01",
  "products": [
    {
      "sku": "hotdog",
      "name": "Hot Dog",
      "price": "3.50",
      "currency": "AlphaUSD",
      "available": true
    }
  ],
  "updated_at": "2024-12-01T12:00:00Z"
}
```

#### POST /api/merchant/{type}/checkout/create
Creates a purchase session with payment details.

**Request:**
```json
{
  "sku": "hotdog",
  "quantity": 1,
  "buyer_address": "0xBuyerAddress"
}
```

**Response:**
```json
{
  "session_id": "uuid-string",
  "amount": "3.50",
  "recipient_address": "0xMerchantAddress",
  "currency": "AlphaUSD",
  "expires_at": "2024-12-01T12:05:00Z",
  "memo": "Zoo Purchase: hotdog"
}
```

#### POST /api/merchant/{type}/checkout/complete
Verifies payment and completes the purchase.

**Request:**
```json
{
  "session_id": "uuid-string",
  "tx_hash": "0xTransactionHash"
}
```

**Response:**
```json
{
  "success": true,
  "verified": true,
  "purchase_id": "uuid-string",
  "product": "hotdog",
  "amount": "3.50",
  "tx_hash": "0xTransactionHash"
}
```

### Agent Behavior System

#### Internal State Management
Each buyer agent maintains internal state that drives purchasing decisions:

```typescript
interface AgentState {
  food_need: number;      // 0-100, decreases over time
  fun_need: number;       // 0-100, decreases over time
  wallet_balance: bigint; // Current AlphaUSD balance
  last_purchase: Date;    // Prevents spam purchasing
  purchase_history: PurchaseRecord[];
}
```

#### Need-Based Decision Engine
- **Need Decay**: Both needs decrease by 1-3 points every polling interval (10 seconds)
- **Purchase Triggers**: Agents initiate purchases when needs drop below 30
- **Need Satisfaction**: Purchasing food increases `food_need` by 40-60 points
- **Budget Management**: Agents won't purchase if balance is below minimum threshold
- **Randomization**: Small random factors prevent predictable behavior

#### Purchase Flow
1. **Need Assessment**: Check if any need is below threshold
2. **Discovery**: Fetch `zoo_map.json` from Zoo Master
3. **Catalog Query**: Get current prices from relevant merchant
4. **Session Creation**: POST to `/checkout/create` with selected item
5. **Payment**: Sign and broadcast transaction using existing wallet utilities
6. **Verification**: POST tx_hash to `/checkout/complete`
7. **State Update**: Increase relevant need and update purchase history

## Development Roadmap

### Phase 1: ACP Infrastructure (1-2 weeks)

**Extend Existing tempo-zoo-experiment Server:**
- Add zoo routes to existing Hono application
- Create ACP merchant endpoints
- Implement session management for checkout flow
- Add zoo-specific wallets to account management system

**Key Files to Create/Modify:**
- `server/routes/zoo.ts` - New ACP endpoints
- `server/zoo-accounts.ts` - Simulation wallet management
- `server/middleware/session-verifier.ts` - Payment verification
- `config/zoo_map.json` - Merchant registry
- Extend `server/index.ts` with zoo routes

**Success Criteria:**
- Manual ACP transaction completion via API testing
- Session creation and verification working
- Registry properly serving merchant data

### Phase 2: Autonomous Agent Development (1-2 weeks)

**Standalone Agent Implementation:**
- Create TypeScript buyer agents with decision logic
- Implement need-based state management
- Build HTTP client for ACP communication
- Add logging and error handling

**Key Files to Create:**
- `agents/buyer-agent.ts` - Main agent logic
- `agents/decision-engine.ts` - Purchase decision system
- `agents/acp-client.ts` - HTTP client for merchant APIs
- `agents/state-manager.ts` - Persistent agent state

**Success Criteria:**
- Agents logging need states and decisions
- Successful catalog discovery and parsing
- Purchase decision triggers functioning correctly

### Phase 3: Blockchain Integration (1-2 weeks)

**End-to-End Automation:**
- Integrate with existing transaction utilities
- Implement payment verification flow
- Add comprehensive error handling and retry logic
- Performance optimization and monitoring

**Key Files to Extend:**
- Reuse `server/actions/send.ts` for transaction signing
- Extend `server/tempo-client.ts` for verification
- Add `agents/payment-manager.ts` for transaction orchestration

**Success Criteria:**
- Fully autonomous purchase cycles
- Real-time transaction verification on Tempo
- Robust error recovery mechanisms

### Phase 4: Monitoring & Analytics (0.5-1 weeks)

**Simple Dashboard:**
- Minimal HTML interface for monitoring
- Real-time updates via existing WebSocket infrastructure
- Basic performance metrics and transaction logging

**Key Files to Create:**
- `web/zoo-dashboard.html` - Simple monitoring interface
- `server/routes/dashboard.ts` - Zoo status endpoints
- Extend existing logging for zoo-specific events

**Success Criteria:**
- Live dashboard showing agent activities
- Transaction feed with blockchain data
- Performance metrics and health monitoring

## Integration Strategy

### Leveraging Existing Infrastructure

**Reuse Existing Components:**
- Server framework (Hono) and routing system
- Wallet management (`accounts.ts`, `accountStore`)
- Transaction utilities (`actions/send.ts`, `tempo-client.ts`)
- Logging system (`instrumented-client.ts`)
- WebSocket infrastructure for real-time updates
- Railway deployment configuration

**Extend Where Needed:**
- Add zoo-specific routes to existing server
- Create new wallet accounts for simulation entities
- Add ACP endpoint implementations
- Extend configuration for zoo parameters

### Directory Structure Integration

```
tempo-zoo-experiment/
├── server/
│   ├── index.ts (main server entry)
│   ├── routes/zoo.ts (ACP endpoints)
│   ├── zoo-accounts.ts (simulation wallets)
│   └── middleware/session-verifier.ts
├── agents/
│   ├── buyer-agent.ts
│   ├── agent-runner.ts
│   ├── acp-client.ts
│   └── payment-manager.ts
├── config/
│   └── zoo_map.json
├── web/
│   └── (React dashboard)
├── scripts/
│   ├── setup-wallets.ts
│   ├── fund-agents.ts
│   └── health-check.ts
├── shared/
│   └── types.ts
├── SPEC.md (this document)
├── ARCHITECTURE.md (technical details)
├── DEPLOYMENT.md (Railway setup)
└── API_SPEC.md (endpoint documentation)
```

## Railway Deployment

### Configuration
The project builds on the existing Railway setup:
- Use existing `railway.toml` as base
- Extend with zoo-specific environment variables
- Leverage existing health check and monitoring endpoints

### Environment Variables
```bash
# Core variables
RPC_URL=https://rpc.moderato.tempo.xyz
EXPLORER_URL=https://explore.moderato.tempo.xyz
PORT=4000

# New zoo-specific variables
ZOO_MASTER_PRIVATE_KEY=0x...
MERCHANT_A_PRIVATE_KEY=0x...
ATTENDEE_1_PRIVATE_KEY=0x...
ATTENDEE_2_PRIVATE_KEY=0x...
ATTENDEE_3_PRIVATE_KEY=0x...

# Simulation parameters
AGENT_POLLING_INTERVAL=10000
NEED_DECAY_RATE=2
PURCHASE_THRESHOLD=30
MIN_BALANCE_THRESHOLD=10.0
```

### Service Architecture
- **Web Service**: Server with zoo routes
- **Worker Service**: Autonomous agents running as separate Railway worker
- **Shared Database**: Use Railway's built-in storage for session management

## Testing Strategy

### Phase 1 Testing
- Manual API testing via curl/Postman for all ACP endpoints
- Session creation and verification workflows
- Integration with existing wallet management system

### Phase 2 Testing
- Agent decision logic with mock scenarios
- State persistence across agent restarts
- HTTP client communication with merchants

### Phase 3 Testing
- End-to-end purchase automation on Tempo testnet
- Transaction verification accuracy
- Performance under multiple concurrent agents

### Phase 4 Testing
- Dashboard functionality and real-time updates
- Monitoring accuracy and system health
- Long-running simulation stability

## Success Metrics

### Technical Metrics
- **Transaction Success Rate**: >95% of initiated purchases complete successfully
- **Response Time**: <2 seconds for ACP endpoint responses
- **Agent Uptime**: >99% agent availability during simulation runs
- **Error Recovery**: <30 seconds to recover from transaction failures

### Behavioral Metrics
- **Purchase Frequency**: Agents make 3-5 purchases per hour based on needs
- **Need Management**: Needs stay within healthy ranges (20-80) most of the time
- **Budget Management**: No agent runs out of funds unexpectedly
- **Realistic Variation**: Purchase timing shows natural randomness, not robotic patterns

## Risk Mitigation

### Technical Risks
- **Network Issues**: Implement exponential backoff and circuit breakers
- **Transaction Failures**: Comprehensive retry logic with session timeout handling
- **Rate Limiting**: Respect Tempo testnet limits with proper queuing
- **Memory Leaks**: Proper cleanup of agent state and HTTP connections

### Operational Risks
- **Fund Management**: Monitoring and alerting for low wallet balances
- **Simulation Monitoring**: Health checks and automatic restart capabilities
- **Configuration Management**: Environment validation and startup checks
- **Debugging**: Comprehensive logging for troubleshooting issues

## Future Enhancements

### Phase 5: Multi-Merchant Expansion
- Add entertainment merchants (games, shows)
- Implement merchant competition and pricing strategies
- Add seasonal events and special promotions

### Phase 6: Advanced Agent Behaviors
- Personality traits affecting purchasing decisions
- Social interactions between agents
- Learning algorithms to optimize purchasing patterns

### Phase 7: Analytics and Insights
- Advanced dashboard with charts and trends
- Merchant performance analytics
- Economic modeling and simulation insights

---

This specification provides a complete blueprint for implementing the Zoo Tycoon Agentic Commerce Simulation while leveraging the robust Tempo testnet infrastructure.