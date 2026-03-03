import type { ChainConfig } from "../shared/types.js";

// Environment-based configuration
export const config = {
  server: {
    port: process.env.PORT ? parseInt(process.env.PORT) : 4000,
    // Railway handles host binding automatically, we just need the port
    environment: process.env.NODE_ENV || 'development',
  },

  chain: {
    chainId: 42431,
    rpcUrl: process.env.RPC_URL || "https://rpc.moderato.tempo.xyz",
    chainName: "Tempo Moderato Testnet",
    explorerUrl: process.env.EXPLORER_URL || "https://explore.moderato.tempo.xyz",
  } as ChainConfig,

  contracts: {
    alphaUsd: "0x20c0000000000000000000000000000000000001" as const,
    pathUsd: process.env.PATH_USD_ADDRESS || "0x20c0000000000000000000000000000000000000" as const,
    betaUsd: "0x20c0000000000000000000000000000000000002" as const,
    // stablecoinDex and tip20Factory addresses will be loaded from viem/tempo
  },

  limits: {
    maxWebSocketConnections: 50,
    maxPaymentsPerBatch: 10,
    requestTimeoutMs: 30000,
    maxMemoLength: 31,
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
    enableRequestLogging: process.env.ENABLE_REQUEST_LOGS !== 'false',
  },

  // Zoo simulation configuration
  zoo: {
    enabled: process.env.ZOO_SIMULATION_ENABLED === 'true',
    agentPollingInterval: parseInt(process.env.AGENT_POLLING_INTERVAL || '10000'),
    needDecayRate: parseInt(process.env.NEED_DECAY_RATE || '2'),
    purchaseThreshold: parseInt(process.env.PURCHASE_THRESHOLD || '30'),
    minBalanceThreshold: parseFloat(process.env.MIN_BALANCE_THRESHOLD || '10.0'),
    sessionTimeoutMinutes: parseInt(process.env.SESSION_TIMEOUT_MINUTES || '5'),
  },

  // LLM inference configuration (Heroku Managed Inference)
  llm: {
    enabled: process.env.LLM_ENABLED === 'true',
    inferenceUrl: process.env.INFERENCE_URL || '',
    inferenceKey: process.env.INFERENCE_KEY || '',
    model: process.env.LLM_MODEL || 'claude-4-5-haiku',
    maxTokensPerResponse: 1024,
    maxCallsPerSimulation: 100,
  },

} as const;

// Validate configuration on startup
export function validateConfig(): void {
  if (!config.chain.rpcUrl || !config.chain.explorerUrl) {
    throw new Error('Missing required RPC_URL or EXPLORER_URL environment variables');
  }

  if (config.server.port < 1 || config.server.port > 65535) {
    throw new Error('Invalid PORT: must be between 1 and 65535');
  }

  if (config.limits.maxWebSocketConnections < 1 || config.limits.maxWebSocketConnections > 1000) {
    throw new Error('maxWebSocketConnections must be between 1 and 1000');
  }

  // Zoo-specific validation (only when zoo simulation is enabled)
  if (config.zoo.enabled) {
    if (config.zoo.agentPollingInterval < 1000 || config.zoo.agentPollingInterval > 60000) {
      throw new Error('agentPollingInterval must be between 1000ms and 60000ms (1-60 seconds)');
    }

    if (config.zoo.minBalanceThreshold < 1 || config.zoo.minBalanceThreshold > 1000) {
      throw new Error('minBalanceThreshold must be between 1 and 1000 AlphaUSD');
    }

    if (config.zoo.sessionTimeoutMinutes < 1 || config.zoo.sessionTimeoutMinutes > 60) {
      throw new Error('sessionTimeoutMinutes must be between 1 and 60 minutes');
    }
  }
}

// Helper to check if we're in production
export const isProduction = (): boolean => config.server.environment === 'production';