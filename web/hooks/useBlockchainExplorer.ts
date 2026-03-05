import { useState, useEffect, useCallback } from "react";
import { ApiService } from "../services/api";
import type {
  TokenInfo,
  WalletInfo,
  BalanceHistoryEntry,
  NetworkStats,
  TransactionFlowEvent,
  BalanceUpdate,
} from "../lib/types";

export function useBlockchainExplorer(
  networkStats: NetworkStats | null,
  txFlowEvents: TransactionFlowEvent[],
  balanceUpdates: BalanceUpdate[],
  accountsCount = 0,
) {
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [wallets, setWallets] = useState<WalletInfo[]>([]);
  const [balanceHistories, setBalanceHistories] = useState<Record<string, BalanceHistoryEntry[]>>({});

  // Fetch token info once
  useEffect(() => {
    ApiService.getTokenInfo().then(setTokenInfo).catch(() => {});
  }, []);

  // Fetch wallets immediately, on balance updates, and poll every 5s
  useEffect(() => {
    const fetchWallets = () =>
      ApiService.getWallets()
        .then((data) => setWallets(data.wallets))
        .catch(() => {});

    fetchWallets();
    const interval = setInterval(fetchWallets, 5000);
    return () => clearInterval(interval);
  }, [balanceUpdates.length, accountsCount]);

  // Fetch balance history for all agents when wallets tab is active
  const fetchBalanceHistory = useCallback(async (agentId: string) => {
    try {
      const data = await ApiService.getBalanceHistory(agentId);
      setBalanceHistories((prev) => ({ ...prev, [agentId]: data.history }));
    } catch {
      // ignore
    }
  }, []);

  return {
    tokenInfo,
    wallets,
    balanceHistories,
    fetchBalanceHistory,
    networkStats,
    txFlowEvents,
    balanceUpdates,
  };
}
