import { useEffect, useState, useRef } from "react";
import type { ZooPurchaseReceipt, ZooAgentState } from "../../lib/types";
import { ANIMAL_EMOJI, cartDisplayInfo } from "../../utils/formatting";

interface AnimatedRailProps {
  agents: ZooAgentState[];
  latestReceipt: ZooPurchaseReceipt | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
  agentColumnRef: React.RefObject<HTMLDivElement | null>;
}

interface RailAnim {
  agentIndex: number;
  productEmoji: string;
  moneyEmoji: string;
  key: string;
  phase: "money" | "product" | "done";
}

export default function AnimatedRail({ agents, latestReceipt, containerRef, agentColumnRef }: AnimatedRailProps) {
  const lastTxRef = useRef<string | null>(null);
  const [anim, setAnim] = useState<RailAnim | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (!latestReceipt) {
      lastTxRef.current = null;
      setAnim(null);
      return;
    }
    if (latestReceipt.tx_hash === lastTxRef.current) return;
    lastTxRef.current = latestReceipt.tx_hash;

    const agentIndex = agents.findIndex((a) => a.agent_id === latestReceipt.agent_id);
    if (agentIndex === -1) return;

    const { emojis } = cartDisplayInfo(latestReceipt.items);

    // Clear previous timers
    timerRef.current.forEach(clearTimeout);
    timerRef.current = [];

    // Phase 1: money flows guest→merchant
    setAnim({
      agentIndex,
      productEmoji: emojis,
      moneyEmoji: "💸",
      key: latestReceipt.tx_hash,
      phase: "money",
    });

    // Phase 2: product flows merchant→guest
    const t1 = setTimeout(() => {
      setAnim((prev) => prev ? { ...prev, phase: "product" } : null);
    }, 1800);
    timerRef.current.push(t1);

    // Phase 3: done
    const t2 = setTimeout(() => {
      setAnim(null);
    }, 3600);
    timerRef.current.push(t2);

    return () => {
      timerRef.current.forEach(clearTimeout);
      timerRef.current = [];
    };
  }, [latestReceipt, agents]);

  if (!anim || agents.length === 0) return null;

  // Calculate Y positions for rails
  // Each agent card is roughly 70px tall, with 6px gap, starting from top of column
  const cardHeight = 70;
  const cardGap = 6;
  const cardTopOffset = 8; // padding
  const yPositions = agents.map((_, i) => cardTopOffset + i * (cardHeight + cardGap) + cardHeight / 2);

  const targetY = yPositions[anim.agentIndex] ?? yPositions[0];

  return (
    <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
      <svg className="absolute inset-0 w-full h-full" style={{ overflow: "visible" }}>
        {/* Dashed rail lines from left edge to each agent position */}
        {agents.map((agent, i) => {
          const y = yPositions[i];
          const isActive = i === anim.agentIndex;
          return (
            <line
              key={agent.agent_id}
              x1="0"
              y1={y}
              x2="40"
              y2={y}
              stroke={isActive ? "var(--zt-gold)" : "var(--zt-green-mid)"}
              strokeWidth={isActive ? 2 : 1}
              strokeDasharray={isActive ? "6 3" : "4 4"}
              opacity={isActive ? 0.8 : 0.3}
            />
          );
        })}
      </svg>

      {/* Animated emoji traveling along rail */}
      {anim.phase === "money" && (
        <div
          key={`money-${anim.key}`}
          className="zt-rail-emoji-lr absolute text-sm"
          style={{
            top: targetY - 10,
            left: -20,
          }}
        >
          {anim.moneyEmoji}
        </div>
      )}

      {anim.phase === "product" && (
        <div
          key={`product-${anim.key}`}
          className="zt-rail-emoji-rl absolute text-sm"
          style={{
            top: targetY - 10,
            right: -20,
          }}
        >
          {anim.productEmoji}
        </div>
      )}
    </div>
  );
}
