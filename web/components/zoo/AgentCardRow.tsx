import type { ZooAgentState } from "../../lib/types";
import AgentCard from "./AgentCard";

interface AgentCardRowProps {
  agents: ZooAgentState[];
}

export default function AgentCardRow({ agents }: AgentCardRowProps) {
  if (agents.length === 0) {
    return (
      <div className="grid grid-cols-3 gap-4 px-5 py-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-gray-900/40 border border-gray-800/50 rounded-lg p-4 h-36 flex items-center justify-center"
          >
            <span className="text-xs text-gray-600">Agent {i} offline</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-4 px-5 py-4">
      {agents.map((agent) => (
        <AgentCard key={agent.agent_id} agent={agent} />
      ))}
    </div>
  );
}
