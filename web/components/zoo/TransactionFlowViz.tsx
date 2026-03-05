import type { TransactionFlowEvent, TxFlowStage } from "../../lib/types";
import { ANIMAL_EMOJI, formatGuestLabel } from "../../utils/formatting";

interface TransactionFlowVizProps {
  events: TransactionFlowEvent[];
}

const STAGES: { stage: TxFlowStage; label: string; icon: string }[] = [
  { stage: "decision", label: "Decision", icon: "🤔" },
  { stage: "checkout_created", label: "Checkout", icon: "🛒" },
  { stage: "signing", label: "Sign Tx", icon: "🔐" },
  { stage: "broadcast", label: "Broadcast", icon: "📡" },
  { stage: "block_inclusion", label: "In Block", icon: "⛓️" },
  { stage: "confirmed", label: "Confirmed", icon: "✅" },
  { stage: "merchant_verified", label: "Verified", icon: "🏪" },
];

function getStageIndex(stage: TxFlowStage): number {
  return STAGES.findIndex((s) => s.stage === stage);
}

const EXPLORER_URL = "https://explore.moderato.tempo.xyz";

// Cutoff: only consider events from the last 30 seconds as "active"
const ACTIVE_WINDOW_MS = 30_000;

interface AgentFlow {
  agentId: string;
  events: TransactionFlowEvent[];
  latestEvent: TransactionFlowEvent;
  highestStageIndex: number;
  txHash: string | null;
}

export default function TransactionFlowViz({ events }: TransactionFlowVizProps) {
  const now = Date.now();

  // Group events by agent
  const byAgent = new Map<string, TransactionFlowEvent[]>();
  for (const ev of events) {
    const list = byAgent.get(ev.agent_id) ?? [];
    list.push(ev);
    byAgent.set(ev.agent_id, list);
  }

  // Build flow data per agent, filter to active ones
  const agentFlows: AgentFlow[] = [];
  for (const [agentId, agentEvents] of byAgent) {
    const latest = agentEvents.reduce((a, b) => (b.timestamp > a.timestamp ? b : a));

    // Only show agents with recent activity
    if (now - latest.timestamp > ACTIVE_WINDOW_MS) continue;

    let highestStageIndex = -1;
    let txHash: string | null = null;
    for (const ev of agentEvents) {
      const idx = getStageIndex(ev.stage);
      if (idx > highestStageIndex) highestStageIndex = idx;
      if (ev.data?.tx_hash) txHash = ev.data.tx_hash as string;
    }

    agentFlows.push({ agentId, events: agentEvents, latestEvent: latest, highestStageIndex, txHash });
  }

  // Sort by most recent activity first
  agentFlows.sort((a, b) => b.latestEvent.timestamp - a.latestEvent.timestamp);

  if (agentFlows.length === 0) {
    return (
      <div className="px-3 py-3 text-center">
        <span className="font-pixel text-[11px] text-gray-500">
          Waiting for transactions...
        </span>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 space-y-3">
      {agentFlows.map((flow) => {
        const agentEmoji = ANIMAL_EMOJI[flow.agentId] ?? "🦊";
        const activeStageIndex = getStageIndex(flow.latestEvent.stage);

        return (
          <div key={flow.agentId} className="zt-inset px-3 py-2.5" style={{ background: "rgba(0,0,0,0.2)" }}>
            {/* Agent header */}
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-base">{agentEmoji}</span>
              <span className="font-pixel text-[11px] text-[var(--zt-tan)]">
                {formatGuestLabel(flow.agentId)}
              </span>
            </div>

            {/* Compact pipeline */}
            <div className="flex items-center gap-1 flex-wrap">
              {STAGES.map((s, i) => {
                const isCompleted = i < flow.highestStageIndex;
                const isActive = i === activeStageIndex;
                const isPending = i > flow.highestStageIndex;

                return (
                  <div
                    key={s.stage}
                    className={`flex items-center gap-0.5 px-1.5 py-1 text-[10px] font-pixel ${
                      isActive
                        ? "text-[var(--zt-gold)] zt-tx-pulse"
                        : isCompleted
                          ? "text-emerald-400 opacity-80"
                          : "text-gray-600 opacity-40"
                    }`}
                    title={s.label}
                  >
                    <span className="text-[11px]">
                      {isCompleted ? "✅" : isActive ? s.icon : "○"}
                    </span>
                    <span className="hidden xl:inline">{s.label}</span>
                    {i < STAGES.length - 1 && (
                      <span className={`mx-0.5 ${isCompleted ? "text-emerald-400/40" : "text-gray-600/20"}`}>→</span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* TX Hash */}
            {flow.txHash && (
              <div className="mt-1.5">
                <a
                  href={`${EXPLORER_URL}/tx/${flow.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[10px] text-[var(--zt-green-light)] hover:text-[var(--zt-gold)] hover:underline"
                >
                  tx: {flow.txHash.slice(0, 10)}...{flow.txHash.slice(-4)}
                </a>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
