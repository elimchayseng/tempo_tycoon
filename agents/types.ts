export interface AgentNeeds {
  food_need: number;      // 0-100
  fun_need: number;       // 0-100 (not implemented yet, reserved for future)
}

export interface AgentState {
  agent_id: string;
  address: string;
  needs: AgentNeeds;
  balance: string;        // AlphaUSD balance as string
  status: 'offline' | 'online' | 'purchasing' | 'error';
  last_purchase_time: Date | null;
  last_funding_time: Date | null;
  purchase_count: number;
  total_spent: string;    // Total AlphaUSD spent as string
  cycle_count: number;    // Number of poll cycles completed
  created_at: Date;
  updated_at: Date;
}

export interface PurchaseRecord {
  purchase_id: string;
  session_id: string;
  sku: string;
  name: string;
  amount: string;
  tx_hash: string;
  block_number: string | undefined;
  completed_at: Date;
  need_before: AgentNeeds;
  need_after: AgentNeeds;
}

export interface AgentConfig {
  agent_id: string;
  private_key: string;
  address: string;
  initial_funding_amount: string;
  refund_threshold: string;
  refund_amount: string;
  polling_interval_ms: number;
  need_decay_rate: {
    food_need: number;     // Points decreased per cycle
    fun_need: number;      // Points decreased per cycle (future)
  };
  purchase_threshold: {
    food_need: number;     // Trigger purchase when need below this
    fun_need: number;      // Trigger purchase when need below this (future)
  };
  need_recovery: {
    main: number;          // Points gained from main course
    snack: number;         // Points gained from snack
    beverage: number;      // Points gained from beverage
    dessert: number;       // Points gained from dessert
  };
}

export interface MerchantProduct {
  sku: string;
  name: string;
  description?: string;
  price: string;
  currency: string;
  category: string;
  available: boolean;
}

export interface MerchantCatalog {
  merchant_id: string;
  merchant_name: string;
  category: string;
  products: MerchantProduct[];
  updated_at: string;
}

export interface CheckoutSession {
  session_id: string;
  amount: string;
  currency: string;
  recipient_address: string;
  expires_at: string;
  memo: string;
  product: {
    sku: string;
    name: string;
    price: string;
    quantity: number;
  };
}

export interface CheckoutResult {
  success: boolean;
  verified: boolean;
  purchase_id?: string;
  session_id?: string;
  product?: {
    sku: string;
    quantity: number;
  };
  payment?: {
    amount: string;
    currency: string;
    tx_hash: string;
    block_number?: string;
  };
  error?: string;
  details?: string;
}

export interface AgentStatus {
  agent_id: string;
  status: 'offline' | 'online' | 'purchasing' | 'error';
  needs: AgentNeeds;
  balance: string;
  wallet_address: string | null;
  last_purchase_time: Date | null;
  cycle_count: number;
  purchase_count: number;
  total_spent: string;
  uptime_seconds: number;
  error_count: number;
  last_error?: {
    message: string;
    timestamp: Date;
  };
}

export interface BatchFundingRequest {
  recipients: Array<{
    address: string;
    amount: string;
    agent_id: string;
  }>;
  reason: 'initial_funding' | 'refund';
}

export interface BatchFundingResult {
  success: boolean;
  tx_hash?: string;
  block_number?: string;
  funded_agents: string[];
  total_amount: string;
  error?: string;
  transaction_hashes?: string[];
  wallet_addresses?: Record<string, string>;
}

export interface ZooRegistry {
  zoo_info: {
    name: string;
    facilitator_address: string;
    chain_id: number;
    currency: string;
    polling_interval_ms: number;
  };
  merchants: Array<{
    id: string;
    name: string;
    category: string;
    endpoint: string;
    wallet_address: string;
    menu: Array<{
      sku: string;
      name: string;
      price: string;
      category: string;
      available: boolean;
    }>;
  }>;
}

export interface AgentMetrics {
  total_agents: number;
  active_agents: number;
  total_purchases: number;
  total_spent: string;
  average_need_levels: {
    food_need: number;
    fun_need: number;
  };
  purchases_per_minute: number;
  error_rate: number;
}

export interface MetricPoint {
  timestamp: number;
  latencyMs: number;
  success: boolean;
  agentId: string;
  amount: number;
}

export interface CircuitBreakerStatusInfo {
  name: string;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failures: number;
  successes: number;
  lastFailureTime: number | null;
  nextRetryTime: number | null;
}

export type AgentEventType =
  | 'agent_started'
  | 'agent_stopped'
  | 'needs_updated'
  | 'purchase_initiated'
  | 'purchase_completed'
  | 'purchase_failed'
  | 'funding_received'
  | 'funding_failed'
  | 'error_occurred';

export interface AgentEvent {
  type: AgentEventType;
  agent_id: string;
  timestamp: Date;
  data: any;
}