# Zoo Tycoon Agentic Commerce Simulation

A comprehensive autonomous simulation implementing the **Agentic Commerce Protocol (ACP)** on the Tempo Moderato Testnet. This project transforms zoo visitors into autonomous agents that make realistic, need-based purchases from merchant endpoints using real blockchain transactions.

## Quick Start

```bash
# Clone and setup
git clone https://github.com/yourusername/tempo-zoo-experiment.git
cd tempo-zoo-experiment

# Install dependencies
npm install

# Configure .env (RPC and simulation params only — no private keys needed)
# A sensible .env is included; adjust RPC_URL if needed

# Start simulation
npm run dev

# Click "Start Zoo" in the browser to begin
```

That's it. Wallets are generated fresh each run — no manual key management required.

## Project Overview

### Architecture
- **Built on Tempo**: Extends existing Tempo testnet infrastructure
- **Autonomous Agents**: 3 buyer agents with internal "needs" systems
- **ACP-Compliant Merchants**: REST API following Agentic Commerce Protocol
- **Real Blockchain**: All transactions occur on Tempo Moderato Testnet
- **Railway Ready**: Production deployment configuration included

### Key Components

1. **Zoo Master** - Protocol facilitator hosting merchant registry
2. **Merchant A** - Food vendor with inventory and pricing
3. **Attendee Agents** - Autonomous buyers with hunger/entertainment needs
4. **ACP Server** - REST endpoints for discovery and transactions
5. **Simple Dashboard** - Real-time monitoring interface

## Wallet Lifecycle

Each simulation run uses **ephemeral wallets** — fresh keys generated at start, no persistence between runs.

### How it works

1. **Generate**: 5 wallets created in-memory (Zoo Master, Merchant, 3 Attendees). Wallet generation is entirely local — a random 32-byte private key is generated and the address is derived via standard EVM key derivation (secp256k1). There is no on-chain "create account" transaction. On EVM chains like Tempo, an address exists implicitly as soon as it's derived — the chain only becomes aware of it once a transaction references it.
2. **Fund Zoo Master**: Automatic faucet request on Tempo Moderato Testnet. This is the first on-chain interaction — the faucet sends AlphaUSD to the freshly derived Zoo Master address.
3. **Distribute via Batch Payment**: Zoo Master distributes to all agents using Tempo's `batchAction()` — a single payer sends to multiple recipients in sequential transfers
   - Merchant A: $100 AlphaUSD
   - Each Attendee: $50 AlphaUSD
   - Total: $250 AlphaUSD
4. **No Refunding**: Agents spend until their balance is depleted
5. **Auto-Stop**: When all 3 buyer agents fall below the minimum balance threshold ($10), the simulation stops automatically
6. **New Simulation**: Click "New Simulation" to reset everything and start fresh. The previous wallets' addresses still exist on-chain with whatever dust balance remains, but the private keys are discarded — those funds are effectively burned.

This gives users a clean, finite economic experiment each time — with clear numbers and a natural endpoint.

## Documentation

- **[docs/testing-and-scripts.md](docs/testing-and-scripts.md)** - **Scripts, testing, and environment guide** (start here for running anything)
- **[SPEC.md](SPEC.md)** - Complete project specification and requirements
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Technical architecture and integration strategy
- **[API_SPEC.md](API_SPEC.md)** - Complete ACP REST API documentation
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Railway deployment guide
- **[docs/integration-strategy.md](docs/integration-strategy.md)** - Integration strategy
- **[docs/phase-breakdown.md](docs/phase-breakdown.md)** - Detailed implementation phases

## Development Phases

### Phase 1: ACP Infrastructure
- Server extension with zoo routes
- Merchant registry and catalog endpoints
- Checkout session management
- Transaction verification

### Phase 2: Autonomous Agents
- Need-based decision engine
- Registry discovery and merchant communication
- Agent state management and persistence

### Phase 3: Blockchain Integration
- End-to-end purchase automation with retry and circuit breakers
- Real transaction signing and broadcasting
- Integration test, load test, and health check scripts
- Transaction queue, request caching, rolling metrics

### Phase 4: Monitoring Dashboard
- Simple HTML dashboard
- Real-time agent status updates
- Transaction feed with blockchain links

## Environment Setup

### Required Environment Variables

```bash
# Blockchain Configuration
RPC_URL=https://rpc.moderato.tempo.xyz
EXPLORER_URL=https://explore.moderato.tempo.xyz
CHAIN_ID=42431

# Simulation Parameters
ZOO_SIMULATION_ENABLED=true
AGENT_POLLING_INTERVAL=10000
NEED_DECAY_RATE=2
PURCHASE_THRESHOLD=30
MIN_BALANCE_THRESHOLD=10.0
```

