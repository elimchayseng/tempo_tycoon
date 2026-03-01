# Integration Strategy

## Overview

This document provides detailed guidance on how the Zoo Tycoon ACP simulation integrates its components, ensuring maximum reuse of proven infrastructure.

## Existing Infrastructure Analysis

### Core Components We Can Leverage

#### 1. Server Framework (`server/index.ts`)
- **Hono-based application**: Modern, fast web framework
- **WebSocket support**: Real-time communication infrastructure
- **CORS configuration**: Cross-origin request handling
- **Health check endpoints**: Railway deployment readiness
- **Request logging middleware**: Configurable request tracking

**Integration Approach**: Extend the existing app with new route handlers.

#### 2. Account Management (`server/accounts.ts`)
- **AccountStore class**: Multi-wallet management system
- **Private key handling**: Secure wallet creation and storage
- **Balance tracking**: Automatic balance updates after transactions
- **Public account data**: Safe account information exposure

**Integration Approach**: Add zoo-specific wallets to the existing account store.

#### 3. Tempo Client (`server/tempo-client.ts`)
- **Pre-configured client**: Ready-to-use Tempo testnet connection
- **Contract abstractions**: AlphaUSD and other TIP-20 tokens
- **Wallet client creation**: Transaction signing utilities
- **Chain configuration**: Network settings and contract addresses

**Integration Approach**: Reuse all client utilities for agent transactions.

#### 4. Transaction Actions (`server/actions/`)
- **Send action**: Complete payment flow with logging
- **Balance queries**: Account balance management
- **Batch operations**: Multiple payment processing
- **Error handling**: Robust transaction error management

**Integration Approach**: Wrap existing actions for agent use.

#### 5. Validation System (`shared/validation.ts`)
- **Type-safe validation**: Request parameter validation
- **Error formatting**: Consistent error response structure
- **Schema definitions**: Reusable validation schemas

**Integration Approach**: Create zoo-specific validation schemas.

## Integration Implementation

### Phase 1: Server Extension

#### 1.1 Route Integration
Extend the main server with zoo routes:

```typescript
// In server/index.ts

// Add imports
import { zooRoutes } from "./routes/zoo.js";
import { merchantRoutes } from "./routes/merchant.js";

// Add route handlers after existing routes (line ~223)
app.route("/api/zoo", zooRoutes);
app.route("/api/merchant", merchantRoutes);

console.log(`[tempo-explorer] Zoo simulation routes enabled`);
```

#### 1.2 Configuration Extension
Extend the existing config system:

```typescript
// In server/config.ts

export const config = {
  // ... existing config properties

  // Add zoo-specific configuration
  zoo: {
    enabled: process.env.ZOO_SIMULATION_ENABLED !== 'false',
    agentPollingInterval: parseInt(process.env.AGENT_POLLING_INTERVAL || '10000'),
    needDecayRate: parseInt(process.env.NEED_DECAY_RATE || '2'),
    purchaseThreshold: parseInt(process.env.PURCHASE_THRESHOLD || '30'),
    minBalanceThreshold: parseFloat(process.env.MIN_BALANCE_THRESHOLD || '10.0'),
    sessionTimeoutMinutes: parseInt(process.env.SESSION_TIMEOUT_MINUTES || '5'),
  },

  // Add wallet configuration
  zooWallets: {
    zooMaster: process.env.ZOO_MASTER_PRIVATE_KEY,
    merchantA: process.env.MERCHANT_A_PRIVATE_KEY,
    attendee1: process.env.ATTENDEE_1_PRIVATE_KEY,
    attendee2: process.env.ATTENDEE_2_PRIVATE_KEY,
    attendee3: process.env.ATTENDEE_3_PRIVATE_KEY,
  }
} as const;

// Extend validation function
export function validateConfig(): void {
  // ... existing validation

  // Add zoo-specific validation
  if (config.zoo.enabled) {
    if (!config.zooWallets.zooMaster) {
      console.warn('[zoo] ZOO_MASTER_PRIVATE_KEY not set - zoo simulation disabled');
    }
    if (config.zoo.agentPollingInterval < 1000) {
      throw new Error('AGENT_POLLING_INTERVAL must be at least 1000ms');
    }
  }
}
```

### Phase 2: Account Integration

#### 2.1 Zoo Account Initialization
Create zoo-specific account management:

