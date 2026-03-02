import type { ZooAgentState } from "../../lib/types";
import { formatGuestLabel } from "../../utils/formatting";

interface AgentCardProps {
  agent: ZooAgentState;
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

export default function AgentCard({ agent }: AgentCardProps) {
  return (
    <div className="zt-bevel overflow-hidden">
      {/* Green title bar */}
      <div className="zt-titlebar flex items-center justify-between overflow-hidden">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`inline-block w-2 h-2 shrink-0 ${statusDot(agent.status)}`} />
          <span className="truncate">{formatGuestLabel(agent.agent_id, agent.address)}</span>
        </div>
        <span className="text-[10px] opacity-70 shrink-0 ml-2">{agent.status}</span>
      </div>

      {/* Dark green body */}
      <div className="bg-[var(--zt-green-dark)] px-4 py-4 space-y-3">
        {/* Food need bar */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="font-pixel text-[10px] text-[var(--zt-tan)]">🍖 Food</span>
            <span className="font-pixel text-[10px] text-gray-400">{agent.needs.food_need}</span>
          </div>
          <div className="zt-bar-track">
            <div
              className={needBarClass(agent.needs.food_need)}
              style={{ width: `${Math.min(agent.needs.food_need, 100)}%` }}
            />
          </div>
        </div>

        {/* Fun need bar */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="font-pixel text-[10px] text-[var(--zt-tan)]">🎪 Fun</span>
            <span className="font-pixel text-[10px] text-gray-400">{agent.needs.fun_need}</span>
          </div>
          <div className="zt-bar-track">
            <div
              className={needBarClass(agent.needs.fun_need)}
              style={{ width: `${Math.min(agent.needs.fun_need, 100)}%` }}
            />
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center justify-between pt-1 border-t border-[var(--zt-green-mid)]">
          <span className="font-pixel text-[10px] text-[var(--zt-gold)]">
            🪙 ${agent.balance} AUSD
          </span>
          <span className="font-pixel text-[10px] text-gray-500">
            {agent.purchase_count} buy{agent.purchase_count !== 1 ? "s" : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
