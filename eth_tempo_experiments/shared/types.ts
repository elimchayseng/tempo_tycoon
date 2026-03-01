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

export type WsMessage =
  | { type: "log"; entry: LogEntry }
  | { type: "accounts"; accounts: AccountsState }
  | { type: "action_start"; action: string }
  | { type: "action_complete"; action: string }
  | { type: "action_error"; action: string; error: string };

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