```typescript
// New file: server/zoo-accounts.ts

import { accountStore } from "./accounts.js";
import { config } from "./config.js";
import { privateKeyToAccount } from "viem/accounts";

// Zoo wallet identifiers
export const ZOO_WALLETS = {
  ZOO_MASTER: "zoo_master",
  MERCHANT_A: "merchant_a",
  ATTENDEE_1: "attendee_1",
  ATTENDEE_2: "attendee_2",
  ATTENDEE_3: "attendee_3",
} as const;

export function initializeZooAccounts(): void {
  if (!config.zoo.enabled) {
    console.log('[zoo] Zoo simulation disabled - skipping account initialization');
    return;
  }

  const wallets = [
    { key: ZOO_WALLETS.ZOO_MASTER, privateKey: config.zooWallets.zooMaster },
    { key: ZOO_WALLETS.MERCHANT_A, privateKey: config.zooWallets.merchantA },
    { key: ZOO_WALLETS.ATTENDEE_1, privateKey: config.zooWallets.attendee1 },
    { key: ZOO_WALLETS.ATTENDEE_2, privateKey: config.zooWallets.attendee2 },
    { key: ZOO_WALLETS.ATTENDEE_3, privateKey: config.zooWallets.attendee3 },
  ];

  for (const wallet of wallets) {
    if (wallet.privateKey) {
      try {
        const account = privateKeyToAccount(wallet.privateKey as `0x${string}`);
        accountStore.add(wallet.key, account);
        console.log(`[zoo] Added wallet: ${wallet.key} (${account.address})`);
      } catch (error) {
        console.error(`[zoo] Failed to add wallet ${wallet.key}:`, error);
      }
    } else {
      console.warn(`[zoo] Private key not set for ${wallet.key}`);
    }
  }

  console.log(`[zoo] Initialized ${accountStore.count()} total accounts`);
}

// Initialize zoo accounts when module is imported
if (config.zoo.enabled) {
  initializeZooAccounts();
}
```

#### 2.2 Server Integration
Add zoo account initialization to the main server:

```typescript
// In server/index.ts

// Add import after existing imports
import "./zoo-accounts.js"; // This will auto-initialize zoo accounts

// The zoo accounts are now available in the global accountStore
```

### Phase 3: Route Implementation

#### 3.1 Zoo Registry Route
```typescript
// New file: server/routes/zoo.ts

import { Hono } from "hono";
import { accountStore } from "../accounts.js";
import { ZOO_WALLETS } from "../zoo-accounts.js";
import fs from "fs/promises";
import path from "path";

const zoo = new Hono();

// Registry endpoint
zoo.get("/registry", async (c) => {
  try {
    // Load zoo_map.json template
    const registryPath = path.join(process.cwd(), "../config/zoo_map.json");
    const registryTemplate = await fs.readFile(registryPath, "utf-8");
    const registry = JSON.parse(registryTemplate);

    // Replace placeholder addresses with actual wallet addresses
    const zooMaster = accountStore.get(ZOO_WALLETS.ZOO_MASTER);
    const merchantA = accountStore.get(ZOO_WALLETS.MERCHANT_A);

    if (zooMaster) {
      registry.zoo_info.facilitator_address = zooMaster.address;
    }

    if (merchantA && registry.merchants[0]) {
      registry.merchants[0].wallet_address = merchantA.address;
    }

    registry.zoo_info.updated_at = new Date().toISOString();

    return c.json(registry);
  } catch (error) {
    console.error("[zoo] Failed to load registry:", error);
    return c.json({ error: "Registry temporarily unavailable" }, 503);
  }
});

// Status endpoint
zoo.get("/status", (c) => {
  const agents = [
    ZOO_WALLETS.ATTENDEE_1,
    ZOO_WALLETS.ATTENDEE_2,
    ZOO_WALLETS.ATTENDEE_3,
  ].map(agentId => {
    const account = accountStore.get(agentId);
    return {
      id: agentId,
      status: account ? "active" : "inactive",
      address: account?.address,
      // Additional agent state would be added here
    };
  });

  return c.json({
    simulation: {
      status: "running",
      active_agents: agents.filter(a => a.status === "active").length,
    },
    agents,
  });
});

export { zoo as zooRoutes };
```

