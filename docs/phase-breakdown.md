# Implementation Phase Breakdown

## Detailed Task Breakdown for Zoo Tycoon ACP Simulation

This document provides a granular breakdown of tasks for each implementation phase, with clear deliverables and success criteria.

## Phase 1: ACP Infrastructure (1-2 weeks)

### Goal
Establish the foundational ACP server endpoints and merchant functionality by extending the existing `eth_tempo_experiments` server.

### Week 1: Server Extensions

#### 1.1 Configuration Integration (2 days)
**Tasks:**
- [ ] Extend `server/config.ts` with zoo-specific configuration
- [ ] Add environment variable validation for zoo wallets
- [ ] Create configuration schema for simulation parameters
- [ ] Add zoo feature toggle for conditional enabling

**Files Modified:**
- `eth_tempo_experiments/server/config.ts`

**Deliverables:**
- Zoo configuration properly integrated with existing system
- Environment validation prevents startup with invalid config
- Feature toggle allows disabling zoo simulation

**Acceptance Criteria:**
- Server starts successfully with zoo config enabled/disabled
- Invalid wallet private keys cause clear error messages
- All existing functionality remains unaffected

#### 1.2 Account Management Integration (1 day)
**Tasks:**
- [ ] Create `server/zoo-accounts.ts` with wallet initialization
- [ ] Integrate with existing `accountStore` system
- [ ] Add zoo wallet constants and management functions
- [ ] Ensure accounts are properly funded and accessible

**Files Created:**
- `eth_tempo_experiments/server/zoo-accounts.ts`

**Files Modified:**
- `eth_tempo_experiments/server/index.ts` (import zoo accounts)

**Deliverables:**
- 5 zoo wallets (ZooMaster, MerchantA, Attendee1-3) properly initialized
- All wallets accessible through existing account management system
- Balance tracking works for zoo wallets

**Acceptance Criteria:**
- `curl /api/accounts` shows zoo wallets alongside existing wallets
- Account balances display correctly
- Wallet addresses are valid Ethereum addresses

#### 1.3 Zoo Registry Implementation (2 days)
**Tasks:**
- [ ] Create `server/routes/zoo.ts` with registry endpoint
- [ ] Implement dynamic address replacement in `zoo_map.json`
- [ ] Add registry validation and error handling
- [ ] Create zoo status endpoint for monitoring

**Files Created:**
- `eth_tempo_experiments/server/routes/zoo.ts`

**Files Modified:**
- `eth_tempo_experiments/server/index.ts` (add zoo routes)

**Deliverables:**
- `GET /api/zoo/registry` returns complete merchant registry
- Placeholder addresses replaced with actual wallet addresses
- Status endpoint shows current simulation state

**Acceptance Criteria:**
- Registry endpoint returns valid JSON with real wallet addresses
- Facilitator address matches ZooMaster wallet
- Merchant wallet addresses match MerchantA wallet
- Status endpoint shows all agent states

### Week 2: Merchant ACP Endpoints

#### 1.4 Merchant Route Implementation (3 days)
**Tasks:**
- [ ] Create `server/routes/merchant.ts` with ACP endpoints
- [ ] Implement catalog endpoint with menu from `zoo_map.json`
- [ ] Create checkout session management system
- [ ] Add session storage (in-memory for MVP)

**Files Created:**
- `eth_tempo_experiments/server/routes/merchant.ts`
- `eth_tempo_experiments/server/middleware/session-verifier.ts`

**Deliverables:**
- `GET /api/merchant/food/catalog` returns product catalog
- `POST /api/merchant/food/checkout/create` creates purchase sessions
- Session management with expiration and validation

**Acceptance Criteria:**
- Catalog returns valid product list with prices
- Session creation returns session ID and payment details
- Sessions expire after 5 minutes
- Invalid requests return proper error responses

#### 1.5 Transaction Verification (2 days)
**Tasks:**
- [ ] Implement `POST /api/merchant/food/checkout/complete` endpoint
- [ ] Add blockchain transaction verification using existing `tempo-client.ts`
- [ ] Create comprehensive error handling for verification failures
- [ ] Add transaction logging integration

**Files Modified:**
- `eth_tempo_experiments/server/routes/merchant.ts`

**Deliverables:**
- Transaction verification using Tempo blockchain
- Session completion with verification results
- Integration with existing logging system

**Acceptance Criteria:**
- Valid transactions are verified and sessions completed
- Invalid transactions are rejected with clear error messages
- All transactions are logged using existing infrastructure
- Session state is properly updated after verification

