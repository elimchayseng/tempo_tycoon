import { useWebSocket } from "./hooks/useWebSocket";
import ActionPanel from "./components/ActionPanel";
import InteractionLog from "./components/InteractionLog";

export default function App() {
  const { logs, accounts, connected, activeAction, clearLogs } =
    useWebSocket();

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-gray-800/80 bg-gray-900/80 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-bold tracking-tight">
            <span className="text-indigo-400">Tempo</span> Explorer
          </h1>
          <span className="text-[10px] text-gray-600 font-mono bg-gray-800/50 px-1.5 py-0.5 rounded">
            Moderato Testnet
          </span>
        </div>
        <div className="flex items-center gap-3">
          {activeAction && (
            <span className="text-xs text-yellow-400/80 animate-pulse font-mono">
              {activeAction}...
            </span>
          )}
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

      {/* Two-panel layout */}
      <div className="flex flex-1 min-h-0">
        {/* Left: Actions */}
        <aside className="w-72 border-r border-gray-800/80 bg-gray-900/30 shrink-0 overflow-hidden">
          <ActionPanel accounts={accounts} activeAction={activeAction} />
        </aside>

        {/* Right: Log */}
        <main className="flex-1 min-w-0">
          <InteractionLog logs={logs} onClear={clearLogs} />
        </main>
      </div>
    </div>
  );
}
