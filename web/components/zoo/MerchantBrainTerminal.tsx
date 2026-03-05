import { useEffect, useRef, useState } from "react";
import type { ZooLLMDecision, ZooPriceAdjustment, ZooRestockEvent, ZooMerchantState } from "../../lib/types";
import { useTypewriter } from "../../hooks/useTypewriter";

interface MerchantLlmTerminalProps {
  decision: ZooLLMDecision | null;
  simulationComplete?: boolean;
  merchantState?: ZooMerchantState | null;
}

export function MerchantLlmTerminal({
  decision,
  simulationComplete,
  merchantState,
}: MerchantLlmTerminalProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const reasoningText = decision?.reasoning ?? "";
  const { displayed: typedReasoning, done: reasoningDone } = useTypewriter(reasoningText, 30);

  const isWait = decision?.action.type === "wait";

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [typedReasoning]);

  if (simulationComplete) {
    const totalStock = merchantState?.inventory.reduce((sum, i) => sum + i.stock, 0) ?? "?";
    const lowStockCount = merchantState?.inventory.filter((i) => i.stock <= 1).length ?? "?";
    return (
      <div className="flex flex-col flex-[6]" style={{ minHeight: 0, maxHeight: "none" }}>
        <div className="bg-[var(--zt-green-mid)] px-2 py-1 font-pixel text-[9px] text-white shrink-0">
          🧠 LLM RESPONSE — 🏪 merchant
        </div>
        <div className="zt-terminal flex-1 overflow-y-auto" ref={scrollRef} style={{ minHeight: 0, maxHeight: "none" }}>
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
      </div>
    );
  }

  if (!decision) {
    return (
      <div className="flex flex-col flex-[6]" style={{ minHeight: 0, maxHeight: "none" }}>
        <div className="bg-[var(--zt-green-mid)] px-2 py-1 font-pixel text-[9px] text-white shrink-0">
          🧠 LLM RESPONSE — 🏪 merchant
        </div>
        <div className="zt-terminal flex-1 overflow-y-auto" ref={scrollRef} style={{ minHeight: 0, maxHeight: "none" }}>
          <div className="text-gray-500">
            Waiting for merchant brain cycle...<span className="zt-cursor" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-[6]" style={{ minHeight: 0, maxHeight: "none" }}>
      <div className="bg-[var(--zt-green-mid)] px-2 py-1 font-pixel text-[9px] text-white shrink-0">
        🧠 LLM RESPONSE — 🏪 merchant
      </div>
      <div className="zt-terminal flex-1 overflow-y-auto" ref={scrollRef} style={{ minHeight: 0, maxHeight: "none" }}>
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
          {"> 🧠 LLM TOOL CALL ────────────────"}
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

        {/* Idle cursor for wait */}
        {isWait && reasoningDone && (
          <div className="mt-2 text-gray-500">
            <span className="zt-cursor" />
          </div>
        )}
      </div>
    </div>
  );
}

// --- MerchantAcpTerminal (two side-by-side panes: Price Adjust + Restock) ---

interface MerchantAcpTerminalProps {
  decision: ZooLLMDecision | null;
  priceAdjustments: ZooPriceAdjustment[];
  restockEvents: ZooRestockEvent[];
  simulationComplete?: boolean;
}

type RestockStage = "restock_initiated" | "signing" | "broadcast" | "block_inclusion" | "confirmed";

const RESTOCK_STEPS: { stage: RestockStage; label: string }[] = [
  { stage: "restock_initiated", label: "restock_initiated" },
  { stage: "signing", label: "signing" },
  { stage: "broadcast", label: "broadcast" },
  { stage: "block_inclusion", label: "block_inclusion" },
  { stage: "confirmed", label: "confirmed" },
];

type PriceAdjustStage = "adjust_initiated" | "computing_deltas" | "applying_updates" | "catalog_synced" | "confirmed";

const PRICE_ADJUST_STEPS: { stage: PriceAdjustStage; label: string }[] = [
  { stage: "adjust_initiated", label: "adjust_initiated" },
  { stage: "computing_deltas", label: "computing_deltas" },
  { stage: "applying_updates", label: "applying_updates" },
  { stage: "catalog_synced", label: "catalog_synced" },
  { stage: "confirmed", label: "confirmed" },
];