### Phase 1 Success Metrics
- [ ] All health check endpoints return success
- [ ] Registry endpoint returns valid merchant data
- [ ] Manual checkout flow completes successfully via API testing
- [ ] Existing eth_tempo_experiments functionality unchanged
- [ ] Zoo routes integrated without conflicts

### Testing Checklist for Phase 1
```bash
# Test existing functionality
curl http://localhost:4000/api/health
curl http://localhost:4000/api/accounts

# Test zoo registry
curl http://localhost:4000/api/zoo/registry
curl http://localhost:4000/api/zoo/status

# Test merchant endpoints
curl http://localhost:4000/api/merchant/food/catalog

# Test checkout flow
curl -X POST http://localhost:4000/api/merchant/food/checkout/create \
  -H "Content-Type: application/json" \
  -d '{"sku":"hotdog","quantity":1,"buyer_address":"0x742d35Cc..."}'
```

---

## Phase 2: Autonomous Agent Development (1-2 weeks)

### Goal
Create autonomous buyer agents with need-based decision logic that can discover merchants and initiate purchases.

### Week 1: Agent Core Logic

#### 2.1 Agent State Management (2 days)
**Tasks:**
- [ ] Design `AgentState` interface with needs, balance, history
- [ ] Create `agents/agent-state.ts` with state persistence
- [ ] Implement need decay logic with configurable rates
- [ ] Add purchase history tracking

**Files Created:**
- `agents/agent-state.ts`
- `shared/types.ts` (agent types)

**Deliverables:**
- Agent state management with file-based persistence
- Need decay system (food_need, fun_need decrease over time)
- Purchase history tracking with timestamps

**Acceptance Criteria:**
- Agent state persists between restarts
- Need levels decay according to configuration
- Purchase history is maintained and accessible

#### 2.2 Decision Engine Implementation (3 days)
**Tasks:**
- [ ] Create `agents/decision-engine.ts` with purchase logic
- [ ] Implement threshold-based purchase triggers
- [ ] Add randomization for realistic behavior
- [ ] Create budget management and affordability checks

**Files Created:**
- `agents/decision-engine.ts`

**Deliverables:**
- Decision engine that triggers purchases when needs are low
- Randomized behavior to prevent predictable patterns
- Budget-aware purchasing decisions

**Acceptance Criteria:**
- Agents purchase when food_need < 30 (configurable)
- Purchase decisions include random variation
- Agents don't purchase when balance is insufficient
- Decision rationale is logged for debugging

### Week 2: Communication and Integration

#### 2.3 ACP Client Implementation (3 days)
**Tasks:**
- [ ] Create `agents/acp-client.ts` for HTTP communication
- [ ] Implement registry discovery and merchant finding
- [ ] Add catalog fetching and product selection logic
- [ ] Create checkout session management

**Files Created:**
- `agents/acp-client.ts`

**Deliverables:**
- HTTP client for communicating with merchant endpoints
- Registry discovery that parses `zoo_map.json`
- Product selection based on agent needs

**Acceptance Criteria:**
- Agent can fetch and parse merchant registry
- Catalog requests return product information
- Product selection matches agent needs (food vs entertainment)
- Session creation returns valid checkout sessions

#### 2.4 Main Agent Loop (2 days)
**Tasks:**
- [ ] Create `agents/buyer-agent.ts` with main simulation loop
- [ ] Integrate state management, decision engine, and ACP client
- [ ] Add comprehensive logging and error handling
- [ ] Create agent process management and graceful shutdown

**Files Created:**
- `agents/buyer-agent.ts`
- `agents/simulation-runner.ts` (manages multiple agents)

**Deliverables:**
- Complete autonomous agent that runs independently
- Multi-agent simulation runner
- Proper error handling and recovery

**Acceptance Criteria:**
- Agent runs continuously with configurable polling interval
- Multiple agents can run simultaneously without conflicts
- Agents log their decisions and actions clearly
- Graceful shutdown preserves agent state

### Phase 2 Success Metrics
- [ ] Agents log need states and decision rationale
- [ ] Successful registry discovery and merchant communication
- [ ] Purchase decision triggers working correctly
- [ ] Multiple agents running simultaneously without issues
- [ ] Agent state persists between restarts

### Testing Checklist for Phase 2
```bash
# Start agent simulation
npm run dev:agents

# Monitor agent logs
tail -f agent-logs/attendee_1.log

# Verify agent state persistence
# Stop agents, restart, verify state is restored

# Test with different configuration values
NEED_DECAY_RATE=5 npm run dev:agents
```

---

## Phase 3: Blockchain Integration (1-2 weeks)

### Goal
Complete end-to-end autonomous purchase cycles with real blockchain transactions on Tempo testnet.

### Week 1: Transaction Integration

