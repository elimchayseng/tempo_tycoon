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
    <header className="zt-statusbar flex items-center justify-between px-5 py-2.5 shrink-0">
      <div className="flex items-center gap-3">
        <h1 className="font-pixel text-sm text-white" style={{ textShadow: "2px 2px 0 rgba(0,0,0,0.5)" }}>
          <span className="text-[var(--zt-gold)]">Tempo</span>{" "}
          <span>Tycoon</span>
        </h1>
        <span className="font-pixel text-[7px] text-[var(--zt-tan)] opacity-70">
          Moderato
        </span>
      </div>

      <div className="flex items-center gap-3">
        {error && (
          <span className="font-pixel text-[7px] text-red-400 max-w-60 truncate">{error}</span>
        )}

        {/* Phase-aware controls */}
        {phase === "idle" && (
          <button onClick={onStartPreflight} className="zt-btn">
            Start Zoo
          </button>
        )}

        {(phase === "preflight" || phase === "ready") && (
          <div className="flex items-center gap-2">
            {phase === "ready" && (
              <button onClick={onOpenGates} className="zt-btn-brown">
                Open Gates
              </button>
            )}
            <button onClick={onRestart} className="zt-btn">
              Cancel
            </button>
          </div>
        )}

        {phase === "starting" && (
          <span className="font-pixel text-[8px] text-[var(--zt-gold)] animate-pulse">
            Starting agents...
          </span>
        )}

        {phase === "running" && (
          <button onClick={onStopZoo} className="zt-btn" style={{
            background: "linear-gradient(180deg, #c0392b 0%, #8b1a1a 100%)",
            borderColor: "#e06050 #4a0e0e #4a0e0e #e06050",
          }}>
            Stop Zoo
          </button>
        )}

        {phase === "stopping" && (
          <span className="font-pixel text-[8px] text-[var(--zt-gold)] animate-pulse">
            Stopping...
          </span>
        )}

        {/* Connection indicator */}
        <div className="zt-inset px-2 py-1 flex items-center gap-1.5" style={{ background: "rgba(0,0,0,0.3)" }}>
          <span
            className={`inline-block w-2 h-2 ${
              connected ? "bg-emerald-400" : "bg-red-500"
            }`}
          />
          <span className="font-pixel text-[7px] text-gray-300">
            {connected ? "ON" : "OFF"}
          </span>
        </div>
      </div>
    </header>
  );
}
