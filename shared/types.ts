// Shared types between server and client
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
  status: string;
  needs: { food_need: number; fun_need: number };
  balance: string;
  purchase_count: number;
  total_spent: string;
}

export interface ZooPurchaseReceipt {
  agent_id: string;
  product_name: string;
  sku: string;
  amount: string;
  merchant_name: string;
  merchant_address: string;
  tx_hash: string;
  block_number: string;
  gas_used: string;
  need_before: number;
  need_after: number;
  timestamp: number;
}

export interface PreflightCheck {
  id: string;
  label: string;
  status: "pending" | "checking" | "pass" | "fail";
  detail?: string;
}

export interface PreflightResult {
  success: boolean;
  checks: PreflightCheck[];
}

export type WsMessage =
  | { type: "log"; entry: LogEntry }
  | { type: "accounts"; accounts: AccountsState }
  | { type: "action_start"; action: string }
  | { type: "action_complete"; action: string }
  | { type: "action_error"; action: string; error: string }
  | { type: "zoo_agents"; agents: ZooAgentState[] }
  | { type: "zoo_purchase"; receipt: ZooPurchaseReceipt };

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