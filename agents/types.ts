export interface AgentNeeds {
  food_need: number;      // 0-100
  /** @deprecated Reserved for future entertainment merchant — not actively evaluated */
  fun_need: number;       // 0-100
}

export interface AgentState {
  agent_id: string;
  address: string;
  needs: AgentNeeds;
  /** AlphaUSD balance (TIP-20, 6 decimals) as human-readable string */
  balance: string;
  status: 'offline' | 'online' | 'purchasing' | 'error';
  last_purchase_time: Date | null;
  last_funding_time: Date | null;
  purchase_count: number;
  /** Total AlphaUSD spent (TIP-20, 6 decimals) as human-readable string */
  total_spent: string;
  /** Number of poll cycles completed */
  cycle_count: number;
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
  fee_ausd?: string;
  fee_payer?: string;
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
  | 'simulation_started'
  | 'simulation_stopped'
  | 'simulation_depleted'
  | 'needs_updated'
  | 'purchase_initiated'
  | 'purchase_completed'
  | 'purchase_failed'
  | 'funding_received'
  | 'funding_completed'
  | 'funding_failed'
  | 'funding_progress'
  | 'error_occurred'
  | 'merchant_cycle_completed'
  | 'restock_initiated'
  | 'restock_completed'
  | 'restock_failed'
  | 'sale_recorded'
  | 'llm_decision';

export interface AgentEvent {
  type: AgentEventType;
  agent_id: string;
  timestamp: Date;
  data: any;
}

// Merchant Agent types

export interface MerchantConfig {
  agent_id: string;
  private_key: string;
  address: string;
  polling_interval_ms: number;
  zoo_master_address: string;
}

export interface MerchantState {
  agent_id: string;
  address: string;
  status: 'offline' | 'online' | 'restocking' | 'error';
  balance: string;
  total_revenue: string;
  total_cost: string;
  profit: string;
  restock_count: number;
  sale_count: number;
  cycle_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface MerchantStatus {
  agent_id: string;
  status: 'offline' | 'online' | 'restocking' | 'error';
  balance: string;
  wallet_address: string | null;
  total_revenue: string;
  total_cost: string;
  profit: string;
  restock_count: number;
  sale_count: number;
  cycle_count: number;
  uptime_seconds: number;
  error_count: number;
  inventory: Array<{
    sku: string;
    name: string;
    price: string;
    stock: number;
    max_stock: number;
    available: boolean;
  }>;
}

// LLM Buyer Brain types

export type BuyerAction =
  | { type: 'purchase'; sku: string; reason: string }
  | { type: 'wait'; reason: string };

export interface BuyerDecision {
  action: BuyerAction;
  reasoning: string;
  toolName: string;
  tokenUsage?: { promptTokens: number; completionTokens: number };
}

export interface BuyerLLMContext {
  agent_id: string;
  needs: AgentNeeds;
  balance: string;
  catalog: MerchantProduct[];
  purchase_history: Array<{ sku: string; name: string; amount: string; time_ago_seconds: number }>;
  cycle_count: number;
}

export interface RestockRecord {
  restock_id: string;
  sku: string;
  name: string;
  units: number;
  cost: string;
  tx_hash: string;
  block_number: string;
  fee_ausd?: string;
  fee_payer?: string;
  completed_at: Date;
}