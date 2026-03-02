import type { ZooAgentState } from "../../lib/types";

interface AgentCardProps {
  agent: ZooAgentState;
}

function needColor(value: number): string {
  if (value > 60) return "bg-emerald-500";
  if (value > 30) return "bg-yellow-500";
  return "bg-red-500";
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

function formatAgentName(id: string): string {
  return id
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AgentCard({ agent }: AgentCardProps) {
  return (
    <div className="bg-gray-900/60 border border-gray-800 rounded-lg p-4">
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`inline-block w-2 h-2 rounded-full ${statusDot(agent.status)}`} />
          <span className="text-sm font-medium text-gray-200">
            {formatAgentName(agent.agent_id)}
          </span>
        </div>
        <span className="text-xs text-gray-500 font-mono">{agent.status}</span>
      </div>

      {/* Food need bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-400">Food</span>
          <span className="text-xs text-gray-500 font-mono">{agent.needs.food_need}</span>
        </div>
        <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${needColor(agent.needs.food_need)}`}
            style={{ width: `${Math.min(agent.needs.food_need, 100)}%` }}
          />
        </div>
      </div>

      {/* Fun need bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-400">Fun</span>
          <span className="text-xs text-gray-500 font-mono">{agent.needs.fun_need}</span>
        </div>
        <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${needColor(agent.needs.fun_need)}`}
            style={{ width: `${Math.min(agent.needs.fun_need, 100)}%` }}
          />
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-400">
          Balance: <span className="text-gray-200 font-mono">${agent.balance}</span>
        </span>
        <span className="text-gray-500">
          {agent.purchase_count} purchase{agent.purchase_count !== 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
}