No private keys needed — wallets are generated automatically each simulation start.

## API Endpoints

### Discovery
- `GET /api/zoo/registry` - Merchant registry for agent discovery
- `GET /api/zoo/status` - Current simulation status

### Merchant (ACP-Compliant)
- `GET /api/merchant/food/catalog` - Available products
- `POST /api/merchant/food/checkout/create` - Create purchase session
- `POST /api/merchant/food/checkout/complete` - Verify payment

### Monitoring
- `GET /api/health` - System health check
- `GET /api/zoo/transactions` - Recent purchase history

## Scripts

```bash
npm run health:check       # Comprehensive system health check
npm run test:integration   # End-to-end single purchase cycle test
npm run test:load          # Multi-agent load test (default: 2 min)
npm run dev                # Start server + web dashboard (concurrently)
npm run dev:server         # Server only (port 4000)
npm run dev:web            # Vite dev server (port 5173, proxies to 4000)
npm run dev:agents         # Autonomous agents only
```

> For detailed usage, prerequisites, and troubleshooting for each script, see **[docs/testing-and-scripts.md](docs/testing-and-scripts.md)**.

## Agent Behavior

### Need System
- **food_need**: 0-100, decreases over time, increased by food purchases
- **fun_need**: 0-100, decreases over time, increased by entertainment purchases

### Decision Logic
- Agents purchase when needs drop below threshold (default: 30)
- Budget-aware decisions prevent overspending
- Randomization creates realistic, varied behavior
- Purchase history prevents spam buying

### Purchase Flow
1. **Need Assessment** -> Agent checks internal state
2. **Discovery** -> Fetch merchant registry
3. **Catalog Query** -> Get current product prices
4. **Session Creation** -> Initialize purchase with merchant
5. **Payment** -> Sign and broadcast Tempo transaction
6. **Verification** -> Merchant verifies on-chain payment
7. **Completion** -> Update agent state and inventory

## Monitoring

### Dashboard
Access the monitoring dashboard at `http://localhost:5173` (dev) or `http://localhost:4000` (production):
- Real-time agent status (needs, balances, next actions)
- Live transaction feed with blockchain explorer links
- Merchant inventory and restock events

## Deployment

### Railway Deployment
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway init
railway up

# Set environment variables in Railway dashboard (RPC_URL, ZOO_SIMULATION_ENABLED, etc.)
```

### Environment Variables in Railway
Set required environment variables in Railway dashboard under "Variables". No private keys needed.

## Network Information

- **Network**: Tempo Moderato Testnet
- **Chain ID**: 42431
- **RPC URL**: https://rpc.moderato.tempo.xyz
- **Explorer**: https://explore.moderato.tempo.xyz
- **Currency**: AlphaUSD (TIP-20 token)
- **Contract**: `0x20c0000000000000000000000000000000000001`

## Testing

> Full details, prerequisites, and troubleshooting: **[docs/testing-and-scripts.md](docs/testing-and-scripts.md)**

```bash
# Health check (no server required)
npm run health:check

# Integration test — single end-to-end purchase cycle
# Requires server running in another terminal:
#   ZOO_SIMULATION_ENABLED=false npm run dev:server
npm run test:integration

# Load test — all agents for N minutes (default 2)
npm run test:load
npm run test:load -- 5    # run for 5 minutes

# Manual API testing
curl http://localhost:4000/api/zoo/registry
curl http://localhost:4000/api/merchant/food/catalog
```

## Troubleshooting

### Common Issues

**"Connection failed"**
```bash
# Verify Tempo RPC connectivity
curl -X POST https://rpc.moderato.tempo.xyz \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'
```

**"Faucet request failed"**
- The faucet may rate-limit if you restart simulations rapidly
- Wait 30-60 seconds between simulation starts
- You can also manually fund via https://faucet.moderato.tempo.xyz

**"Transaction verification failed"**
- Ensure transaction amounts match session requirements
- Verify recipient addresses are correct
- Check transaction appears on Tempo explorer

### Debug Mode
```bash
# Enable detailed logging
LOG_LEVEL=debug npm run dev
```

## Contributing

### Development Setup
1. Follow Quick Start instructions
2. Create feature branch: `git checkout -b feature-name`
3. Make changes and test thoroughly
4. Verify all health checks pass: `npm run health:check`
5. Submit pull request with clear description

### Code Style
- TypeScript for all new code
- Follow existing project patterns
- Comprehensive error handling
- Clear logging for debugging

## License

MIT License - See [LICENSE](LICENSE) for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/tempo-zoo-experiment/issues)
- **Documentation**: See docs/ directory
- **API Reference**: [API_SPEC.md](API_SPEC.md)
