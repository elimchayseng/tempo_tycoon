# Configuration

All configuration is managed through environment variables, loaded in `server/config.ts`.

## Environment Variables

### Server

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4000` | HTTP server port |
| `NODE_ENV` | `development` | Environment (`development` / `production`) |
| `ADMIN_TOKEN` | *(none)* | Bearer token for protected endpoints. **Required in production.** See [Security](./security.md) |

### Blockchain

| Variable | Default | Description |
|----------|---------|-------------|
| `RPC_URL` | `https://rpc.moderato.tempo.xyz` | Tempo RPC endpoint |
| `EXPLORER_URL` | `https://explore.moderato.tempo.xyz` | Block explorer URL |

### Logging

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | Log verbosity: `debug`, `info`, `warn`, `error` |
| `ENABLE_REQUEST_LOGS` | `true` | Enable HTTP request logging middleware |

### Zoo Simulation

| Variable | Default | Description |
|----------|---------|-------------|
| `ZOO_SIMULATION_ENABLED` | `false` | Enable zoo simulation features |
| `AGENT_POLLING_INTERVAL` | `10000` | Agent decision cycle interval (ms). **Note:** The agent-runner currently hardcodes 3000ms for fast testing — this env var is read by `server/config.ts` and available to `decision-engine.ts` via `config.zoo.agentPollingInterval`. |
| `NEED_DECAY_RATE` | `2` | Food need points lost per cycle. **Note:** Agent-runner hardcodes 5 for fast testing. |
| `PURCHASE_THRESHOLD` | `30` | Purchase when food_need drops below this. **Note:** Agent-runner hardcodes 40 for fast testing. |
| `MIN_BALANCE_THRESHOLD` | `10.0` | Minimum balance before depletion auto-stop triggers (AlphaUSD) |
| `SESSION_TIMEOUT_MINUTES` | `5` | Checkout session expiry (minutes) |

No private keys are needed in `.env` — wallets are generated automatically each simulation start.

## `.env` Setup

A sensible `.env` is included in the repository. The minimum required configuration:

```env
PORT=4000
RPC_URL=https://rpc.moderato.tempo.xyz
ZOO_SIMULATION_ENABLED=true
LOG_LEVEL=info
```

## `config/zoo_map.json`

The merchant registry file defines the zoo layout:

- `zoo_info` — zoo name, currency, chain ID, polling interval
- `merchants` — array of merchant definitions with menus and pricing
- `attendees` — agent configuration templates

Wallet addresses in this file are placeholder values that get replaced at runtime by `loadZooRegistry()` using actual wallet addresses from the account store.

## Simulation Defaults

The `DecisionEngine` uses these hardcoded defaults (exported as `SIMULATION_DEFAULTS` from `agents/decision-engine.ts`), falling back from env-var config:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `pollingIntervalMs` | 3000 | Cycle interval (ms) |
| `needDecayRate.food_need` | 5 | Points lost per cycle |
| `purchaseThreshold.food_need` | 40 | Buy when below this |
| `needRecovery.main` | 70 | Points recovered from main dish |
| `needRecovery.snack` | 50 | Points recovered from snack |
| `needRecovery.beverage` | 30 | Points recovered from beverage |
| `needRecovery.dessert` | 60 | Points recovered from dessert |
| `minBalanceThreshold` | 5.0 | Min balance to buy (AlphaUSD) |
| `maxPurchaseFrequencyMs` | 2000 | Min gap between purchases (ms) |
| `randomFactor` | 0.2 | +/-20% randomness on decay |

### Merchant Brain Config

| Parameter | Default | Description |
|-----------|---------|-------------|
| `brain_interval_ms` | 30000 | Merchant LLM decision cycle interval (ms) |

**Note:** With the merchant brain enabled, 3 buyers + 1 merchant share the same inference endpoint and `maxCallsPerSimulation` cap. You may need to increase `maxCallsPerSimulation` from 100 to accommodate longer simulations.
