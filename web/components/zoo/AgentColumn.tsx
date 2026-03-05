import { useState, useEffect, useRef } from "react";
import type { ZooAgentState, ZooLLMDecision, TransactionFlowEvent, TxFlowStage } from "../../lib/types";
import { ANIMAL_EMOJI, formatGuestLabel } from "../../utils/formatting";
import { useTypewriter } from "../../hooks/useTypewriter";
import AgentCard from "./AgentCard";

interface AgentColumnProps {
  agents: ZooAgentState[];
  llmDecisions: Record<string, ZooLLMDecision>;
  txFlowEvents: TransactionFlowEvent[];
  simulationComplete?: boolean;
}

const ANIMAL_EMOJI_LIST = Object.values(ANIMAL_EMOJI);

// ACP protocol steps for buyer agents
const PROTOCOL_STEPS: { stage: TxFlowStage; label: string }[] = [
  { stage: "checkout_created", label: "checkout_create" },
  { stage: "signing", label: "signing" },
  { stage: "block_inclusion", label: "block_inclusion" },
  { stage: "merchant_verified", label: "merchant_verified" },
];

const REVEAL_DELAY_MS = 400;

function getStepDetail(stage: TxFlowStage, events: TransactionFlowEvent[]): string | null {
  const ev = events.find((e) => e.stage === stage);
  if (!ev) return null;
  const d = ev.data;
  switch (stage) {
    case "checkout_created": {
      if (d.items && Array.isArray(d.items)) {
        const skus = (d.items as Array<{ sku: string }>).map((i) => i.sku).join(", ");
        return `cart: [${skus}]`;
      }
      return d.preferred_category ? `category: ${d.preferred_category}` : null;
    }
    case "signing":
      return d.product ? `${d.product}  amount: $${d.amount ?? "?"}` : null;
    case "block_inclusion":
      return d.block_number
        ? `block #${d.block_number}${d.tx_hash ? `  tx: ${String(d.tx_hash).slice(0, 8)}...${String(d.tx_hash).slice(-4)}` : ""}`
        : null;
    case "merchant_verified":
      return d.session_id ? `session: ${String(d.session_id).slice(0, 8)}...` : null;
    default:
      return null;
  }
}

