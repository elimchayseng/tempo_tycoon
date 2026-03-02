import { useWebSocket } from "./hooks/useWebSocket";
import { useZoo } from "./hooks/useZoo";
import ZooHeader from "./components/zoo/ZooHeader";
import PreflightPanel from "./components/zoo/PreflightPanel";
import AgentCardRow from "./components/zoo/AgentCardRow";
import ReceiptFeed from "./components/zoo/ReceiptFeed";
import ZooFooter from "./components/zoo/ZooFooter";

export default function App() {
  const { connected, accounts, zooAgents, receipts } = useWebSocket();
  const {
    phase,
    preflightChecks,
    error,
    startPreflight,
    openGates,
    stopZoo,
    restart,
  } = useZoo();

  const showPreflight = phase === "preflight" || phase === "ready";
  const showDashboard = phase === "running" || phase === "starting" || phase === "stopping";
  const zooMaster = accounts.find(a => a.label === "Zoo Master");

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-gray-100">
      <ZooHeader
        phase={phase}
        connected={connected}
        error={error}
        onStartPreflight={startPreflight}
        onOpenGates={openGates}
        onStopZoo={stopZoo}
        onRestart={restart}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Idle state */}
        {phase === "idle" && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-300 mb-2">
                <span className="text-[var(--zoo-green-light)]">Zoo Tycoon</span> Dashboard
              </h2>
              <p className="text-sm text-gray-500 mb-6">
                Autonomous agent commerce on Tempo Moderato Testnet
              </p>
              <button
                onClick={startPreflight}
                className="px-6 py-2.5 text-sm font-medium rounded-lg bg-[var(--zoo-green)] hover:bg-[var(--zoo-green-light)] text-white transition-colors"
              >
                Start Zoo
              </button>
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
            <div className="border-b border-gray-800/60 shrink-0">
              <AgentCardRow agents={zooAgents} />
            </div>
            <ReceiptFeed receipts={receipts} />
          </>
        )}
      </div>

      {showDashboard && <ZooFooter zooMaster={zooMaster} />}
    </div>
  );
}