export function MerchantAcpTerminal({
  decision,
  priceAdjustments,
  restockEvents,
  simulationComplete,
}: MerchantAcpTerminalProps) {
  const priceScrollRef = useRef<HTMLDivElement>(null);
  const restockScrollRef = useRef<HTMLDivElement>(null);
  const [visibleRestockStages, setVisibleRestockStages] = useState<Set<RestockStage>>(new Set());
  const restockTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const lastRestockTxRef = useRef<string | null>(null);
  const [visiblePriceStages, setVisiblePriceStages] = useState<Set<PriceAdjustStage>>(new Set());
  const priceTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const lastPriceDecisionRef = useRef<number>(0);

  const isPriceAdjust = decision?.action.type === "adjust_prices";

  // Animate restock protocol stages when a new restock event arrives
  useEffect(() => {
    const latestRestock = restockEvents[0];
    if (!latestRestock) return;
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
  }, [restockEvents]);


  // Animate price adjust protocol stages when a new price adjustment decision arrives
  useEffect(() => {
    if (!isPriceAdjust || !decision) return;
    if (decision.timestamp === lastPriceDecisionRef.current) return;

    lastPriceDecisionRef.current = decision.timestamp;
    setVisiblePriceStages(new Set());

    priceTimersRef.current.forEach(clearTimeout);
    priceTimersRef.current = [];

    const delays = [0, 400, 800, 1200, 1600];
    PRICE_ADJUST_STEPS.forEach(({ stage }, i) => {
      const t = setTimeout(() => {
        setVisiblePriceStages((prev) => new Set([...prev, stage]));
      }, delays[i]);
      priceTimersRef.current.push(t);
    });

    return () => {
      priceTimersRef.current.forEach(clearTimeout);
      priceTimersRef.current = [];
    };
  }, [decision?.timestamp, isPriceAdjust]);


  // Auto-scroll
  useEffect(() => {
    if (priceScrollRef.current) {
      priceScrollRef.current.scrollTop = priceScrollRef.current.scrollHeight;
    }
  }, [visiblePriceStages.size, priceAdjustments]);

  useEffect(() => {
    if (restockScrollRef.current) {
      restockScrollRef.current.scrollTop = restockScrollRef.current.scrollHeight;
    }
  }, [visibleRestockStages.size]);

  const latestRestock = restockEvents[0];

  return (
    <div className="flex flex-[4] gap-1" style={{ minHeight: 0, maxHeight: "none" }}>
      {/* Left pane: ACP PRICE ADJUST */}
      <div className="flex flex-col flex-1" style={{ minHeight: 0, minWidth: 0 }}>
        <div className="bg-[var(--zt-green-mid)] px-2 py-1 font-pixel text-[9px] text-white shrink-0">
          💰 ACP PRICE ADJUST
        </div>
        <div className="zt-terminal flex-1 overflow-y-auto" ref={priceScrollRef} style={{ minHeight: 0, maxHeight: "none" }}>
          {simulationComplete ? (
            <div className="text-gray-500">protocol idle</div>
          ) : !isPriceAdjust && visiblePriceStages.size === 0 ? (
            <div className="text-gray-500">
              waiting<span className="zt-cursor" />
            </div>
          ) : (
            <>
              <div className="zt-terminal-header" style={{ color: "#4caf50" }}>
                {"> ⛓️ ACP PRICE ADJUST × TEMPO"}
              </div>
              <div>
                {PRICE_ADJUST_STEPS.map(({ stage, label }) => {
                  const isDone = visiblePriceStages.has(stage);
                  const isActive =
                    !isDone &&
                    PRICE_ADJUST_STEPS.findIndex((s) => !visiblePriceStages.has(s.stage)) ===
                      PRICE_ADJUST_STEPS.findIndex((s) => s.stage === stage) &&
                    visiblePriceStages.size > 0;
                  const icon = isDone ? "✓" : isActive ? "●" : "○";
                  const cls = isDone
                    ? "zt-step-done"
                    : isActive
                      ? "zt-step-active"
                      : "zt-step-pending";

                  return (
                    <div key={stage} className={`${cls} zt-step-fade`}>
                      <span>{"  "}{icon} {label}</span>
                    </div>
                  );
                })}
              </div>

              {/* Show actual price changes after protocol completes */}
              {visiblePriceStages.has("confirmed") && priceAdjustments.length > 0 && (
                <>
                  <div className="zt-terminal-header mt-1" style={{ color: "#4caf50" }}>
                    {"> PRICE UPDATES"}
                  </div>
                  <div>
                    {priceAdjustments
                      .filter((pa) => pa.timestamp >= (decision!.timestamp - 5000))
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
            </>
          )}
        </div>
      </div>

      {/* Right pane: ACP RESTOCK */}
      <div className="flex flex-col flex-1" style={{ minHeight: 0, minWidth: 0 }}>
        <div className="bg-[var(--zt-green-mid)] px-2 py-1 font-pixel text-[9px] text-white shrink-0">
          📦 ACP RESTOCK
        </div>
        <div className="zt-terminal flex-1 overflow-y-auto" ref={restockScrollRef} style={{ minHeight: 0, maxHeight: "none" }}>
          {simulationComplete ? (
            <div className="text-gray-500">protocol idle</div>
          ) : !latestRestock ? (
            <div className="text-gray-500">
              waiting<span className="zt-cursor" />
            </div>
          ) : (
            <>
              <div className="zt-terminal-header" style={{ color: "#4caf50" }}>
                {"> ⛓️ ACP RESTOCK × TEMPO"}
              </div>
              <div className="text-gray-400 ml-2" style={{ fontSize: "8px", marginBottom: "2px" }}>
                {latestRestock.name} ×{latestRestock.quantity} — {latestRestock.cost} aUSD
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
                  const cls = isDone
                    ? "zt-step-done"
                    : isActive
                      ? "zt-step-active"
                      : "zt-step-pending";

                  return (
                    <div key={stage} className={`${cls} zt-step-fade`}>
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
        </div>
      </div>
    </div>
  );
}
