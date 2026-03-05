import { Hono } from "hono";
import { formatGwei } from "viem";
import { Abis } from "viem/tempo";
import { createLogger } from "../../shared/logger.js";
import { publicClient, ALPHA_USD, CHAIN_CONFIG, TIP20_DECIMALS } from "../tempo-client.js";
import { accountStore } from "../accounts.js";
import { config } from "../config.js";
import { getAllZooAccounts } from "../zoo-accounts.js";
import { balanceHistoryTracker } from "../balance-history.js";
import { getAgentRunner, refreshZooBalances } from "./zoo-shared.js";
import type { NetworkStats, TokenInfo, WalletInfo } from "../../shared/types.js";

const log = createLogger('zoo-blockchain');

export const zooBlockchainRoutes = new Hono();

// Cache for network stats to avoid hammering RPC
let cachedStats: { data: NetworkStats; timestamp: number } | null = null;
const STATS_CACHE_MS = 3000;

// Track zoo tx count
let zooTxCount = 0;
let txTimestamps: number[] = [];

export function incrementZooTxCount(): void {
  zooTxCount++;
  txTimestamps.push(Date.now());
  // Keep only last 5 minutes of timestamps for throughput calculation
  const cutoff = Date.now() - 5 * 60 * 1000;
  txTimestamps = txTimestamps.filter(t => t >= cutoff);
}

export function getZooTxCount(): number {
  return zooTxCount;
}

function getZooTxThroughputPerMin(): number {
  const cutoff = Date.now() - 60 * 1000;
  const recentCount = txTimestamps.filter(t => t >= cutoff).length;
  return Math.round(recentCount * 100) / 100;
}

/** Fetch live network stats from RPC */
export async function fetchNetworkStats(): Promise<NetworkStats> {
  if (cachedStats && Date.now() - cachedStats.timestamp < STATS_CACHE_MS) {
    return cachedStats.data;
  }

  const startMs = Date.now();
  const [chainId, blockNumber, gasPrice] = await Promise.all([
    publicClient.getChainId(),
    publicClient.getBlockNumber(),
    publicClient.getGasPrice(),
  ]);
  const rpcLatencyMs = Date.now() - startMs;

  const stats: NetworkStats = {
    chain_id: chainId,
    chain_name: CHAIN_CONFIG.chainName,
    latest_block: Number(blockNumber),
    gas_price_gwei: formatGwei(gasPrice),
    rpc_latency_ms: rpcLatencyMs,
    zoo_tx_count: zooTxCount,
    zoo_tx_throughput_per_min: getZooTxThroughputPerMin(),
  };

  cachedStats = { data: stats, timestamp: Date.now() };
  return stats;
}

// GET /network/stats
zooBlockchainRoutes.get("/network/stats", async (c) => {
  try {
    const stats = await fetchNetworkStats();
    return c.json(stats);
  } catch (error) {
    log.error('Network stats error:', error);
    return c.json({ error: "Failed to fetch network stats" }, 500);
  }
});

// GET /network/token-info
zooBlockchainRoutes.get("/network/token-info", async (c) => {
  const tokenInfo: TokenInfo = {
    name: "AlphaUSD",
    symbol: "AUSD",
    address: ALPHA_USD,
    standard: "TIP-20",
    decimals: TIP20_DECIMALS,
    transfer_with_memo_signature: "transferWithMemo(address,uint256,bytes32)",
  };
  return c.json(tokenInfo);
});

// GET /network/wallets
zooBlockchainRoutes.get("/network/wallets", async (c) => {
  try {
    // Refresh in background — serve from in-memory cache immediately
    refreshZooBalances().catch(() => {});
    const zooAccounts = getAllZooAccounts();
    const wallets: WalletInfo[] = [];

    for (const account of zooAccounts) {
      const balanceRaw = account.balances[ALPHA_USD] || BigInt(0);
      const balanceUsd = Number(balanceRaw) / 10 ** TIP20_DECIMALS;

      let nonce = 0;
      try {
        nonce = await publicClient.getTransactionCount({ address: account.address as `0x${string}` });
      } catch {
        // nonce fetch may fail, default to 0
      }

      // Determine role from label
      let role = 'unknown';
      if (account.label === 'Zoo Master') role = 'facilitator';
      else if (account.label.startsWith('Merchant')) role = 'merchant';
      else if (account.label.startsWith('Guest')) role = 'agent';

      wallets.push({
        role,
        label: account.label,
        address: account.address,
        balance: balanceUsd.toFixed(2),
        balance_raw: balanceRaw.toString(),
        nonce,
        explorer_link: `${CHAIN_CONFIG.explorerUrl}/address/${account.address}`,
      });
    }

    return c.json({ wallets });
  } catch (error) {
    log.error('Wallets error:', error);
    return c.json({ error: "Failed to fetch wallet info" }, 500);
  }
});

// GET /network/balance-history/:agentId
zooBlockchainRoutes.get("/network/balance-history/:agentId", async (c) => {
  const agentId = c.req.param('agentId');
  const history = balanceHistoryTracker.getHistory(agentId);
  return c.json({ agent_id: agentId, history });
});

// GET /network/tx/:txHash
zooBlockchainRoutes.get("/network/tx/:txHash", async (c) => {
  try {
    const txHash = c.req.param('txHash') as `0x${string}`;

    const [tx, receipt, latestBlock] = await Promise.all([
      publicClient.getTransaction({ hash: txHash }),
      publicClient.getTransactionReceipt({ hash: txHash }),
      publicClient.getBlockNumber(),
    ]);

    const gasUsed = receipt.gasUsed as bigint;
    const effectiveGasPrice = receipt.effectiveGasPrice as bigint;
    const feeWei = gasUsed * effectiveGasPrice;
    const WEI_TO_TIP20 = BigInt(10 ** 12);
    const feeTip20 = feeWei / WEI_TO_TIP20;
    const feeAusd = (Number(feeTip20) / (10 ** TIP20_DECIMALS)).toFixed(6);

    // Try to decode memo from input data (best effort)
    let decodedMemo = '';
    try {
      const input = tx.input;
      if (input && input.length > 10) {
        // Last 32 bytes of a transferWithMemo call contain the memo
        const memoHex = '0x' + input.slice(-64);
        const bytes = Buffer.from(memoHex.slice(2), 'hex');
        decodedMemo = bytes.toString('utf8').replace(/\0/g, '').trim();
      }
    } catch {
      // memo decode is best effort
    }

    const confirmations = Number(latestBlock) - Number(receipt.blockNumber);

    return c.json({
      tx_hash: txHash,
      block_number: Number(receipt.blockNumber),
      gas_used: gasUsed.toString(),
      fee_ausd: feeAusd,
      decoded_memo: decodedMemo,
      confirmations,
      from: tx.from,
      to: tx.to,
      amount: '', // Would need event log decoding for exact amount
      explorer_link: `${CHAIN_CONFIG.explorerUrl}/tx/${txHash}`,
    });
  } catch (error) {
    log.error('Transaction detail error:', error);
    return c.json({ error: "Failed to fetch transaction details" }, 500);
  }
});
