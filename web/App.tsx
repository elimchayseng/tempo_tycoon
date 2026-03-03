import { useWebSocket } from "./hooks/useWebSocket";
import { useZoo } from "./hooks/useZoo";
import { useBlockchainExplorer } from "./hooks/useBlockchainExplorer";
import ZooHeader from "./components/zoo/ZooHeader";
import PreflightPanel from "./components/zoo/PreflightPanel";
import MerchantPanel from "./components/zoo/MerchantPanel";
import AgentCardRow from "./components/zoo/AgentCardRow";
import ReceiptFeed from "./components/zoo/ReceiptFeed";
import ZooFooter from "./components/zoo/ZooFooter";
import BlockchainExplorer from "./components/zoo/BlockchainExplorer";

export default function App() {
  const {
    connected,
    accounts,
    zooAgents,
    receipts,
    networkStats,
    txFlowEvents,
    balanceUpdates,
    merchantState,
    restockEvents,
  } = useWebSocket();

  const {
    phase,
    preflightChecks,
    error,
    startPreflight,
    openGates,
    stopZoo,
    restart,
  } = useZoo();

  const explorer = useBlockchainExplorer(networkStats, txFlowEvents, balanceUpdates);

  const showPreflight = phase === "preflight" || phase === "ready";
  const showDashboard = phase === "running" || phase === "starting" || phase === "stopping";
  const zooMaster = accounts.find(a => a.label === "Zoo Master");
  const merchant = accounts.find(a => a.label === "Merchant A");

  return (
    <div className="h-screen flex flex-col bg-[var(--zt-green-dark)] text-gray-100">
      <ZooHeader
        phase={phase}
        connected={connected}
        error={error}
        onStartPreflight={startPreflight}
        onOpenGates={openGates}
        onStopZoo={stopZoo}
        onRestart={restart}
        explorerOpen={explorer.isOpen}
        onToggleExplorer={explorer.toggle}
      />

      {/* Main content */}
      <div className="flex-1 flex min-h-0">
        {/* Main dashboard area */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          {/* Idle state — dialog popup */}
          {phase === "idle" && (
            <div className="flex-1 flex items-center justify-center">
              <div className="w-full max-w-sm zt-bevel overflow-hidden">
                {/* Title bar */}
                <div className="zt-titlebar text-center">
                  🦁 TEMPO TYCOON
                </div>
                {/* Parchment body */}
                <div className="zt-parchment px-6 py-6 text-center">
                  <p className="font-pixel text-[8px] text-[var(--zt-text-mid)] mb-5 leading-relaxed">
                    Autonomous agent commerce<br />
                    on Tempo Moderato Testnet
                  </p>
                  <button onClick={startPreflight} className="zt-btn-brown">
                    Start Zoo
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Preflight phase */}
          {showPreflight && (
            <PreflightPanel
              checks={preflightChecks}
              phase={phase}
              error={error}
              onOpenGates={openGates}
              onRetry={startPreflight}
            />
          )}

          {/* Running dashboard */}
          {showDashboard && (
            <>
              <MerchantPanel merchant={merchant} latestReceipt={receipts[0] ?? null} merchantState={merchantState} restockEvents={restockEvents} />
              <div className="border-b border-[var(--zt-green-mid)] shrink-0">
                <AgentCardRow agents={zooAgents} />
              </div>
              <ReceiptFeed receipts={receipts} />
            </>
          )}
        </div>

        {/* Blockchain Explorer sidebar */}
        {showDashboard && explorer.isOpen && (
          <div
            className="shrink-0 border-l-2 border-[var(--zt-border-dark)] overflow-hidden zt-sidebar-enter"
            style={{ width: 380 }}
          >
            <BlockchainExplorer
              activeTab={explorer.activeTab}
              setActiveTab={explorer.setActiveTab}
              networkStats={explorer.networkStats}
              txFlowEvents={explorer.txFlowEvents}
              tokenInfo={explorer.tokenInfo}
              wallets={explorer.wallets}
              balanceHistories={explorer.balanceHistories}
              fetchBalanceHistory={explorer.fetchBalanceHistory}
            />
          </div>
        )}
      </div>

      {showDashboard && <ZooFooter zooMaster={zooMaster} />}
    </div>
  );
}
