import type { ZooAgentState, ZooLLMDecision, TransactionFlowEvent } from "../../lib/types";
import { formatGuestLabel } from "../../utils/formatting";
import BrainTerminal from "./BrainTerminal";

interface AgentBrainPanelProps {
  agent: ZooAgentState;
  decision: ZooLLMDecision | null;
  txFlowEvents: TransactionFlowEvent[];
}

function needBarClass(value: number): string {
  if (value > 60) return "zt-bar-fill zt-bar-fill-green";
  if (value > 30) return "zt-bar-fill zt-bar-fill-yellow";
  return "zt-bar-fill zt-bar-fill-red";
}

function statusDot(status: string): string {
  switch (status) {
    case "online":
    case "purchasing":
      return "bg-emerald-400";
    case "offline":
      return "bg-gray-500";
    default:
      return "bg-yellow-400";
  }
}

export default function AgentBrainPanel({ agent, decision, txFlowEvents }: AgentBrainPanelProps) {
  return (
    <div className="zt-bevel overflow-hidden">
      {/* Title bar */}
      <div className="zt-titlebar flex items-center justify-between overflow-hidden">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`inline-block w-2 h-2 shrink-0 rounded-full ${statusDot(agent.status)}`} />
          <span className="truncate">{formatGuestLabel(agent.agent_id, agent.address)}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-2">
          <span className="text-[9px] opacity-70">{agent.status}</span>
          <span className="text-[10px] text-[var(--zt-gold)]">
            🪙 ${agent.balance}
          </span>
        </div>
      </div>

      {/* Body: sidebar + terminal */}
      <div className="bg-[var(--zt-green-dark)] flex">
        {/* Left sidebar — needs + stats */}
        <div className="shrink-0 px-4 py-4 space-y-3" style={{ width: 180 }}>
          {/* Food need */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="font-pixel text-[9px] text-[var(--zt-tan)]">🍖 Food</span>
              <span className="font-pixel text-[9px] text-gray-400">{agent.needs.food_need}</span>
            </div>
            <div className="zt-bar-track">
              <div
                className={needBarClass(agent.needs.food_need)}
                style={{ width: `${Math.min(agent.needs.food_need, 100)}%` }}
              />
            </div>
          </div>

          {/* Fun need */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="font-pixel text-[9px] text-[var(--zt-tan)]">🎪 Fun</span>
              <span className="font-pixel text-[9px] text-gray-400">{agent.needs.fun_need}</span>
            </div>
            <div className="zt-bar-track">
              <div
                className={needBarClass(agent.needs.fun_need)}
                style={{ width: `${Math.min(agent.needs.fun_need, 100)}%` }}
              />
            </div>
          </div>

          {/* Stats */}
          <div className="pt-2 border-t border-[var(--zt-green-mid)] space-y-1">
            <div className="font-pixel text-[9px] text-gray-400">
              {agent.purchase_count} buy{agent.purchase_count !== 1 ? "s" : ""}
            </div>
            <div className="font-pixel text-[9px] text-gray-500">
              ${agent.total_spent} spent
            </div>
          </div>
        </div>

        {/* Right side — brain terminal */}
        <div className="flex-1 min-w-0 p-2">
          <BrainTerminal
            decision={decision}
            txFlowEvents={txFlowEvents}
            agentId={agent.agent_id}
          />
        </div>
      </div>
    </div>
  );
}
