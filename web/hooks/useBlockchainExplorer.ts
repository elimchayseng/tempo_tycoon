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

export type ExplorerTab = "network" | "wallets" | "txflow";

export function useBlockchainExplorer(
  networkStats: NetworkStats | null,
  txFlowEvents: TransactionFlowEvent[],
  balanceUpdates: BalanceUpdate[],
) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ExplorerTab>("txflow");
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [wallets, setWallets] = useState<WalletInfo[]>([]);
  const [balanceHistories, setBalanceHistories] = useState<Record<string, BalanceHistoryEntry[]>>({});

  // Fetch token info once
  useEffect(() => {
    if (!isOpen) return;
    ApiService.getTokenInfo().then(setTokenInfo).catch(() => {});
  }, [isOpen]);

  // Fetch wallets when panel opens and on balance updates
  useEffect(() => {
    if (!isOpen) return;
    ApiService.getWallets()
      .then((data) => setWallets(data.wallets))
      .catch(() => {});
  }, [isOpen, balanceUpdates.length]);

  // Fetch balance history for all agents when wallets tab is active
  const fetchBalanceHistory = useCallback(async (agentId: string) => {
    try {
      const data = await ApiService.getBalanceHistory(agentId);
      setBalanceHistories((prev) => ({ ...prev, [agentId]: data.history }));
    } catch {
      // ignore
    }
  }, []);

  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  return {
    isOpen,
    toggle,
    activeTab,
    setActiveTab,
    tokenInfo,
    wallets,
    balanceHistories,
    fetchBalanceHistory,
    networkStats,
    txFlowEvents,
    balanceUpdates,
  };
}
