import type { TransactionFlowEvent, TxFlowStage } from "../../lib/types";
import { ANIMAL_EMOJI, formatGuestLabel } from "../../utils/formatting";

interface TransactionFlowVizProps {
  events: TransactionFlowEvent[];
}

const STAGES: { stage: TxFlowStage; label: string; short: string }[] = [
  { stage: "decision", label: "Decision", short: "DEC" },
  { stage: "checkout_created", label: "Checkout", short: "CHK" },
  { stage: "signing", label: "Sign Tx", short: "SGN" },
  { stage: "broadcast", label: "Broadcast", short: "BRD" },
  { stage: "block_inclusion", label: "In Block", short: "BLK" },
  { stage: "confirmed", label: "Confirmed", short: "CFM" },
  { stage: "merchant_verified", label: "Verified", short: "VER" },
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
        const agentEmoji = ANIMAL_EMOJI[flow.agentId] ?? "🧑";
        const activeStageIndex = getStageIndex(flow.latestEvent.stage);

        return (
          <div key={flow.agentId} className="zt-inset px-3 py-2" style={{ background: "rgba(0,0,0,0.2)" }}>
            {/* Agent header + TX hash */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <span className="text-sm">{agentEmoji}</span>
                <span className="font-pixel text-[9px] text-[var(--zt-tan)]">
                  {flow.agentId}
                </span>
              </div>
              {flow.txHash && (
                <a
                  href={`${EXPLORER_URL}/tx/${flow.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[8px] text-[var(--zt-green-light)] hover:text-[var(--zt-gold)] hover:underline"
                >
                  {flow.txHash.slice(0, 8)}..
                </a>
              )}
            </div>

            {/* Pipeline as segmented progress bar */}
            <div className="flex gap-[2px]">
              {STAGES.map((s, i) => {
                const isCompleted = i <= flow.highestStageIndex;
                const isActive = i === activeStageIndex;

                return (
                  <div
                    key={s.stage}
                    className="flex-1 flex flex-col items-center gap-0.5"
                    title={s.label}
                  >
                    {/* Bar segment */}
                    <div
                      className={`w-full h-[6px] transition-all duration-300 ${
                        isActive
                          ? "bg-[var(--zt-gold)] zt-tx-pulse"
                          : isCompleted
                            ? "bg-emerald-500"
                            : "bg-gray-700"
                      }`}
                    />
                    {/* Label */}
                    <span
                      className={`font-pixel text-[6px] leading-none ${
                        isActive
                          ? "text-[var(--zt-gold)]"
                          : isCompleted
                            ? "text-emerald-400/70"
                            : "text-gray-600"
                      }`}
                    >
                      {s.short}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
