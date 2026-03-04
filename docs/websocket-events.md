# WebSocket Event Types

All real-time events are broadcast via the WebSocket connection at `ws://localhost:4000/ws`. Events are JSON-encoded `WsMessage` objects defined in `shared/types.ts`.

## Agent Event Types (`AgentEventType`)

Defined in `agents/types.ts`. These are emitted by `BuyerAgent`, `MerchantAgent`, and `AgentRunner`, then wired to WebSocket broadcasts in `server/routes/zoo-agents.ts`.

| Event Type | Source | Description |
|---|---|---|
| `agent_started` | BuyerAgent, MerchantAgent | Agent has initialized and started its cycle loop |
| `agent_stopped` | BuyerAgent, MerchantAgent | Agent has stopped (manual or depletion) |
| `simulation_started` | AgentRunner | All agents started, simulation is live |
| `simulation_stopped` | AgentRunner | All agents stopped |
| `simulation_depleted` | AgentRunner | All buyer agents below balance threshold, auto-stopping |
| `needs_updated` | BuyerAgent | Agent needs degraded for this cycle |
| `purchase_initiated` | BuyerAgent | Agent starting a purchase (decision made) |
| `purchase_completed` | BuyerAgent | Purchase fully completed (paid + verified) |
| `purchase_failed` | BuyerAgent | Purchase attempt failed |
| `funding_received` | AgentRunner | Agent received funding |
| `funding_completed` | AgentRunner | All funding complete |
| `funding_failed` | AgentRunner | Funding attempt failed |
| `funding_progress` | AgentRunner | Funding step progress update |
| `error_occurred` | BuyerAgent, MerchantAgent | Error during agent cycle |
| `merchant_cycle_completed` | MerchantAgent | Merchant completed a polling cycle |
| `restock_initiated` | MerchantAgent | Merchant starting a restock operation |
| `restock_completed` | MerchantAgent | Restock paid and inventory updated |
| `restock_failed` | MerchantAgent | Restock attempt failed |
| `sale_recorded` | MerchantAgent | Merchant recorded a sale |
| `llm_decision` | BuyerAgent | LLM buyer brain made a decision |
| `tx_flow` | BuyerAgent | Transaction lifecycle stage update |

## WebSocket Message Types (`WsMessage`)

Defined in `shared/types.ts`. These are the actual messages sent over the WebSocket.

| `type` field | Payload | When it fires |
|---|---|---|
| `zoo_agents` | `{ agents: ZooAgentState[] }` | Every needs_updated and purchase_completed — broadcasts all agent states |
| `zoo_purchase` | `{ receipt: ZooPurchaseReceipt }` | On purchase_completed — includes product, tx_hash, block_number, fees |
| `zoo_network_stats` | `{ stats: NetworkStats }` | Every 5s while simulation runs — chain ID, block number, RPC latency |
| `zoo_tx_flow` | `{ event: TransactionFlowEvent }` | At each purchase stage: decision → checkout_created → signing → block_inclusion → merchant_verified → confirmed |
| `zoo_balance_update` | `{ update: BalanceUpdate }` | After purchase — agent's new balance |
| `zoo_merchant_state` | `{ merchant: ZooMerchantState }` | On merchant_cycle_completed — inventory, revenue, profit |
| `zoo_restock_event` | `{ event: ZooRestockEvent }` | On restock_completed — SKU, quantity, cost, tx_hash |
| `zoo_simulation_complete` | `{ data: unknown }` | On simulation_depleted — all buyers out of funds |
| `zoo_funding_progress` | `{ step: string, detail?: string }` | During wallet initialization — progress updates |
| `zoo_llm_decision` | `{ decision: ZooLLMDecision }` | On llm_decision — reasoning, action, token usage |
| `log` | `{ entry: LogEntry }` | General log entries for the activity feed |
| `accounts` | `{ accounts: AccountsState }` | After balance refreshes — all account balances |

## Transaction Flow Stages (`TxFlowStage`)

Defined in `shared/types.ts`. Emitted as `zoo_tx_flow` events during a purchase.

| Stage | Description |
|---|---|
| `decision` | Agent decided to make a purchase |
| `checkout_created` | Checkout session created with merchant |
| `signing` | Transaction being signed |
| `broadcast` | Transaction broadcast to network |
| `block_inclusion` | Transaction included in a block |
| `confirmed` | Transaction confirmed |
| `merchant_verified` | Merchant verified the payment |

## Key Payload Types

### `ZooPurchaseReceipt`
```typescript
{
  agent_id: string;
  agent_address?: string;
  product_name: string;
  sku: string;
  amount: string;
  merchant_name: string;
  merchant_address: string;
  tx_hash: string;
  block_number: string;
  gas_used: string;
  fee_ausd?: string;
  fee_payer?: string;
  need_before: number;
  need_after: number;
  timestamp: number;
}
```

### `ZooLLMDecision`
```typescript
{
  agent_id: string;
  toolName: string;           // 'acp_select_and_purchase' | 'acp_skip_cycle' | 'fallback'
  reasoning: string;
  action: { type: 'purchase' | 'wait'; sku?: string; reason: string };
  context_summary: { food_need: number; balance: string; catalog_size: number; recent_purchases: number };
  model?: string;
  tokenUsage?: { promptTokens: number; completionTokens: number };
  timestamp: number;
}
```

## Wiring

Event wiring happens in `server/routes/zoo-agents.ts`:
- `AgentRunner` events → `broadcast()` via `server/instrumented-client.ts`
- Each `AgentEventType` is subscribed to in `subscribeToAgentEvents()` and `subscribeMerchantEvents()`
- The `broadcast()` function sends to all connected WebSocket clients
