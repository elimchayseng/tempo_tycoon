import { useEffect, useRef, useState } from "react";
import type { ZooLLMDecision, ZooPriceAdjustment, ZooRestockEvent, ZooMerchantState } from "../../lib/types";
import { useTypewriter } from "../../hooks/useTypewriter";

interface MerchantBrainTerminalProps {
  decision: ZooLLMDecision | null;
  priceAdjustments: ZooPriceAdjustment[];
  restockEvents: ZooRestockEvent[];
  simulationComplete?: boolean;
  merchantState?: ZooMerchantState | null;
}

type RestockStage = "restock_initiated" | "signing" | "broadcast" | "block_inclusion" | "confirmed";

const RESTOCK_STEPS: { stage: RestockStage; label: string }[] = [
  { stage: "restock_initiated", label: "restock_initiated" },
  { stage: "signing", label: "signing" },
  { stage: "broadcast", label: "broadcast" },
  { stage: "block_inclusion", label: "block_inclusion" },
  { stage: "confirmed", label: "confirmed" },
];

export default function MerchantBrainTerminal({
  decision,
  priceAdjustments,
  restockEvents,
  simulationComplete,
  merchantState,
}: MerchantBrainTerminalProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [visibleRestockStages, setVisibleRestockStages] = useState<Set<RestockStage>>(new Set());
  const restockTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const lastRestockTxRef = useRef<string | null>(null);

  const reasoningText = decision?.reasoning ?? "";
  const { displayed: typedReasoning, done: reasoningDone } = useTypewriter(reasoningText, 30);

  const isPriceAdjust = decision?.action.type === "adjust_prices";
  const isRestock = decision?.action.type === "restock";
  const isWait = decision?.action.type === "wait";

  // Animate restock protocol stages when a new restock event arrives
  useEffect(() => {
    const latestRestock = restockEvents[0];
    if (!latestRestock || !isRestock) return;
    if (latestRestock.tx_hash === lastRestockTxRef.current) return;

    lastRestockTxRef.current = latestRestock.tx_hash;
    setVisibleRestockStages(new Set());

    restockTimersRef.current.forEach(clearTimeout);
    restockTimersRef.current = [];

    const delays = [0, 600, 1200, 1800, 2400];
    RESTOCK_STEPS.forEach(({ stage }, i) => {
      const t = setTimeout(() => {
        setVisibleRestockStages((prev) => new Set([...prev, stage]));
      }, delays[i]);
      restockTimersRef.current.push(t);
    });

    return () => {
      restockTimersRef.current.forEach(clearTimeout);
      restockTimersRef.current = [];
    };
  }, [restockEvents, isRestock]);

  // Reset restock stages when decision changes
  useEffect(() => {
    if (!isRestock) {
      setVisibleRestockStages(new Set());
      lastRestockTxRef.current = null;
    }
  }, [decision?.timestamp, isRestock]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [typedReasoning, visibleRestockStages.size, priceAdjustments]);

  if (simulationComplete) {
    const totalStock = merchantState?.inventory.reduce((sum, i) => sum + i.stock, 0) ?? "?";
    const lowStockCount = merchantState?.inventory.filter((i) => i.stock <= 1).length ?? "?";
    return (
      <div className="zt-terminal" ref={scrollRef} style={{ maxHeight: 250, minHeight: 0 }}>
        <div className="zt-terminal-header text-gray-500">{"> SIMULATION ENDED ─────────────────"}</div>
        {merchantState && (
          <div className="text-gray-500 mt-1">
            <span>balance: ${merchantState.balance}</span>
            <span className="mx-2">|</span>
            <span>profit: ${merchantState.profit}</span>
            <br />
            <span>stock: {totalStock}</span>
            <span className="mx-2">|</span>
            <span>low: {lowStockCount}</span>
          </div>
        )}
        <div className="text-gray-500 mt-2">
          merchant agent offline — all buyers depleted
        </div>
      </div>
    );
  }

  if (!decision) {
    return (
      <div className="zt-terminal" ref={scrollRef} style={{ maxHeight: 250, minHeight: 0 }}>
        <div className="text-gray-500">
          Waiting for merchant brain cycle...<span className="zt-cursor" />
        </div>
      </div>
    );
  }

  const latestRestock = restockEvents[0];

  return (
    <div className="zt-terminal" ref={scrollRef} style={{ maxHeight: 250, minHeight: 0 }}>
      {/* CONTEXT */}
      <div className="zt-terminal-header">{"> CONTEXT ──────────────────────────"}</div>
      <div className="text-gray-400">
        <span>balance: ${String(decision.context_summary?.balance ?? "?")}</span>
        <span className="mx-2">|</span>
        <span>profit: ${String(decision.context_summary?.profit ?? "?")}</span>
        <br />
        <span>stock: {String(decision.context_summary?.total_stock ?? "?")}</span>
        <span className="mx-2">|</span>
        <span>low: {String(decision.context_summary?.low_stock_items ?? "?")}</span>
        <span className="mx-2">|</span>
        <span>velocity: {String(decision.context_summary?.total_velocity ?? "?")}/min</span>
      </div>

      {/* LLM TOOL CALL */}
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

      {/* ACP RESTOCK × TEMPO */}
      {isRestock && latestRestock && (
        <>
          <div className="zt-terminal-header" style={{ color: "#4caf50" }}>
            {"> \u26D3\uFE0F ACP RESTOCK \u00D7 TEMPO ──────────"}
          </div>
          <div>
            {RESTOCK_STEPS.map(({ stage, label }) => {
              const isDone = visibleRestockStages.has(stage);
              const isActive =
                !isDone &&
                RESTOCK_STEPS.findIndex((s) => !visibleRestockStages.has(s.stage)) ===
                  RESTOCK_STEPS.findIndex((s) => s.stage === stage) &&
                visibleRestockStages.size > 0;
              const icon = isDone ? "✓" : isActive ? "●" : "○";
              const className = isDone
                ? "zt-step-done"
                : isActive
                  ? "zt-step-active"
                  : "zt-step-pending";

              return (
                <div key={stage} className={`${className} zt-step-fade`}>
                  <span>{"  "}{icon} {label}</span>
                  {isDone && stage === "confirmed" && (
                    <div className="text-gray-500 ml-6" style={{ fontSize: "8px" }}>
                      {"    "}tx: {latestRestock.tx_hash.slice(0, 8)}...{latestRestock.tx_hash.slice(-4)} block #{latestRestock.block_number}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* PRICE UPDATES */}
      {isPriceAdjust && priceAdjustments.length > 0 && (
        <>
          <div className="zt-terminal-header" style={{ color: "#4caf50" }}>
            {"> PRICE UPDATES ─────────────────"}
          </div>
          <div>
            {priceAdjustments
              .filter((pa) => pa.timestamp >= (decision.timestamp - 5000))
              .map((pa) => {
                const pct = parseFloat(pa.pct_change);
                const color = pct > 0 ? "#4caf50" : pct < 0 ? "#e53935" : "#888";
                const sign = pct > 0 ? "+" : "";
                return (
                  <div key={`${pa.sku}-${pa.timestamp}`} className="zt-step-fade" style={{ color }}>
                    <span>{"  "}✓ {pa.sku} ${pa.old_price} → ${pa.new_price} ({sign}{pa.pct_change}%)</span>
                  </div>
                );
              })}
          </div>
        </>
      )}

      {/* Idle cursor for wait */}
      {isWait && reasoningDone && (
        <div className="mt-2 text-gray-500">
          <span className="zt-cursor" />
        </div>
      )}
    </div>
  );
}
