import type { ZooAgentState, ZooLLMDecision, TransactionFlowEvent } from "../../lib/types";
import AgentBrainPanel from "./AgentBrainPanel";
import { ANIMAL_EMOJI } from "../../utils/formatting";

interface AgentBrainRowProps {
  agents: ZooAgentState[];
  llmDecisions: Record<string, ZooLLMDecision>;
  txFlowEvents: TransactionFlowEvent[];
  simulationComplete?: boolean;
}

const ANIMAL_EMOJI_LIST = Object.values(ANIMAL_EMOJI);

export default function AgentBrainRow({ agents, llmDecisions, txFlowEvents, simulationComplete }: AgentBrainRowProps) {
  if (agents.length === 0) {
    return (
      <div className="space-y-4 px-5 py-5">
        {[1, 2, 3].map((i) => (
          <div key={i} className="zt-bevel overflow-hidden">
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
    <div className="space-y-4 px-5 py-5">
      {agents.map((agent) => (
        <AgentBrainPanel
          key={agent.agent_id}
          agent={agent}
          decision={llmDecisions[agent.agent_id] ?? null}
          txFlowEvents={txFlowEvents}
          simulationComplete={simulationComplete}
        />
      ))}
    </div>
  );
}
