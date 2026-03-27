import { useEffect, useState, useCallback } from "react";
import { useWebSocket } from "./hooks/useWebSocket";
import { useZoo } from "./hooks/useZoo";
import { ApiService } from "./services/api";
import { useBlockchainExplorer } from "./hooks/useBlockchainExplorer";
import { formatAlphaUsdBalance, ANIMAL_EMOJI, cartDisplayInfo } from "./utils/formatting";
import ZooHeader from "./components/zoo/ZooHeader";
import PreflightPanel from "./components/zoo/PreflightPanel";
import MerchantPanel from "./components/zoo/MerchantPanel";
import AgentColumn from "./components/zoo/AgentColumn";
import ZooParkView from "./components/zoo/ZooParkView";
import ZooToolbar from "./components/zoo/ZooToolbar";
import FloatingWindow from "./components/zoo/FloatingWindow";
import BlockchainExplorer from "./components/zoo/BlockchainExplorer";

const ALPHA_USD = "0x20c0000000000000000000000000000000000001";

// Default panel positions (desktop)
const DEFAULT_POSITIONS: Record<string, { x: number; y: number }> = {
  agents:     { x: 16,  y: 56  },
  shop:       { x: 340, y: 56  },
  blockchain: { x: 660, y: 56  },
  receipts:   { x: 340, y: 300 },
};

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

  useEffect(() => {
    if (simulationComplete && phase === "running") {
      markComplete();
      // Close floating windows so the results overlay is unobstructed
      setOpenPanels(new Set());
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

  // ── Floating window state ──
  const [openPanels, setOpenPanels] = useState<Set<string>>(new Set(["agents", "shop"]));

  const togglePanel = useCallback((id: string) => {
    setOpenPanels((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const closePanel = useCallback((id: string) => {
    setOpenPanels((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  // Auto-open agents + shop when simulation starts
  useEffect(() => {
    if (phase === "running") {
      setOpenPanels(new Set(["agents", "shop"]));
    }
  }, [phase]);

  const showPreflight = phase === "preflight" || phase === "ready";
  const showDashboard = phase === "running" || phase === "starting" || phase === "stopping" || phase === "complete";
  const zooMaster = accounts.find(a => a.label === "Zoo Master");
  const merchant = accounts.find(a => a.label === "Merchant A");
  const merchantBalance = formatAlphaUsdBalance(merchant?.balances[ALPHA_USD] ?? "0");

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
      <div className="flex-1 flex flex-col min-h-0">
        {/* Idle state */}
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
                <a
                  href="https://github.com/elimchayseng/tempo_tycoon"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block mt-4 font-pixel text-[7px] text-[var(--zt-text-mid)] hover:text-[var(--zt-green-mid)] transition-colors"
                >
                  View Source on GitHub
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Preflight phase */}
        {showPreflight && (
          <div className="flex-1 flex flex-col min-h-0 min-w-0">
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
                <div className="font-pixel text-[7px] text-[var(--zt-gold)]">
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

        {/* ══ PARK VIEWPORT + FLOATING WINDOWS ══ */}
        {showDashboard && (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Park fills available space */}
            <div className="zt-park-viewport flex-1">
              <ZooParkView
                agents={zooAgents}
                latestReceipt={receipts[0] ?? null}
                merchantState={merchantState}
                restockEvents={restockEvents}
                fullscreen
              />

              {/* End-of-simulation results overlay */}
              {phase === "complete" && (
                <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/40">
                  <div className="zt-float-window" style={{ width: 400 }}>
                    <div className="zt-win-titlebar" style={{ cursor: "default" }}>
                      <span className="zt-win-title">SIMULATION COMPLETE</span>
                    </div>
                    <div className="zt-parchment px-5 py-5">
                      {/* Summary stats */}
                      <div className="space-y-3 mb-5">
                        <div className="flex justify-between items-center">
                          <span className="font-pixel text-[8px] text-[var(--zt-text-mid)] uppercase">Transactions</span>
                          <span className="font-pixel text-[11px] text-[var(--zt-text-dark)]">{receipts.length}</span>
                        </div>
                        <div className="zt-ticket-perf -mx-5" />
                        <div className="flex justify-between items-center">
                          <span className="font-pixel text-[8px] text-[var(--zt-text-mid)] uppercase">Revenue</span>
                          <span className="font-pixel text-[11px] text-[var(--zt-green-mid)]">${merchantState?.total_revenue ?? "0.00"}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="font-pixel text-[8px] text-[var(--zt-text-mid)] uppercase">Cost</span>
                          <span className="font-pixel text-[11px] text-red-700">${merchantState?.total_cost ?? "0.00"}</span>
                        </div>
                        <div className="zt-ticket-perf -mx-5" />
                        <div className="flex justify-between items-center">
                          <span className="font-pixel text-[8px] text-[var(--zt-text-mid)] uppercase">Profit</span>
                          <span className={`font-pixel text-[13px] ${
                            parseFloat(merchantState?.profit ?? "0") >= 0 ? "text-[var(--zt-green-mid)]" : "text-red-700"
                          }`}>
                            ${merchantState?.profit ?? "0.00"}
                          </span>
                        </div>

                        {/* Per-agent summary */}
                        {zooAgents.length > 0 && (
                          <>
                            <div className="zt-ticket-perf -mx-5" />
                            <div className="space-y-1.5">
                              {zooAgents.map((agent) => (
                                <div key={agent.agent_id} className="flex justify-between items-center">
                                  <span className="font-pixel text-[7px] text-[var(--zt-text-mid)]">
                                    {ANIMAL_EMOJI[agent.agent_id] ?? "\u{1F9D1}"} {agent.agent_id}
                                  </span>
                                  <span className="font-pixel text-[8px] text-[var(--zt-text-dark)]">
                                    {agent.purchase_count} buys &middot; ${agent.balance} left
                                  </span>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center justify-between">
                        <button onClick={handleNewSimulation} className="zt-btn-brown">
                          New Simulation
                        </button>
                        <span className="font-pixel text-[6px] text-[var(--zt-text-mid)]">
                          Open toolbar panels to inspect details
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Floating Windows ── */}

              {openPanels.has("agents") && (
                <FloatingWindow
                  id="agents"
                  title="ZOO GUESTS"
                  onClose={() => closePanel("agents")}
                  defaultPosition={DEFAULT_POSITIONS.agents}
                  width={310}
                  maxHeight={520}
                >
                  <AgentColumn
                    agents={zooAgents}
                    llmDecisions={llmDecisions}
                    txFlowEvents={txFlowEvents}
                    simulationComplete={phase === "complete"}
                  />
                </FloatingWindow>
              )}

              {openPanels.has("shop") && (
                <FloatingWindow
                  id="shop"
                  title={`GIFT SHOP  $${merchantBalance}`}
                  onClose={() => closePanel("shop")}
                  defaultPosition={DEFAULT_POSITIONS.shop}
                  width={380}
                  maxHeight={480}
                >
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
                </FloatingWindow>
              )}

              {openPanels.has("receipts") && (
                <FloatingWindow
                  id="receipts"
                  title={`TX RECEIPTS (${receipts.length})`}
                  onClose={() => closePanel("receipts")}
                  defaultPosition={DEFAULT_POSITIONS.receipts}
                  width={360}
                  maxHeight={420}
                >
                  {receipts.length === 0 ? (
                    <div className="px-4 py-6 text-center">
                      <span className="font-pixel text-[9px] text-gray-500">No transactions yet</span>
                    </div>
                  ) : (
                    <div className="px-3 py-2">
                      <table className="w-full font-pixel text-[8px]">
                        <thead>
                          <tr className="text-gray-500 text-left">
                            <th className="pb-1.5 pr-1">#</th>
                            <th className="pb-1.5 pr-1">Guest</th>
                            <th className="pb-1.5 pr-1">Items</th>
                            <th className="pb-1.5 pr-1 text-right">Amount</th>
                            <th className="pb-1.5 text-right">TX</th>
                          </tr>
                        </thead>
                        <tbody>
                          {receipts.map((receipt, i) => {
                            const guestEmoji = ANIMAL_EMOJI[receipt.agent_id] ?? "\u{1F9D1}";
                            const { emojis } = cartDisplayInfo(receipt.items);
                            const txShort = receipt.tx_hash ? `${receipt.tx_hash.slice(0, 6)}..` : "\u2014";
                            return (
                              <tr
                                key={`${receipt.tx_hash}-${i}`}
                                className="hover:bg-[var(--zt-green-mid)]/30 transition-colors border-t border-[var(--zt-green-mid)]/20"
                              >
                                <td className="py-1 pr-1 text-gray-500">{receipts.length - i}</td>
                                <td className="py-1 pr-1">{guestEmoji}</td>
                                <td className="py-1 pr-1">{emojis}</td>
                                <td className="py-1 pr-1 text-right text-[var(--zt-gold)]">${receipt.amount}</td>
                                <td className="py-1 text-right">
                                  {receipt.tx_hash ? (
                                    <a
                                      href={`https://explore.moderato.tempo.xyz/tx/${receipt.tx_hash}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-[var(--zt-green-light)] hover:text-[var(--zt-gold)] hover:underline"
                                    >
                                      {txShort}
                                    </a>
                                  ) : (
                                    <span className="text-gray-500">{"\u2014"}</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </FloatingWindow>
              )}

              {openPanels.has("blockchain") && (
                <FloatingWindow
                  id="blockchain"
                  title="BLOCKCHAIN"
                  onClose={() => closePanel("blockchain")}
                  defaultPosition={DEFAULT_POSITIONS.blockchain}
                  width={340}
                  maxHeight={500}
                >
                  <BlockchainExplorer
                    networkStats={explorer.networkStats}
                    txFlowEvents={explorer.txFlowEvents}
                    tokenInfo={explorer.tokenInfo}
                    wallets={explorer.wallets}
                  />
                </FloatingWindow>
              )}
            </div>

            {/* Bottom toolbar */}
            <ZooToolbar
              openPanels={openPanels}
              onToggle={togglePanel}
              money={merchantBalance}
              blockHeight={networkStats?.latest_block}
              connected={connected}
            />
          </div>
        )}
      </div>
    </div>
  );
}
