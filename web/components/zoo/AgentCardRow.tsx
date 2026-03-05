import type { ZooAgentState } from "../../lib/types";
import AgentCard from "./AgentCard";
import { ANIMAL_EMOJI } from "../../utils/formatting";

interface AgentCardRowProps {
  agents: ZooAgentState[];
}

const ANIMAL_EMOJI_LIST = Object.values(ANIMAL_EMOJI);

export default function AgentCardRow({ agents }: AgentCardRowProps) {
  if (agents.length === 0) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 px-5 py-5">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="zt-bevel overflow-hidden"
          >
            <div className="zt-titlebar">
              Guest: --- {ANIMAL_EMOJI_LIST[i - 1]}
            </div>
            <div className="bg-[var(--zt-green-dark)] px-3 py-6 flex items-center justify-center">
              <span className="font-pixel text-[8px] text-gray-600">offline</span>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 px-5 py-5">
      {agents.map((agent) => (
        <AgentCard key={agent.agent_id} agent={agent} selected={false} isPurchasing={false} onClick={() => {}} />
      ))}
    </div>
  );
}