#### 3.1 Transaction Manager (2 days)
**Tasks:**
- [ ] Create `agents/transaction-manager.ts` using existing send utilities
- [ ] Integrate with `eth_tempo_experiments/server/actions/send.ts`
- [ ] Add transaction signing and broadcasting for agents
- [ ] Implement transaction result handling

**Files Created:**
- `agents/transaction-manager.ts`

**Files Modified:**
- `eth_tempo_experiments/server/actions/send.ts` (return transaction hash)

**Deliverables:**
- Agent transaction manager that reuses existing infrastructure
- Transaction hash capture for verification
- Error handling for transaction failures

**Acceptance Criteria:**
- Agents can sign and broadcast transactions
- Transaction hashes are captured and returned
- Transaction failures are handled gracefully
- All transactions appear on Tempo blockchain explorer

#### 3.2 Payment Flow Integration (3 days)
**Tasks:**
- [ ] Create `agents/payment-flow.ts` for complete purchase orchestration
- [ ] Integrate session creation, transaction, and completion
- [ ] Add retry logic for failed transactions
- [ ] Implement verification polling and confirmation

**Files Created:**
- `agents/payment-flow.ts`

**Deliverables:**
- Complete autonomous purchase flow from need → payment → confirmation
- Retry mechanisms for network failures
- Transaction confirmation polling

**Acceptance Criteria:**
- Complete purchase cycles execute without manual intervention
- Failed transactions are retried with exponential backoff
- Successful purchases update agent state (increase relevant need)
- All purchases are verified on-chain before completion

### Week 2: Production Readiness

#### 3.3 Error Recovery and Resilience (2 days)
**Tasks:**
- [ ] Implement comprehensive error handling for all failure modes
- [ ] Add circuit breaker patterns for persistent failures
- [ ] Create monitoring and alerting for critical errors
- [ ] Add automatic recovery from common failure scenarios

**Files Modified:**
- All agent files with enhanced error handling

**Deliverables:**
- Robust error recovery mechanisms
- Circuit breakers for blockchain connectivity issues
- Monitoring hooks for operational awareness

**Acceptance Criteria:**
- Agents recover from temporary network failures
- Circuit breakers prevent cascade failures
- Critical errors are logged with appropriate severity
- System continues operating during minor failures

#### 3.4 Performance Optimization (1-2 days)
**Tasks:**
- [ ] Optimize polling intervals and request patterns
- [ ] Add connection pooling and rate limiting
- [ ] Implement caching for static data (registry, catalogs)
- [ ] Add performance metrics collection

**Files Created:**
- `utils/performance-monitor.ts`

**Files Modified:**
- Agent files with performance optimizations

**Deliverables:**
- Optimized network usage and request patterns
- Performance monitoring and metrics
- Efficient resource utilization

**Acceptance Criteria:**
- Network requests are minimized through caching
- Rate limits are respected to avoid blocking
- Performance metrics show efficient operation
- System scales to 3+ simultaneous agents

#### 3.5 Integration Testing (1 day)
**Tasks:**
- [ ] Create comprehensive end-to-end test scenarios
- [ ] Test with multiple agents running simultaneously
- [ ] Verify blockchain transaction accuracy
- [ ] Load testing with sustained operation

**Files Created:**
- `tests/integration-test.ts`
- `scripts/load-test.ts`

**Deliverables:**
- Comprehensive test suite for autonomous operation
- Load testing results and optimization
- Documentation of test scenarios and results

**Acceptance Criteria:**
- All end-to-end test scenarios pass consistently
- System operates reliably under load
- Transaction accuracy verified on blockchain
- Agent behavior matches expected patterns

### Phase 3 Success Metrics
- [ ] Fully autonomous purchase cycles complete successfully
- [ ] Real transactions verified on Tempo testnet blockchain
- [ ] Agent state updates correctly after purchases
- [ ] System operates reliably for extended periods (6+ hours)
- [ ] Error recovery mechanisms function correctly

### Testing Checklist for Phase 3
```bash
# Fund all agent wallets
npm run fund:agents

# Start full simulation
npm run start:agents

# Monitor blockchain transactions
# Visit Tempo explorer and verify agent transactions appear

# Test error scenarios
# - Disconnect network temporarily
# - Stop merchant server
# - Invalid transaction amounts

# Load testing
# - Run multiple agent instances
# - Monitor for 6+ hours continuous operation
```

---

## Phase 4: Monitoring & Analytics (0.5-1 weeks)

### Goal
Create simple monitoring dashboard and analytics to visualize the autonomous simulation.

### Week 1: Dashboard Implementation

