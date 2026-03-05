import type {
  NetworkStats,
  TransactionFlowEvent,
  TokenInfo,
  WalletInfo,
  BalanceHistoryEntry,
} from "../../lib/types";
import NetworkAnalyticsPanel from "./NetworkAnalyticsPanel";
import TokenWalletPanel from "./TokenWalletPanel";
import TransactionFlowViz from "./TransactionFlowViz";

interface BlockchainExplorerProps {
  networkStats: NetworkStats | null;
  txFlowEvents: TransactionFlowEvent[];
  tokenInfo: TokenInfo | null;
  wallets: WalletInfo[];
  balanceHistories: Record<string, BalanceHistoryEntry[]>;
  fetchBalanceHistory: (agentId: string) => void;
}

export default function BlockchainExplorer({
  networkStats,
  txFlowEvents,
  tokenInfo,
  wallets,
  balanceHistories,
  fetchBalanceHistory,
}: BlockchainExplorerProps) {
  return (
    <div className="h-full flex flex-col bg-[var(--zt-green-dark)]">
      {/* Title bar */}
      <div className="zt-titlebar flex items-center justify-between shrink-0">
        <span className="text-[14px]">🖥️ BLOCKCHAIN</span>
      </div>

      {/* All panels stacked — scrollable */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Network Stats */}
        <div className="border-b border-[var(--zt-green-mid)]">
          <div className="px-4 py-2 font-pixel text-[10px] text-[var(--zt-tan)] uppercase tracking-widest bg-[var(--zt-green-mid)]/30">
            📡 Network
          </div>
          <NetworkAnalyticsPanel stats={networkStats} />
        </div>

        {/* TX Flow */}
        <div className="border-b border-[var(--zt-green-mid)]">
          <div className="px-4 py-2 font-pixel text-[10px] text-[var(--zt-tan)] uppercase tracking-widest bg-[var(--zt-green-mid)]/30">
            ⛓️ TX Flow
          </div>
          <TransactionFlowViz events={txFlowEvents} />
        </div>

        {/* Wallets */}
        <div>
          <div className="px-4 py-2 font-pixel text-[10px] text-[var(--zt-tan)] uppercase tracking-widest bg-[var(--zt-green-mid)]/30">
            💳 Wallets
          </div>
          <TokenWalletPanel
            tokenInfo={tokenInfo}
            wallets={wallets}
            balanceHistories={balanceHistories}
            fetchBalanceHistory={fetchBalanceHistory}
          />
        </div>
      </div>
    </div>
  );
}