#### 3.2 Merchant Route Implementation
```typescript
// New file: server/routes/merchant.ts

import { Hono } from "hono";
import { v4 as uuidv4 } from "uuid";
import { accountStore } from "../accounts.js";
import { ZOO_WALLETS } from "../zoo-accounts.js";
import { publicClient } from "../tempo-client.js";

const merchant = new Hono();

// Session storage (in-memory for MVP)
const sessions = new Map<string, CheckoutSession>();

interface CheckoutSession {
  session_id: string;
  merchant_id: string;
  buyer_address: string;
  product_sku: string;
  quantity: number;
  total_amount: string;
  recipient_address: string;
  memo: string;
  created_at: Date;
  expires_at: Date;
  status: 'pending' | 'completed' | 'expired';
}

// Catalog endpoint
merchant.get("/food/catalog", async (c) => {
  // Load menu from zoo_map.json
  const menu = [
    { sku: "hotdog", name: "Hot Dog", price: "3.50", available: true },
    { sku: "nachos", name: "Nachos", price: "4.00", available: true },
    { sku: "soda", name: "Soda", price: "2.50", available: true },
  ];

  return c.json({
    merchant_id: "food_stand_01",
    products: menu,
    updated_at: new Date().toISOString(),
  });
});

// Checkout creation
merchant.post("/food/checkout/create", async (c) => {
  try {
    const body = await c.req.json();
    const { sku, quantity, buyer_address } = body;

    // Validate request
    if (!sku || !quantity || !buyer_address) {
      return c.json({ error: "Missing required fields" }, 400);
    }

    // Get merchant wallet
    const merchantAccount = accountStore.get(ZOO_WALLETS.MERCHANT_A);
    if (!merchantAccount) {
      return c.json({ error: "Merchant unavailable" }, 503);
    }

    // Create session
    const session: CheckoutSession = {
      session_id: uuidv4(),
      merchant_id: "food_stand_01",
      buyer_address,
      product_sku: sku,
      quantity,
      total_amount: "3.50", // Would be calculated from catalog
      recipient_address: merchantAccount.address,
      memo: `Zoo Purchase: ${sku} x${quantity}`,
      created_at: new Date(),
      expires_at: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
      status: 'pending',
    };

    sessions.set(session.session_id, session);

    return c.json({
      session_id: session.session_id,
      total_amount: session.total_amount,
      recipient_address: session.recipient_address,
      memo: session.memo,
      expires_at: session.expires_at.toISOString(),
    }, 201);

  } catch (error) {
    console.error("[merchant] Checkout create error:", error);
    return c.json({ error: "Internal error" }, 500);
  }
});

// Checkout completion
merchant.post("/food/checkout/complete", async (c) => {
  try {
    const body = await c.req.json();
    const { session_id, tx_hash } = body;

    const session = sessions.get(session_id);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    if (session.expires_at < new Date()) {
      return c.json({ error: "Session expired" }, 409);
    }

    // Verify transaction using existing tempo-client
    const receipt = await publicClient.getTransactionReceipt({ hash: tx_hash });

    // Verification logic would go here
    // For MVP, we'll assume verification passes

    session.status = 'completed';

    return c.json({
      success: true,
      verified: true,
      purchase_id: uuidv4(),
      session_id: session.session_id,
      tx_hash,
      purchase_time: new Date().toISOString(),
    });

  } catch (error) {
    console.error("[merchant] Checkout complete error:", error);
    return c.json({ error: "Verification failed" }, 409);
  }
});

export { merchant as merchantRoutes };
```

### Phase 4: Agent Integration

#### 4.1 Agent Transaction Wrapper
```typescript
// New file: agents/transaction-wrapper.ts

import { sendAction } from "../server/actions/send.js";
import { accountStore } from "../server/accounts.js";

export class AgentTransactionManager {
  constructor(private agentWalletId: string) {}

  async sendPayment(recipientWalletId: string, amount: string, memo: string): Promise<string> {
    try {
      // Use the existing sendAction logic
      await sendAction({
        from: this.agentWalletId,
        to: recipientWalletId,
        amount,
        memo,
      });

      // The sendAction doesn't return the tx hash, so we'd need to modify it
      // For now, return a placeholder
      return "0x" + "0".repeat(64); // Placeholder

    } catch (error) {
      console.error(`[agent] Payment failed:`, error);
      throw error;
    }
  }

  async getBalance(): Promise<string> {
    const account = accountStore.get(this.agentWalletId);
    if (!account) {
      throw new Error(`Agent wallet ${this.agentWalletId} not found`);
    }

    // Get balance using existing infrastructure
    return account.alphaUsdBalance?.toString() || "0";
  }
}
```

### Phase 5: Development Workflow

#### 5.1 Development Setup
```bash
# Install dependencies
npm install

# Start development servers
npm run dev  # This will start server + web dashboard
```

#### 5.2 Build Process
```bash
# Build the web frontend
npm run build

# Check TypeScript across the entire project
npm run check
```

### Phase 6: Testing Integration

#### 6.1 Health Check Verification
```bash
# Test existing health endpoints still work
curl http://localhost:4000/api/health
curl http://localhost:4000/api/accounts

# Test new zoo endpoints
curl http://localhost:4000/api/zoo/registry
curl http://localhost:4000/api/zoo/status
curl http://localhost:4000/api/merchant/food/catalog
```

#### 6.2 WebSocket Integration
The existing WebSocket infrastructure will automatically broadcast zoo events through the existing `emitLog` system.

## Migration Checklist

### Pre-Integration
- [ ] Backup existing repository
- [ ] Ensure all existing functionality still works
- [ ] Set up environment variables for zoo wallets

### Integration Steps
- [ ] Add zoo configuration to `config.ts`
- [ ] Create `zoo-accounts.ts` account management
- [ ] Implement `routes/zoo.ts` registry endpoints
- [ ] Implement `routes/merchant.ts` ACP endpoints
- [ ] Add route handlers to main `index.ts`
- [ ] Test all health check endpoints

### Post-Integration Testing
- [ ] Verify existing wallet functionality unchanged
- [ ] Test zoo registry returns correct wallet addresses
- [ ] Test merchant catalog and checkout endpoints
- [ ] Verify WebSocket events still work
- [ ] Test Railway deployment with new configuration

### Rollback Plan
If integration fails:
1. Revert to git commit before integration
2. Remove zoo-specific environment variables
3. Test that original functionality is restored

This integration strategy ensures a smooth, low-risk extension of the existing infrastructure while maintaining all current functionality.