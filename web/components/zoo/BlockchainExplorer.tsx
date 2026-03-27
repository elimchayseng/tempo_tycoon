import type {
  NetworkStats,
  TransactionFlowEvent,
  TokenInfo,
  WalletInfo,
} from "../../lib/types";
import NetworkAnalyticsPanel from "./NetworkAnalyticsPanel";
import TokenWalletPanel from "./TokenWalletPanel";
import TransactionFlowViz from "./TransactionFlowViz";

interface BlockchainExplorerProps {
  networkStats: NetworkStats | null;
  txFlowEvents: TransactionFlowEvent[];
  tokenInfo: TokenInfo | null;
  wallets: WalletInfo[];
}

export default function BlockchainExplorer({
  networkStats,
  txFlowEvents,
  tokenInfo,
  wallets,
}: BlockchainExplorerProps) {
  return (
    <div className="flex flex-col">
      <div className="border-b border-[var(--zt-green-mid)]">
        <div className="zt-section-label">Network</div>
        <NetworkAnalyticsPanel stats={networkStats} />
      </div>

      <div className="border-b border-[var(--zt-green-mid)]">
        <div className="zt-section-label">TX Flow</div>
        <TransactionFlowViz events={txFlowEvents} />
      </div>

      <div>
        <div className="zt-section-label">Wallets</div>
        <TokenWalletPanel tokenInfo={tokenInfo} wallets={wallets} />
      </div>
    </div>
  );
}
