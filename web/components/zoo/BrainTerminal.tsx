import { useState, useEffect, useRef } from "react";
import type { ZooLLMDecision, TransactionFlowEvent, TxFlowStage } from "../../lib/types";
import { useTypewriter } from "../../hooks/useTypewriter";

interface BrainTerminalProps {
  decision: ZooLLMDecision | null;
  txFlowEvents: TransactionFlowEvent[];
  agentId: string;
}

// Only the 4 stages the server actually emits
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
      return d.product
        ? `${d.product}  amount: $${d.amount ?? "?"}`
        : null;
    case "block_inclusion":
      return d.block_number
        ? `block #${d.block_number}${d.tx_hash ? `  tx: ${String(d.tx_hash).slice(0, 8)}...${String(d.tx_hash).slice(-4)}` : ""}`
        : null;
    case "merchant_verified":
      return d.session_id
        ? `session: ${String(d.session_id).slice(0, 8)}...`
        : null;
    default:
      return null;
  }
}

export default function BrainTerminal({ decision, txFlowEvents, agentId }: BrainTerminalProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [visibleStages, setVisibleStages] = useState<Set<TxFlowStage>>(new Set());
  const decisionTimestampRef = useRef<number>(0);

  // Build reasoning text for typewriter
  const reasoningText = decision ? decision.reasoning : "";
  const { displayed: typedReasoning, done: reasoningDone } = useTypewriter(reasoningText, 30);

  // Filter tx flow events for this agent, only AFTER the current decision timestamp
  const decisionTs = decision?.timestamp ?? 0;
  const agentTxEvents = txFlowEvents.filter(
    (e) => e.agent_id === agentId && e.timestamp >= decisionTs
  );
  const completedStages = new Set(agentTxEvents.map((e) => e.stage));

  // Reset visible stages when a new decision arrives
  useEffect(() => {
    const ts = decision?.timestamp ?? 0;
    if (ts !== decisionTimestampRef.current) {
      decisionTimestampRef.current = ts;
      setVisibleStages(new Set());
    }
  }, [decision?.timestamp]);

  // Reveal completed stages with a short delay as each event arrives
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    for (const { stage } of PROTOCOL_STEPS) {
      if (completedStages.has(stage) && !visibleStages.has(stage)) {
        const t = setTimeout(() => {
          setVisibleStages((prev) => new Set([...prev, stage]));
        }, REVEAL_DELAY_MS);
        timers.push(t);
        break; // reveal one at a time — next will fire on re-render
      }
    }

    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedStages.size, visibleStages.size]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [typedReasoning, visibleStages]);

  const isPurchasing = decision?.action.type === "purchase";
  const isPriceAdjust = decision?.action.type === "adjust_prices";
  const isRestock = decision?.action.type === "restock";

  if (!decision) {
    return (
      <div className="zt-terminal" ref={scrollRef}>
        <div className="text-gray-500">
          Waiting for next cycle...<span className="zt-cursor" />
        </div>
      </div>
    );
  }

  return (
    <div className="zt-terminal" ref={scrollRef}>
      {/* Context Section */}
      <div className="zt-terminal-header">{"> CONTEXT ──────────────────────────"}</div>
      <div className="text-gray-400">
        {agentId === 'merchant_a' ? (
          <>
            <span>balance: ${String(decision.context_summary?.balance ?? '?')}</span>
            <span className="mx-2">|</span>
            <span>profit: ${String(decision.context_summary?.profit ?? '?')}</span>
            <br />
            <span>stock: {String(decision.context_summary?.total_stock ?? '?')}</span>
            <span className="mx-2">|</span>
            <span>low: {String(decision.context_summary?.low_stock_items ?? '?')}</span>
            <span className="mx-2">|</span>
            <span>velocity: {String(decision.context_summary?.total_velocity ?? '?')}/min</span>
          </>
        ) : (
          <>
            <span>food_need: {String(decision.context_summary?.food_need ?? '?')}</span>
            <span className="mx-2">|</span>
            <span>balance: ${String(decision.context_summary?.balance ?? '?')}</span>
            <br />
            <span>catalog: {String(decision.context_summary?.catalog_size ?? '?')} items</span>
            <span className="mx-2">|</span>
            <span>recent: {String(decision.context_summary?.recent_purchases ?? '?')} purchases</span>
          </>
        )}
      </div>

      {/* LLM Tool Call Section */}
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

      {/* ACP Protocol Section — only for purchases */}
      {isPurchasing && (
        <>
          <div className="zt-terminal-header" style={{ color: "#4caf50" }}>
            {"> \u26D3\uFE0F ACP PROTOCOL \u00D7 TEMPO ─────────"}
          </div>
          <div>
            {PROTOCOL_STEPS.map(({ stage, label }) => {
              const isDone = visibleStages.has(stage);
              const isActive = !isDone &&
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
                  <span>{"  "}{icon} {label}</span>
                  {detail && (
                    <div className="text-gray-500 ml-6" style={{ fontSize: "8px" }}>
                      {"    "}{detail}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Price adjustments section — merchant only */}
      {isPriceAdjust && decision.action.updates && (
        <>
          <div className="zt-terminal-header" style={{ color: "#4caf50" }}>
            {"> PRICE UPDATES ─────────────────"}
          </div>
          <div>
            {decision.action.updates.map((u) => (
              <div key={u.sku} className="zt-step-done zt-step-fade">
                <span>{"  "}{"\u2713"} {u.sku} {"\u2192"} ${u.new_price}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Restock section — merchant only */}
      {isRestock && decision.action.skus && (
        <>
          <div className="zt-terminal-header" style={{ color: "#4caf50" }}>
            {"> \u26D3\uFE0F ACP RESTOCK \u00D7 TEMPO ──────────"}
          </div>
          <div>
            {decision.action.skus.map((sku) => (
              <div key={sku} className="zt-step-active zt-step-fade">
                <span>{"  "}{"\u25CF"} restock: {sku}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Idle cursor after everything is done */}
      {reasoningDone && !isPurchasing && !isPriceAdjust && !isRestock && (
        <div className="mt-2 text-gray-500">
          <span className="zt-cursor" />
        </div>
      )}
    </div>
  );
}
