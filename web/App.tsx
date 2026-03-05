import { useEffect } from "react";
import { useWebSocket } from "./hooks/useWebSocket";
import { useZoo } from "./hooks/useZoo";
import { ApiService } from "./services/api";
import { useBlockchainExplorer } from "./hooks/useBlockchainExplorer";
import ZooHeader from "./components/zoo/ZooHeader";
import PreflightPanel from "./components/zoo/PreflightPanel";
import MerchantPanel from "./components/zoo/MerchantPanel";
import AgentColumn from "./components/zoo/AgentColumn";

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
    priceAdjustments,
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

  const explorer = useBlockchainExplorer(networkStats, txFlowEvents, balanceUpdates, accounts.length);

  // Transition to "complete" when simulation depletes
  useEffect(() => {
    if (simulationComplete && phase === "running") {
      markComplete();
    }
  }, [simulationComplete, phase, markComplete]);

  const handleNewSimulation = async () => {
    resetSimulationData();
    await ApiService.zooStopAgents().catch(() => {});
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
        networkStats={networkStats}
      />

      {/* Main content */}
      <div className="flex-1 flex min-h-0">
        {/* Idle state — dialog popup */}
        {phase === "idle" && (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-full max-w-sm zt-bevel overflow-hidden">
              <div className="zt-titlebar text-center">
                TEMPO TYCOON
              </div>
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

        {/* Preflight phase — standalone full-width view */}
        {showPreflight && (
          <div className="flex-1 flex flex-col min-h-0 min-w-0">
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
          </div>
        )}

        {/* 3-column Mission Control layout (running/complete) */}
        {showDashboard && (
          <>
            {/* Left: Agents (~22%) */}
            <div
              className="w-[22%] min-w-[240px] border-r border-[var(--zt-border-dark)] flex flex-col min-h-0"
            >
              {/* Simulation complete banner (thin) */}
              {phase === "complete" && (
                <div className="bg-[var(--zt-green-mid)] border-b border-[var(--zt-border-dark)] px-2 py-1.5 shrink-0">
                  <div className="font-pixel text-[7px] text-[var(--zt-gold)]">SIMULATION COMPLETE</div>
                </div>
              )}
              <div className="flex-1 min-h-0 overflow-hidden">
                <AgentColumn
                  agents={zooAgents}
                  llmDecisions={llmDecisions}
                  txFlowEvents={txFlowEvents}
                  simulationComplete={phase === "complete"}
                />
              </div>
            </div>

            {/* Center: Merchant (~45%) */}
            <div className="flex-1 min-w-0 relative border-r border-[var(--zt-border-dark)] flex flex-col min-h-0">
              {/* Completion banner */}
              {phase === "complete" && (
                <div className="bg-[var(--zt-green-mid)] border-b border-[var(--zt-border-dark)] px-3 py-2 shrink-0">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-pixel text-[8px] text-[var(--zt-gold)]">SIMULATION COMPLETE</div>
                      <p className="font-pixel text-[6px] text-[var(--zt-text-mid)]">
                        All buyer agents depleted. Review results below.
                      </p>
                    </div>
                    <button onClick={handleNewSimulation} className="zt-btn-brown">
                      New Simulation
                    </button>
                  </div>
                </div>
              )}

              <div className="flex-1 min-h-0 overflow-hidden">
                <MerchantPanel
                  merchant={merchant}
                  agents={zooAgents}
                  latestReceipt={receipts[0] ?? null}
                  merchantState={merchantState}
                  restockEvents={restockEvents}
                  merchantDecision={llmDecisions['merchant_a'] ?? null}
                  priceAdjustments={priceAdjustments}
                  simulationComplete={phase === "complete"}
                  receipts={receipts}
                />
              </div>
            </div>

            {/* Right: Blockchain (~33%) */}
            <div className="w-[33%] min-w-[280px] flex flex-col min-h-0">
              <BlockchainExplorer
                networkStats={explorer.networkStats}
                txFlowEvents={explorer.txFlowEvents}
                tokenInfo={explorer.tokenInfo}
                wallets={explorer.wallets}
              />
            </div>
          </>
        )}
      </div>

      {(showPreflight || showDashboard) && <ZooFooter zooMaster={zooMaster} />}
    </div>
  );
}
