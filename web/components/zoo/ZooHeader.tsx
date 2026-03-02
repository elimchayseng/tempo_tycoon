import type { ZooPhase } from "../../hooks/useZoo";

interface ZooHeaderProps {
  phase: ZooPhase;
  connected: boolean;
  error: string | null;
  onStartPreflight: () => void;
  onOpenGates: () => void;
  onStopZoo: () => void;
  onRestart: () => void;
}

export default function ZooHeader({
  phase,
  connected,
  error,
  onStartPreflight,
  onOpenGates,
  onStopZoo,
  onRestart,
}: ZooHeaderProps) {
  return (
    <header className="flex items-center justify-between px-5 py-3 border-b border-gray-800/80 bg-gray-900/80 backdrop-blur-sm shrink-0">
      <div className="flex items-center gap-3">
        <h1 className="text-base font-bold tracking-tight">
          <span className="text-[var(--zoo-green)]">Zoo</span>{" "}
          <span className="text-gray-100">Tycoon</span>
        </h1>
        <span className="text-[10px] text-gray-600 font-mono bg-gray-800/50 px-1.5 py-0.5 rounded">
          Moderato Testnet
        </span>
      </div>

      <div className="flex items-center gap-3">
        {error && (
          <span className="text-xs text-red-400 max-w-60 truncate">{error}</span>
        )}

        {/* Phase-aware controls */}
        {phase === "idle" && (
          <button
            onClick={onStartPreflight}
            className="px-3 py-1.5 text-xs font-medium rounded bg-[var(--zoo-green)] hover:bg-[var(--zoo-green-light)] text-white transition-colors"
          >
            Start Zoo
          </button>
        )}

        {(phase === "preflight" || phase === "ready") && (
          <div className="flex items-center gap-2">
            {phase === "ready" && (
              <button
                onClick={onOpenGates}
                className="px-3 py-1.5 text-xs font-medium rounded bg-[var(--zoo-brown)] hover:brightness-110 text-white transition-colors"
              >
                Open Gates
              </button>
            )}
            <button
              onClick={onRestart}
              className="px-3 py-1.5 text-xs font-medium rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {phase === "starting" && (
          <span className="text-xs text-yellow-400/80 animate-pulse font-mono">
            Starting agents...
          </span>
        )}

        {phase === "running" && (
          <button
            onClick={onStopZoo}
            className="px-3 py-1.5 text-xs font-medium rounded bg-red-700 hover:bg-red-600 text-white transition-colors"
          >
            Stop Zoo
          </button>
        )}

        {phase === "stopping" && (
          <span className="text-xs text-yellow-400/80 animate-pulse font-mono">
            Stopping...
          </span>
        )}

        {/* Connection indicator */}
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full ${
              connected ? "bg-emerald-400" : "bg-red-500"
            }`}
          />
          <span className="text-[10px] text-gray-500">
            {connected ? "connected" : "disconnected"}
          </span>
        </div>
      </div>
    </header>
  );
}
