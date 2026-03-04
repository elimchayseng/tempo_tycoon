// Shared types between server and client

// ---------------------------------------------------------------------------
// Blockchain / AlphaUSD types for the Crypto Dashboard Explorer
// ---------------------------------------------------------------------------

/** Live network stats from the Tempo Moderato Testnet */
export interface NetworkStats {
  chain_id: number;
  chain_name: string;
  latest_block: number;
  gas_price_gwei: string;
  rpc_latency_ms: number;
  zoo_tx_count: number;
  zoo_tx_throughput_per_min: number;
}

/** AlphaUSD token metadata */
export interface TokenInfo {
  name: string;
  symbol: string;
  address: string;
  standard: string;
  decimals: number;
  transfer_with_memo_signature: string;
}

/** Wallet info for the explorer panel */
export interface WalletInfo {
  role: string;
  label: string;
  address: string;
  /** AlphaUSD balance (TIP-20, 6 decimals) — human-readable */
  balance: string;
  /** AlphaUSD balance — raw TIP-20 units */
  balance_raw: string;
  nonce: number;
  explorer_link: string;
}

/** Timestamped balance history entry */
export interface BalanceHistoryEntry {
  timestamp: number;
  /** AlphaUSD balance (TIP-20, 6 decimals) — human-readable */
  balance: string;
  event: 'purchase' | 'funding' | 'initial';
  tx_hash?: string;
}

/** Full transaction details returned by /network/tx/:txHash */
export interface TransactionDetail {
  tx_hash: string;
  block_number: number;
  gas_used: string;
  /** Fee in AUSD (TIP-20, 6 decimals) */
  fee_ausd: string;
  decoded_memo: string;
  confirmations: number;
  from: string;
  to: string;
  amount: string;
  explorer_link: string;
}

/** Transaction flow stages for real-time visualization */
export type TxFlowStage =
  | 'decision'
  | 'checkout_created'
  | 'signing'
  | 'broadcast'
  | 'block_inclusion'
  | 'confirmed'
  | 'merchant_verified';

/** Real-time transaction lifecycle event */
export interface TransactionFlowEvent {
  agent_id: string;
  stage: TxFlowStage;
  timestamp: number;
  data: Record<string, unknown>;
}

/** Balance change event */
export interface BalanceUpdate {
  agent_id: string;
  /** AlphaUSD balance (TIP-20, 6 decimals) */
  balance: string;
  previous: string;
  event: 'purchase' | 'funding';
  tx_hash?: string;
}

// ---------------------------------------------------------------------------
// Core shared types
// ---------------------------------------------------------------------------

export type LogEntryType =
  | "info"
  | "rpc_call"
  | "rpc_result"
  | "tx_built"
  | "tx_submitted"
  | "tx_confirmed"
  | "error"
  | "annotation";

export interface LogEntry {
  id: string;
  timestamp: number;
  action: string;
  type: LogEntryType;
  label: string;
  data: Record<string, unknown>;
  annotations?: readonly string[];
  indent?: number;
}

export interface Account {
  label: string;
  address: string;
  balances: Record<string, string>; // token address → formatted balance
}

export type AccountsState = Account[];

// Zoo Dashboard types
export interface ZooAgentState {
  agent_id: string;
  address: string;
  status: string;
  needs: { food_need: number; fun_need: number };
  balance: string;
  purchase_count: number;
  total_spent: string;
}

export interface ZooPurchaseReceipt {
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

export interface PreflightCheck {
  id: string;
  label: string;
  status: "pending" | "checking" | "pass" | "fail";
  detail?: string;
  metadata?: Record<string, unknown>;
}

export interface PreflightResult {
  success: boolean;
  checks: PreflightCheck[];
}

// Merchant Agent state for WebSocket broadcasts
export interface ZooMerchantState {
  inventory: Array<{
    sku: string;
    name: string;
    price: string;
    stock: number;
    max_stock: number;
    available: boolean;
  }>;
  total_revenue: string;
  total_cost: string;
  profit: string;
  status: 'offline' | 'online' | 'restocking' | 'error';
  balance: string;
  restock_count: number;
  sale_count: number;
}

// Restock event for real-time visualization
export interface ZooRestockEvent {
  sku: string;
  name: string;
  quantity: number;
  cost: string;
  tx_hash: string;
  block_number: string;
  fee_ausd?: string;
  fee_payer?: string;
  timestamp: number;
}

export interface ZooLLMDecision {
  agent_id: string;
  toolName: string;
  reasoning: string;
  action: { type: 'purchase' | 'wait'; sku?: string; reason: string };
  context_summary: {
    food_need: number;
    balance: string;
    catalog_size: number;
    recent_purchases: number;
  };
  model?: string;
  tokenUsage?: { promptTokens: number; completionTokens: number };
  timestamp: number;
}

export type WsMessage =
  | { type: "log"; entry: LogEntry }
  | { type: "accounts"; accounts: AccountsState }
  | { type: "action_start"; action: string }
  | { type: "action_complete"; action: string }
  | { type: "action_error"; action: string; error: string }
  | { type: "zoo_agents"; agents: ZooAgentState[] }
  | { type: "zoo_purchase"; receipt: ZooPurchaseReceipt }
  | { type: "zoo_network_stats"; stats: NetworkStats }
  | { type: "zoo_tx_flow"; event: TransactionFlowEvent }
  | { type: "zoo_balance_update"; update: BalanceUpdate }
  | { type: "zoo_merchant_state"; merchant: ZooMerchantState }
  | { type: "zoo_restock_event"; event: ZooRestockEvent }
  | { type: "zoo_simulation_complete"; data: unknown }
  | { type: "zoo_funding_progress"; step: string; detail?: string }
  | { type: "zoo_llm_decision"; decision: ZooLLMDecision };

// API Request types for validation
export interface SendRequest {
  from: string;
  to: string;
  amount: string;
  memo: string;
}

export interface BatchPayment {
  to: string;
  amount: string;
  memo: string;
}

export interface BatchRequest {
  from: string;
  payments: BatchPayment[];
}

export interface HistoryRequest {
  account: string;
}

// Internal server types
export interface ServerAccount {
  label: string;
  address: `0x${string}`;
  privateKey: `0x${string}`;
  balances: Record<string, bigint>;
}

// Configuration types
export interface ChainConfig {
  readonly chainId: number;
  readonly rpcUrl: string;
  readonly chainName: string;
  readonly explorerUrl: string;
}

// Validation result types
export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult<T> {
  isValid: boolean;
  data?: T;
  errors?: ValidationError[];
}