#### 4.1 Status API Enhancement (1-2 days)
**Tasks:**
- [ ] Enhance `GET /api/zoo/status` with detailed agent information
- [ ] Create `GET /api/zoo/transactions` endpoint for transaction history
- [ ] Add simulation metrics (uptime, transaction volume, success rate)
- [ ] Implement Server-Sent Events for real-time updates

**Files Modified:**
- `eth_tempo_experiments/server/routes/zoo.ts`

**Deliverables:**
- Comprehensive status API with agent states
- Transaction history endpoint with filtering
- Real-time update stream via SSE

**Acceptance Criteria:**
- Status API returns current agent states (needs, balance, etc.)
- Transaction history shows recent purchases with blockchain data
- Real-time updates push agent state changes to connected clients

#### 4.2 Simple Web Dashboard (2-3 days)
**Tasks:**
- [ ] Create `web/zoo-dashboard.html` with minimal UI
- [ ] Implement real-time agent status display
- [ ] Add transaction feed with blockchain explorer links
- [ ] Create simple charts for need levels and transaction volume

**Files Created:**
- `eth_tempo_experiments/web/zoo-dashboard.html`
- `eth_tempo_experiments/web/zoo-dashboard.js`
- `eth_tempo_experiments/web/zoo-dashboard.css`

**Files Modified:**
- `eth_tempo_experiments/server/index.ts` (serve static files)

**Deliverables:**
- Simple HTML dashboard accessible at `/zoo-dashboard.html`
- Real-time agent status with need levels and balances
- Transaction feed with links to Tempo explorer

**Acceptance Criteria:**
- Dashboard loads and displays agent information
- Real-time updates show agent state changes
- Transaction links open correct Tempo explorer pages
- Dashboard is responsive and functional on mobile devices

#### 4.3 Analytics and Metrics (1 day)
**Tasks:**
- [ ] Add basic analytics collection for simulation insights
- [ ] Create metrics for agent behavior patterns
- [ ] Implement simple reporting for simulation performance
- [ ] Add data export capabilities

**Files Created:**
- `utils/analytics.ts`

**Files Modified:**
- Agent files with analytics hooks

**Deliverables:**
- Basic analytics collection and reporting
- Simulation insights and behavior pattern analysis
- Data export for further analysis

**Acceptance Criteria:**
- Analytics capture key simulation metrics
- Reports show agent behavior patterns and trends
- Data can be exported for external analysis tools

### Phase 4 Success Metrics
- [ ] Dashboard displays real-time agent status
- [ ] Transaction feed shows accurate blockchain data
- [ ] Analytics provide meaningful simulation insights
- [ ] Dashboard accessible and functional for monitoring

### Testing Checklist for Phase 4
```bash
# Access dashboard
open http://localhost:4000/zoo-dashboard.html

# Verify real-time updates
# - Start agents and watch status updates
# - Complete purchases and see transaction feed

# Test on different devices
# - Desktop browser
# - Mobile browser
# - Different screen sizes
```

---

## Overall Project Success Criteria

### Technical Requirements
- [ ] All 4 phases completed successfully
- [ ] Autonomous agents operate without manual intervention
- [ ] Real blockchain transactions on Tempo testnet
- [ ] Integration with existing eth_tempo_experiments infrastructure
- [ ] Railway deployment successful and stable

### Functional Requirements
- [ ] Agents make realistic purchase decisions based on needs
- [ ] Merchant endpoints comply with ACP specification
- [ ] Transaction verification ensures payment accuracy
- [ ] Dashboard provides clear simulation visibility

### Performance Requirements
- [ ] System operates reliably for 24+ hours continuously
- [ ] 3+ agents running simultaneously without conflicts
- [ ] Transaction success rate >95%
- [ ] Response times <2 seconds for all API endpoints

### Documentation Requirements
- [ ] Complete technical documentation
- [ ] Deployment guides for Railway
- [ ] API documentation for ACP endpoints
- [ ] Integration strategy clearly documented

## Risk Mitigation

### Technical Risks
- **Blockchain Connectivity**: Implement robust retry logic and circuit breakers
- **Transaction Failures**: Add comprehensive error handling and recovery
- **Memory Leaks**: Proper cleanup and resource management
- **Rate Limiting**: Respect Tempo testnet limits with queuing

### Operational Risks
- **Wallet Funding**: Monitoring and alerting for low balances
- **Service Monitoring**: Health checks and automatic restart capabilities
- **Configuration Management**: Validation and safe defaults
- **Security**: Proper private key handling and environment variable management

This phase breakdown provides a comprehensive roadmap for implementing the Zoo Tycoon ACP simulation with clear deliverables, success criteria, and testing procedures for each phase.