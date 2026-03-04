import { useEffect } from "react";
import { useWebSocket } from "./hooks/useWebSocket";
import { useZoo } from "./hooks/useZoo";
import { ApiService } from "./services/api";
import { useBlockchainExplorer } from "./hooks/useBlockchainExplorer";
import ZooHeader from "./components/zoo/ZooHeader";
import PreflightPanel from "./components/zoo/PreflightPanel";
import MerchantPanel from "./components/zoo/MerchantPanel";
import AgentBrainRow from "./components/zoo/AgentBrainRow";
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
    llmDecisions,
    balanceUpdates,
    merchantState,
    restockEvents,
    simulationComplete,
    fundingProgress,
    resetSimulationData,
  } = useWebSocket();

  const {
    phase,
    preflightChecks,
    error,
    startPreflight,
    openGates,
    stopZoo,
    restart,
    markComplete,
  } = useZoo();

  const explorer = useBlockchainExplorer(networkStats, txFlowEvents, balanceUpdates);

  // Transition to "complete" when simulation depletes
  useEffect(() => {
    if (simulationComplete && phase === "running") {
      markComplete();
    }
  }, [simulationComplete, phase, markComplete]);

  const handleNewSimulation = async () => {
    resetSimulationData();
    await ApiService.zooStopAgents().catch(() => {}); // best-effort stop server-side agents
    restart();
  };

  const handleStopZoo = () => {
    resetSimulationData();
    stopZoo();
  };

  const showPreflight = phase === "preflight" || phase === "ready";
  const showDashboard = phase === "running" || phase === "starting" || phase === "stopping" || phase === "complete";
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
        onStopZoo={handleStopZoo}
        onRestart={handleNewSimulation}
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
                  TEMPO TYCOON
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
            <>
              {/* Wallet init progress / ready banner */}
              {phase === "ready" ? (
                <div className="bg-[var(--zt-green-mid)] border-b border-[var(--zt-border-dark)] px-5 py-3 shrink-0">
                  <div className="font-pixel text-[10px] text-[var(--zt-gold)]">
                    Ready for business
                  </div>
                </div>
              ) : fundingProgress && (
                <div className="bg-[var(--zt-green-mid)] border-b border-[var(--zt-border-dark)] px-5 py-3 shrink-0">
                  <div className="font-pixel text-[8px] text-[var(--zt-gold)] mb-1">
                    Initializing Wallets...
                  </div>
                  <div className="font-pixel text-[7px] text-[var(--zt-gold-light,var(--zt-gold))]">
                    {fundingProgress.step}
                    {fundingProgress.detail && (
                      <span className="ml-2">{fundingProgress.detail}</span>
                    )}
                  </div>
                </div>
              )}
              <PreflightPanel
                checks={preflightChecks}
                phase={phase}
                error={error}
                onOpenGates={openGates}
                onRetry={startPreflight}
              />
            </>
          )}

          {/* Running / Complete dashboard */}
          {showDashboard && (
            <>
              {/* Simulation Complete overlay */}
              {phase === "complete" && (
                <div className="bg-[var(--zt-green-mid)] border-b-2 border-[var(--zt-border-dark)] px-5 py-4 shrink-0">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-pixel text-[10px] text-[var(--zt-gold)] mb-1">
                        SIMULATION COMPLETE
                      </div>
                      <p className="font-pixel text-[7px] text-[var(--zt-text-mid)]">
                        All buyer agents have been depleted. Review the results below.
                      </p>
                    </div>
                    <button onClick={handleNewSimulation} className="zt-btn-brown">
                      New Simulation
                    </button>
                  </div>
                </div>
              )}

              <MerchantPanel merchant={merchant} latestReceipt={receipts[0] ?? null} merchantState={merchantState} restockEvents={restockEvents} />
              <div className="border-b border-[var(--zt-green-mid)] shrink-0 overflow-y-auto" style={{ maxHeight: "60vh" }}>
                <AgentBrainRow agents={zooAgents} llmDecisions={llmDecisions} txFlowEvents={txFlowEvents} />
              </div>
              <div className="shrink-0">
                <ReceiptFeed receipts={receipts} />
              </div>
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

      {(showPreflight || showDashboard) && <ZooFooter zooMaster={zooMaster} />}
    </div>
  );
}
