import type { ZooAgentState } from "../../lib/types";
import { shortAddr, ANIMAL_EMOJI } from "../../utils/formatting";

interface AgentCardProps {
  agent: ZooAgentState;
  selected: boolean;
  isPurchasing: boolean;
  onClick: () => void;
  simulationComplete?: boolean;
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

export default function AgentCard({ agent, selected, isPurchasing, onClick, simulationComplete }: AgentCardProps) {
  const displayStatus = simulationComplete ? "decommissioned" : agent.status;
  const dotClass = simulationComplete ? "bg-gray-500" : statusDot(agent.status);
  const emoji = ANIMAL_EMOJI[agent.agent_id] ?? "🦊";

  let borderClass = "";
  if (selected) {
    borderClass = "zt-card-glow-gold";
  } else if (isPurchasing && !simulationComplete) {
    borderClass = "zt-card-glow-purchasing";
  }

  return (
    <button
      onClick={onClick}
      className={`w-full text-left zt-bevel overflow-hidden transition-all ${borderClass}`}
    >
      {/* Compact title row */}
      <div className="bg-[var(--zt-green-mid)] px-2 py-1.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`inline-block w-2 h-2 shrink-0 rounded-full ${dotClass}`} />
          <span className="text-sm">{emoji}</span>
          <span className="font-pixel text-[7px] text-white truncate">
            Guest:{" "}
            {agent.address ? (
              <a
                href={`https://explore.moderato.tempo.xyz/address/${agent.address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--zt-green-light)] hover:text-[var(--zt-gold)] hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {shortAddr(agent.address)}
              </a>
            ) : (
              <span>{agent.agent_id}</span>
            )}
            {" "}{emoji}
          </span>
        </div>
        <span className="font-pixel text-[8px] text-[var(--zt-gold)] shrink-0 ml-1">
          ${agent.balance}
        </span>
      </div>

      {/* Body: needs + stats */}
      <div className="bg-[var(--zt-green-dark)] px-2 py-1.5 space-y-1">
        {/* Need bars inline */}
        <div className="flex items-center gap-2">
          <span className="font-pixel text-[7px] text-[var(--zt-tan)] w-6">Fd:{agent.needs.food_need}</span>
          <div className="zt-bar-track flex-1" style={{ height: 8 }}>
            <div
              className={needBarClass(agent.needs.food_need)}
              style={{ width: `${Math.min(agent.needs.food_need, 100)}%` }}
            />
          </div>
          <span className="font-pixel text-[7px] text-[var(--zt-tan)] w-6">Fn:{agent.needs.fun_need}</span>
          <div className="zt-bar-track flex-1" style={{ height: 8 }}>
            <div
              className={needBarClass(agent.needs.fun_need)}
              style={{ width: `${Math.min(agent.needs.fun_need, 100)}%` }}
            />
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center justify-between">
          <span className="font-pixel text-[7px] text-gray-400">
            {agent.purchase_count} buy{agent.purchase_count !== 1 ? "s" : ""}
          </span>
          <span className={`font-pixel text-[6px] ${simulationComplete ? "text-gray-500" : "opacity-70 text-gray-400"}`}>
            {displayStatus}
          </span>
        </div>
      </div>
    </button>
  );
}
