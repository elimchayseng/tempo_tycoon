# Zoo Tycoon ACP - Technical Architecture

## Integration Strategy with eth_tempo_experiments

This document details how the Zoo Tycoon simulation integrates with and extends the existing `eth_tempo_experiments` infrastructure.

## Existing Infrastructure Analysis

### What We Have
The `eth_tempo_experiments` repository provides:

1. **Hono-based Server** (`server/index.ts`)
   - Express-like routing with TypeScript support
   - WebSocket support for real-time updates
   - Health check endpoints for Railway deployment
   - Structured logging and error handling

2. **Wallet Management** (`server/accounts.ts`)
   - Multi-account wallet management system
   - Secure private key handling
   - Account balance tracking and updates

3. **Tempo Blockchain Integration** (`server/tempo-client.ts`)
   - Pre-configured Tempo Moderato testnet client
   - AlphaUSD token contract interactions
   - Transaction signing and broadcasting utilities

4. **Action Framework** (`server/actions/`)
   - `send.ts` - Comprehensive payment logic
   - `balance.ts` - Account balance queries
   - `batch.ts` - Batch payment processing
   - Logging and state management for all operations

5. **Railway Deployment** (`railway.toml`)
   - Production-ready deployment configuration
   - Environment variable management
   - Health monitoring and auto-restart

### What We Need to Add

1. **ACP Protocol Endpoints** - REST API for merchant interactions
2. **Autonomous Agents** - Buyer agents with decision logic
3. **Session Management** - Purchase session tracking and verification
4. **Zoo-Specific Configuration** - Merchant registry and simulation parameters

## Integration Architecture

### Server Extensions

#### 1. Zoo Routes Integration (`server/routes/zoo.ts`)
Extend the existing Hono app with new routes:

```typescript
// In server/index.ts, add:
import { zooRoutes } from "./routes/zoo.js";
app.route("/api/zoo", zooRoutes);
app.route("/api/merchant", zooRoutes);
```

#### 2. Zoo Account Management (`server/zoo-accounts.ts`)
Extend the existing account system:

```typescript
import { accountStore } from "./accounts.js";

export const zooWallets = {
  zooMaster: "zoo_master",
  merchantA: "merchant_a",
  attendee1: "attendee_1",
  attendee2: "attendee_2",
  attendee3: "attendee_3"
};

// Initialize zoo accounts in existing accountStore
export function initializeZooAccounts() {
  // Add zoo-specific wallets to the existing account management
}
```

#### 3. Session Management (`server/middleware/session-verifier.ts`)
New middleware for ACP checkout sessions:

```typescript
import { publicClient } from "../tempo-client.js";

interface CheckoutSession {
  session_id: string;
  buyer_address: string;
  amount: string;
  recipient_address: string;
  expires_at: Date;
  status: 'pending' | 'completed' | 'expired';
}

export class SessionManager {
  // Session storage and verification logic
}
```

### Agent Architecture

#### 1. Standalone Agent Process (`agents/buyer-agent.ts`)
Independent TypeScript processes that use the existing infrastructure:

```typescript
import { createTempoWalletClient } from "../eth_tempo_experiments/server/tempo-client.js";
import { Actions } from "viem/tempo";

export class BuyerAgent {
  private walletClient: any;
  private state: AgentState;

  constructor(privateKey: string) {
    // Use existing wallet client creation
    this.walletClient = createTempoWalletClient(/* account */);
  }

  async executePurchase(amount: string, recipient: string) {
    // Reuse existing send.ts logic
    return Actions.token.transferSync(this.walletClient, {
      // ... payment parameters
    });
  }
}
```

#### 2. ACP Client (`agents/acp-client.ts`)
HTTP client for merchant communication:

```typescript
export class ACPClient {
  private baseURL: string;

  async discoverMerchants(): Promise<MerchantRegistry> {
    // Fetch zoo_map.json from server
  }

  async getCatalog(merchantEndpoint: string): Promise<Product[]> {
    // GET /api/merchant/{type}/catalog
  }

  async createCheckoutSession(params: CheckoutParams): Promise<CheckoutSession> {
    // POST /api/merchant/{type}/checkout/create
  }

  async completeCheckout(sessionId: string, txHash: string): Promise<boolean> {
    // POST /api/merchant/{type}/checkout/complete
  }
}
```

### Data Flow Architecture

#### 1. Agent Purchase Flow
```
Agent Need Assessment
↓
Registry Discovery (GET /api/zoo/registry)
↓
Catalog Query (GET /api/merchant/food/catalog)
↓
Checkout Session Creation (POST /api/merchant/food/checkout/create)
↓
Transaction Signing (using existing tempo-client.ts)
↓
Transaction Broadcast (using existing Actions.token.transferSync)
↓
Payment Verification (POST /api/merchant/food/checkout/complete)
↓
Agent State Update
```

#### 2. Merchant Verification Flow
```
Checkout Session Request
↓
Session Creation & Storage
↓
Wait for Transaction Hash
↓
Blockchain Verification (using existing publicClient)
↓
Session Completion & Cleanup
```

### Configuration Management

#### 1. Environment Integration
Extend existing config system in `server/config.ts`:

