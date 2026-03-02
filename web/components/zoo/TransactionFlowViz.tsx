import type { TransactionFlowEvent, TxFlowStage } from "../../lib/types";
import { ANIMAL_EMOJI } from "../../utils/formatting";

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

export default function TransactionFlowViz({ events }: TransactionFlowVizProps) {
  // Group events by agent, get latest flow per agent
  const latestByAgent = new Map<string, TransactionFlowEvent>();
  for (const ev of events) {
    const existing = latestByAgent.get(ev.agent_id);
    if (!existing || ev.timestamp > existing.timestamp) {
      latestByAgent.set(ev.agent_id, ev);
    }
  }

  // Get the most recent active transaction (highest timestamp)
  let activeEvent: TransactionFlowEvent | null = null;
  for (const ev of latestByAgent.values()) {
    if (!activeEvent || ev.timestamp > activeEvent.timestamp) {
      activeEvent = ev;
    }
  }

  // Collect all events for the active agent's current flow
  const activeAgentId = activeEvent?.agent_id;
  const activeFlowEvents = activeAgentId
    ? events.filter((e) => e.agent_id === activeAgentId)
    : [];

  // Find the highest reached stage
  let highestStageIndex = -1;
  let txHash: string | null = null;
  for (const ev of activeFlowEvents) {
    const idx = getStageIndex(ev.stage);
    if (idx > highestStageIndex) highestStageIndex = idx;
    if (ev.data?.tx_hash) txHash = ev.data.tx_hash as string;
  }

  const activeStageIndex = activeEvent ? getStageIndex(activeEvent.stage) : -1;

  if (!activeEvent) {
    return (
      <div className="px-3 py-4 text-center">
        <span className="font-pixel text-[8px] text-gray-500">
          Waiting for transactions...
        </span>
        <div className="mt-3 space-y-2">
          {STAGES.map((s) => (
            <div key={s.stage} className="flex items-center gap-2 opacity-30">
              <span className="text-sm w-6 text-center">{s.icon}</span>
              <span className="font-pixel text-[7px] text-gray-500">{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const agentEmoji = ANIMAL_EMOJI[activeAgentId!] ?? "🦊";

  return (
    <div className="px-3 py-3 space-y-2">
      {/* Active agent */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{agentEmoji}</span>
        <span className="font-pixel text-[8px] text-[var(--zt-tan)]">
          {activeAgentId}
        </span>
      </div>

      {/* Pipeline */}
      <div className="space-y-1">
        {STAGES.map((s, i) => {
          const isCompleted = i < highestStageIndex;
          const isActive = i === activeStageIndex;
          const isPending = i > highestStageIndex;

          return (
            <div
              key={s.stage}
              className={`flex items-center gap-2 px-2 py-1.5 transition-all ${
                isActive
                  ? "zt-inset zt-tx-pulse"
                  : isCompleted
                    ? "opacity-80"
                    : "opacity-30"
              }`}
              style={
                isActive
                  ? { background: "rgba(255,215,0,0.08)" }
                  : isCompleted
                    ? { background: "rgba(76,175,80,0.06)" }
                    : {}
              }
            >
              {/* Status icon */}
              <span className="text-sm w-6 text-center">
                {isCompleted ? "✅" : isActive ? s.icon : "○"}
              </span>

              {/* Label */}
              <span
                className={`font-pixel text-[8px] flex-1 ${
                  isActive
                    ? "text-[var(--zt-gold)]"
                    : isCompleted
                      ? "text-emerald-400"
                      : "text-gray-500"
                }`}
              >
                {s.label}
              </span>

              {/* Connector line */}
              {i < STAGES.length - 1 && (
                <div
                  className={`absolute left-[22px] w-px h-2 ${
                    isCompleted ? "bg-emerald-400/40" : "bg-gray-600/20"
                  }`}
                  style={{ marginTop: "26px" }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* TX Hash link */}
      {txHash && (
        <div className="mt-2 pt-2 border-t border-dashed border-[var(--zt-green-mid)]">
          <div className="font-pixel text-[7px] text-gray-400 mb-1">TX HASH</div>
          <a
            href={`${EXPLORER_URL}/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[8px] text-[var(--zt-green-light)] hover:underline break-all"
          >
            {txHash}
          </a>
        </div>
      )}
    </div>
  );
}
