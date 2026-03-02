import type { ExplorerTab } from "../../hooks/useBlockchainExplorer";
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
  activeTab: ExplorerTab;
  setActiveTab: (tab: ExplorerTab) => void;
  networkStats: NetworkStats | null;
  txFlowEvents: TransactionFlowEvent[];
  tokenInfo: TokenInfo | null;
  wallets: WalletInfo[];
  balanceHistories: Record<string, BalanceHistoryEntry[]>;
  fetchBalanceHistory: (agentId: string) => void;
}

const TABS: { id: ExplorerTab; label: string; icon: string }[] = [
  { id: "txflow", label: "TX Flow", icon: "⛓️" },
  { id: "wallets", label: "Wallets", icon: "💳" },
  { id: "network", label: "Network", icon: "📡" },
];

export default function BlockchainExplorer({
  activeTab,
  setActiveTab,
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
        <span className="text-[10px]">🖥️ CONTROL ROOM</span>
      </div>

      {/* Tab bar */}
      <div className="flex shrink-0 border-b-2 border-[var(--zt-border-dark)]">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 font-pixel text-[7px] py-2 px-1 transition-colors ${
              activeTab === tab.id
                ? "bg-[var(--zt-green-mid)] text-white border-b-2 border-[var(--zt-gold)]"
                : "bg-[var(--zt-green-dark)] text-gray-400 hover:text-gray-300 hover:bg-[var(--zt-green-mid)]/30"
            }`}
          >
            <span className="text-xs mr-1">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content — scrollable */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {activeTab === "network" && (
          <NetworkAnalyticsPanel stats={networkStats} />
        )}
        {activeTab === "wallets" && (
          <TokenWalletPanel
            tokenInfo={tokenInfo}
            wallets={wallets}
            balanceHistories={balanceHistories}
            fetchBalanceHistory={fetchBalanceHistory}
          />
        )}
        {activeTab === "txflow" && (
          <TransactionFlowViz events={txFlowEvents} />
        )}
      </div>
    </div>
  );
}