// ── LLM Response Terminal ──────────────────────────────────────
function LlmTerminal({
  decision,
  agentId,
  simulationComplete,
  agent,
}: {
  decision: ZooLLMDecision | null;
  agentId: string;
  simulationComplete?: boolean;
  agent?: ZooAgentState;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const reasoningText = decision ? decision.reasoning : "";
  const { displayed: typedReasoning, done: reasoningDone } = useTypewriter(reasoningText, 30);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [typedReasoning]);

  const emoji = ANIMAL_EMOJI[agentId] ?? "🧑";
  const label = formatGuestLabel(agentId);

  if (simulationComplete) {
    return (
      <div className="flex flex-col min-h-0 flex-[4]">
        <div className="bg-[var(--zt-green-mid)] px-2 py-1 font-pixel text-[9px] text-white shrink-0">
          🧠 LLM RESPONSE — {emoji} {agentId}
        </div>
        <div className="zt-terminal flex-1" ref={scrollRef} style={{ minHeight: 0, maxHeight: "none" }}>
          <div className="zt-terminal-header text-gray-500">{"> SIMULATION ENDED ─────────────────"}</div>
          {agent && (
            <div className="text-gray-500 mt-1">
              <span>food_need: {agent.needs.food_need}</span>
              <span className="mx-2">|</span>
              <span>balance: ${agent.balance}</span>
            </div>
          )}
          <div className="text-gray-500 mt-2">agent offline — wallet depleted</div>
        </div>
      </div>
    );
  }

  if (!decision) {
    return (
      <div className="flex flex-col min-h-0 flex-[4]">
        <div className="bg-[var(--zt-green-mid)] px-2 py-1 font-pixel text-[9px] text-white shrink-0">
          🧠 LLM RESPONSE — {emoji} {agentId}
        </div>
        <div className="zt-terminal flex-1" ref={scrollRef} style={{ minHeight: 0, maxHeight: "none" }}>
          <div className="text-gray-500">
            Waiting for next cycle...<span className="zt-cursor" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-0 flex-[4]">
      <div className="bg-[var(--zt-green-mid)] px-2 py-1 font-pixel text-[9px] text-white shrink-0">
        🧠 LLM RESPONSE — {emoji} {agentId}
      </div>
      <div className="zt-terminal flex-1 overflow-y-auto" ref={scrollRef} style={{ minHeight: 0, maxHeight: "none" }}>
        {/* Context */}
        <div className="zt-terminal-header">{"> CONTEXT ──────────────────────────"}</div>
        <div className="text-gray-400">
          <span>food_need: {String(decision.context_summary?.food_need ?? "?")}</span>
          <span className="mx-2">|</span>
          <span>balance: ${String(decision.context_summary?.balance ?? "?")}</span>
          <br />
          <span>catalog: {String(decision.context_summary?.catalog_size ?? "?")} items</span>
          <span className="mx-2">|</span>
          <span>recent: {String(decision.context_summary?.recent_purchases ?? "?")} purchases</span>
        </div>

        {/* LLM Tool Call */}
        <div className="zt-terminal-header" style={{ color: "var(--zt-gold)" }}>
          {"> \u{1F9E0} LLM TOOL CALL ────────────────"}
        </div>
        <div style={{ color: "var(--zt-gold)" }}>
          {decision.model && (
            <div>
              <span className="text-gray-500">{"  model: "}</span>
              {decision.model}
            </div>
          )}
          <div>
            <span className="text-gray-500">{"  tool:  "}</span>
            {decision.toolName}
          </div>
          {decision.tokenUsage && (
            <div>
              <span className="text-gray-500">{"  tokens: "}</span>
              {decision.tokenUsage.promptTokens} prompt / {decision.tokenUsage.completionTokens} completion
            </div>
          )}
          <div className="mt-2">
            <span className="text-gray-500">{"  reasoning: "}</span>
            <span>"{typedReasoning}</span>
            {!reasoningDone && <span className="zt-cursor" />}
            {reasoningDone && <span>"</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── ACP Chain Event Terminal ──────────────────────────────────
function AcpTerminal({
  decision,
  txFlowEvents,
  agentId,
  simulationComplete,
}: {
  decision: ZooLLMDecision | null;
  txFlowEvents: TransactionFlowEvent[];
  agentId: string;
  simulationComplete?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [visibleStages, setVisibleStages] = useState<Set<TxFlowStage>>(new Set());
  const decisionTimestampRef = useRef<number>(0);

  const decisionTs = decision?.timestamp ?? 0;
  const agentTxEvents = txFlowEvents.filter(
    (e) => e.agent_id === agentId && e.timestamp >= decisionTs
  );
  const completedStages = new Set(agentTxEvents.map((e) => e.stage));
  const isPurchasing = decision?.action.type === "purchase";

  // Reset visible stages when a new decision arrives
  useEffect(() => {
    const ts = decision?.timestamp ?? 0;
    if (ts !== decisionTimestampRef.current) {
      decisionTimestampRef.current = ts;
      setVisibleStages(new Set());
    }
  }, [decision?.timestamp]);

  // Reveal completed stages with delay
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const { stage } of PROTOCOL_STEPS) {
      if (completedStages.has(stage) && !visibleStages.has(stage)) {
        const t = setTimeout(() => {
          setVisibleStages((prev) => new Set([...prev, stage]));
        }, REVEAL_DELAY_MS);
        timers.push(t);
        break;
      }
    }
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedStages.size, visibleStages.size]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [visibleStages]);

  const emoji = ANIMAL_EMOJI[agentId] ?? "🧑";
  const label = formatGuestLabel(agentId);

  return (
    <div className="flex flex-col min-h-0 flex-[3]">
      <div className="bg-[var(--zt-green-mid)] px-2 py-1 font-pixel text-[9px] text-white shrink-0">
        ⛓️ ACP PROTOCOL — {emoji} {agentId}
      </div>
      <div className="zt-terminal flex-1 overflow-y-auto" ref={scrollRef} style={{ minHeight: 0, maxHeight: "none" }}>
        {simulationComplete ? (
          <div className="text-gray-500">agent offline</div>
        ) : !decision || !isPurchasing ? (
          <div className="text-gray-500">
            {isPurchasing ? "" : "No active purchase"}<span className="zt-cursor" />
          </div>
        ) : (
          <div>
            {PROTOCOL_STEPS.map(({ stage, label: stepLabel }) => {
              const isDone = visibleStages.has(stage);
              const isActive =
                !isDone &&
                PROTOCOL_STEPS.findIndex((s) => !visibleStages.has(s.stage)) ===
                  PROTOCOL_STEPS.findIndex((s) => s.stage === stage) &&
                completedStages.size > 0;
              const icon = isDone ? "✓" : isActive ? "●" : "○";
              const className = isDone
                ? "zt-step-done"
                : isActive
                  ? "zt-step-active"
                  : "zt-step-pending";
              const detail = isDone ? getStepDetail(stage, agentTxEvents) : null;

              return (
                <div key={stage} className={`${className} zt-step-fade`}>
                  <span>{"  "}{icon} {stepLabel}</span>
                  {detail && (
                    <div className="text-gray-500 ml-6" style={{ fontSize: "10px" }}>
                      {"    "}{detail}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main AgentColumn ──────────────────────────────────────────
export default function AgentColumn({ agents, llmDecisions, txFlowEvents, simulationComplete }: AgentColumnProps) {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  // Default to first agent
  useEffect(() => {
    if (agents.length > 0 && !selectedAgentId) {
      setSelectedAgentId(agents[0].agent_id);
    }
  }, [agents, selectedAgentId]);

  const selectedAgent = agents.find((a) => a.agent_id === selectedAgentId);
  const selectedDecision = selectedAgentId ? llmDecisions[selectedAgentId] ?? null : null;

  // Empty state
  if (agents.length === 0) {
    return (
      <div className="h-full flex flex-col p-2 space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="zt-bevel overflow-hidden">
            <div className="bg-[var(--zt-green-mid)] px-2 py-1.5 font-pixel text-[7px] text-white">
              {ANIMAL_EMOJI_LIST[i]} Guest: --- offline
            </div>
            <div className="bg-[var(--zt-green-dark)] px-2 py-3 text-center">
              <span className="font-pixel text-[7px] text-gray-600">offline</span>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-2 space-y-2 overflow-hidden">
      {/* Agent cards */}
      <div className="space-y-1.5 shrink-0">
        {agents.map((agent) => (
          <AgentCard
            key={agent.agent_id}
            agent={agent}
            selected={agent.agent_id === selectedAgentId}
            isPurchasing={agent.status === "purchasing"}
            onClick={() => setSelectedAgentId(agent.agent_id)}
            simulationComplete={simulationComplete}
          />
        ))}
      </div>

      {/* Terminal windows */}
      <div className="flex-1 flex flex-col min-h-0 space-y-1.5">
        <LlmTerminal
          decision={selectedDecision}
          agentId={selectedAgentId ?? "guest_1"}
          simulationComplete={simulationComplete}
          agent={selectedAgent}
        />
        <AcpTerminal
          decision={selectedDecision}
          txFlowEvents={txFlowEvents}
          agentId={selectedAgentId ?? "guest_1"}
          simulationComplete={simulationComplete}
        />
      </div>
    </div>
  );
}