```typescript
export const config = {
  // ... existing config
  zoo: {
    enabled: process.env.ZOO_SIMULATION_ENABLED === 'true',
    agentPollingInterval: parseInt(process.env.AGENT_POLLING_INTERVAL || '10000'),
    needDecayRate: parseInt(process.env.NEED_DECAY_RATE || '2'),
    purchaseThreshold: parseInt(process.env.PURCHASE_THRESHOLD || '30'),
    minBalanceThreshold: parseFloat(process.env.MIN_BALANCE_THRESHOLD || '10.0'),
  },
  wallets: {
    zooMaster: process.env.ZOO_MASTER_PRIVATE_KEY,
    merchantA: process.env.MERCHANT_A_PRIVATE_KEY,
    attendee1: process.env.ATTENDEE_1_PRIVATE_KEY,
    attendee2: process.env.ATTENDEE_2_PRIVATE_KEY,
    attendee3: process.env.ATTENDEE_3_PRIVATE_KEY,
  }
} as const;
```

#### 2. Registry Management
Static file serving with dynamic address population:

```typescript
// In server/routes/zoo.ts
app.get("/registry", async (c) => {
  const registry = await loadZooRegistry();
  // Replace placeholder addresses with actual wallet addresses
  registry.zoo_info.facilitator_address = accountStore.get("zoo_master")?.address;
  registry.merchants[0].wallet_address = accountStore.get("merchant_a")?.address;
  return c.json(registry);
});
```

### Logging Integration

#### 1. Extend Existing Logging System
Use the existing `instrumented-client.ts` system:

```typescript
import { emitLog } from "../eth_tempo_experiments/server/instrumented-client.js";

export function logAgentAction(agent: string, action: string, data: any) {
  emitLog({
    action: `zoo_agent_${action}`,
    type: "info",
    label: `Agent ${agent}: ${action}`,
    data
  });
}

export function logMerchantTransaction(merchant: string, txHash: string, amount: string) {
  emitLog({
    action: "zoo_merchant_sale",
    type: "tx_confirmed",
    label: `Merchant ${merchant}: Sale completed`,
    data: { txHash, amount }
  });
}
```

#### 2. WebSocket Integration
Extend existing WebSocket system for real-time updates:

```typescript
// Agent events broadcast to existing WebSocket clients
export function broadcastAgentEvent(event: AgentEvent) {
  emitLog({
    action: "zoo_agent_event",
    type: "info",
    label: event.description,
    data: event
  });
}
```

### Database/Storage Strategy

#### 1. Session Storage
For development: In-memory storage with Map/Set
For production: Consider Railway's Redis add-on or PostgreSQL

```typescript
// Simple in-memory implementation
export class InMemorySessionStore {
  private sessions = new Map<string, CheckoutSession>();

  create(session: CheckoutSession): void {
    this.sessions.set(session.session_id, session);
  }

  get(sessionId: string): CheckoutSession | undefined {
    return this.sessions.get(sessionId);
  }

  complete(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = 'completed';
    }
  }
}
```

#### 2. Agent State Persistence
File-based storage for agent state:

```typescript
export class AgentStateManager {
  private statePath: string;

  async saveState(agentId: string, state: AgentState): Promise<void> {
    const filePath = path.join(this.statePath, `${agentId}.json`);
    await fs.writeFile(filePath, JSON.stringify(state, null, 2));
  }

  async loadState(agentId: string): Promise<AgentState | null> {
    // Load from file or return default state
  }
}
```

### Railway Deployment Strategy

#### 1. Service Architecture Options

**Option A: Monolithic (Recommended for MVP)**
- Single Railway service running both server and agents
- Use background processes for agents
- Simpler deployment and management

**Option B: Microservices (Future Expansion)**
- Separate Railway service for agents
- Better scaling and isolation
- More complex but more robust

#### 2. Environment Management
All configuration through Railway environment variables:

```bash
# Existing eth_tempo_experiments variables
RPC_URL=https://rpc.moderato.tempo.xyz
EXPLORER_URL=https://explore.moderato.tempo.xyz
PORT=4000

# New zoo-specific variables
ZOO_SIMULATION_ENABLED=true
ZOO_MASTER_PRIVATE_KEY=0x...
MERCHANT_A_PRIVATE_KEY=0x...
ATTENDEE_1_PRIVATE_KEY=0x...
# ... etc
```

### Performance Considerations

#### 1. Rate Limiting
- Respect Tempo testnet limits (avoid spamming)
- Implement exponential backoff for failed requests
- Queue agent actions to prevent thundering herd

#### 2. Memory Management
- Cleanup expired sessions periodically
- Limit agent state history retention
- Monitor WebSocket connection limits

#### 3. Error Handling
- Graceful degradation when blockchain is unavailable
- Agent retry logic with circuit breakers
- Comprehensive logging for debugging

### Development Workflow

#### 1. Local Development
```bash
# Start existing server with zoo extensions
cd eth_tempo_experiments
npm run dev:server

# In another terminal, start agents
cd ..
npm run dev:agents
```

#### 2. Testing Strategy
- Unit tests for individual components
- Integration tests for ACP flows
- End-to-end tests on Tempo testnet
- Load testing with multiple agents

#### 3. Monitoring
- Use existing health check infrastructure
- Add zoo-specific metrics endpoints
- Monitor agent performance and success rates

This architecture leverages the proven foundation of eth_tempo_experiments while adding the minimum necessary components for the zoo simulation, ensuring reliability and maintainability.