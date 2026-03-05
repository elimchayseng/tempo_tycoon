import { useEffect, useRef, useState } from "react";
import type { ZooAgentState, ZooPurchaseReceipt, ZooMerchantState, ZooRestockEvent } from "../../lib/types";
import { cartDisplayInfo, productEmoji } from "../../utils/formatting";

interface ZooParkViewProps {
  agents: ZooAgentState[];
  latestReceipt: ZooPurchaseReceipt | null;
  merchantState: ZooMerchantState | null;
  restockEvents: ZooRestockEvent[];
}

interface PurchaseAnim {
  agentId: string;
  productEmoji: string;
  txHash: string;
  phase: "money" | "product" | "done";
}

interface RestockAnim {
  productEm: string;
  key: string;
}

// Visitor positions (near the shop)
const VISITOR_POSITIONS = [
  { x: 90, y: 47 },
  { x: 170, y: 53 },
  { x: 250, y: 45 },
];

// Shop position
const SHOP = { x: 170, y: 77 };

// Animal enclosures — single row across the top
const ENCLOSURES = [
  { x: 12, y: 2, animal: "\u{1F981}", label: "Lions" },
  { x: 97, y: 2, animal: "\u{1F418}", label: "Elephants" },
  { x: 208, y: 2, animal: "\u{1F427}", label: "Penguins" },
  { x: 293, y: 2, animal: "\u{1F992}", label: "Giraffes" },
];

// Decorations — sparse, edges only
const DECORATIONS = [
  { x: 17, y: 47, emoji: "\u{1F333}" },
  { x: 323, y: 43, emoji: "\u{1F332}" },
  { x: 34, y: 73, emoji: "\u{1FAA8}" },
  { x: 306, y: 70, emoji: "\u{1FAA8}" },
  { x: 110, y: 90, emoji: "\u{1F332}" },
  { x: 234, y: 91, emoji: "\u{1F333}" },
];

const AGENT_IDS = ["guest_1", "guest_2", "guest_3"];

export default function ZooParkView({ agents, latestReceipt, merchantState, restockEvents }: ZooParkViewProps) {
  const lastTxRef = useRef<string | null>(null);
  const lastRestockRef = useRef<string | null>(null);
  const [purchaseAnim, setPurchaseAnim] = useState<PurchaseAnim | null>(null);
  const [restockAnim, setRestockAnim] = useState<RestockAnim | null>(null);
  const [activeVisitor, setActiveVisitor] = useState<string | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const restockTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Purchase animation
  useEffect(() => {
    if (!latestReceipt) {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      setPurchaseAnim(null);
      setActiveVisitor(null);
      lastTxRef.current = null;
      return;
    }
    if (latestReceipt.tx_hash === lastTxRef.current) return;
    lastTxRef.current = latestReceipt.tx_hash;

    const { emojis } = cartDisplayInfo(latestReceipt.items);
    const agentId = latestReceipt.agent_id;

    // Clear previous
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    // Highlight visitor
    setActiveVisitor(agentId);

    // Phase 1: money flies to shop
    setPurchaseAnim({ agentId, productEmoji: emojis, txHash: latestReceipt.tx_hash, phase: "money" });

    // Phase 2: product flies back (after 1s)
    const t1 = setTimeout(() => {
      setPurchaseAnim((prev) => prev ? { ...prev, phase: "product" } : null);
    }, 1000);
    timersRef.current.push(t1);

    // Phase 3: done (after 2.3s)
    const t2 = setTimeout(() => {
      setPurchaseAnim(null);
      setActiveVisitor(null);
    }, 2300);
    timersRef.current.push(t2);

    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [latestReceipt]);

  // Restock animation
  useEffect(() => {
    const latest = restockEvents[0];
    if (!latest) {
      restockTimersRef.current.forEach(clearTimeout);
      restockTimersRef.current = [];
      setRestockAnim(null);
      lastRestockRef.current = null;
      return;
    }
    if (latest.tx_hash === lastRestockRef.current) return;
    lastRestockRef.current = latest.tx_hash;

    setRestockAnim({ productEm: productEmoji(latest.name), key: latest.tx_hash });

    restockTimersRef.current.forEach(clearTimeout);
    restockTimersRef.current = [];
    const t = setTimeout(() => setRestockAnim(null), 1500);
    restockTimersRef.current.push(t);

    return () => {
      restockTimersRef.current.forEach(clearTimeout);
      restockTimersRef.current = [];
    };
  }, [restockEvents]);

  // Get visitor index for an agent
  const getVisitorIndex = (agentId: string) => {
    const idx = AGENT_IDS.indexOf(agentId);
    return idx >= 0 ? idx : 0;
  };

  const activeIdx = purchaseAnim ? getVisitorIndex(purchaseAnim.agentId) : -1;
  const activePos = activeIdx >= 0 ? VISITOR_POSITIONS[activeIdx] : VISITOR_POSITIONS[0];

  return (
    <div className="shrink-0">
      <svg viewBox="0 0 340 98" className="w-full" style={{ height: "auto", maxHeight: "180px" }} preserveAspectRatio="xMidYMid meet">
        {/* Background grass */}
        <rect x="0" y="0" width="340" height="98" fill="var(--zt-green-dark)" rx="3" />

        {/* Path/walkway */}
        <ellipse cx="170" cy="66" rx="85" ry="19" fill="none" stroke="#5a4a2a" strokeWidth="10" opacity="0.25" />

        {/* Animal enclosures */}
        {ENCLOSURES.map((enc) => (
          <g key={enc.label}>
            <rect
              x={enc.x}
              y={enc.y}
              width="40"
              height="24"
              fill="rgba(45, 90, 30, 0.4)"
              stroke="#8b6914"
              strokeWidth="1"
              strokeDasharray="4 2"
              rx="2"
            />
            <text
              x={enc.x + 20}
              y={enc.y + 16}
              textAnchor="middle"
              fontSize="12"
              className="zt-animal-idle"
            >
              {enc.animal}
            </text>
            <text
              x={enc.x + 20}
              y={enc.y + 23}
              textAnchor="middle"
              fontSize="3.5"
              fill="var(--zt-tan)"
              fontFamily="'Press Start 2P', monospace"
            >
              {enc.label}
            </text>
          </g>
        ))}

        {/* Decorations */}
        {DECORATIONS.map((dec, i) => (
          <text key={i} x={dec.x} y={dec.y} fontSize="9" textAnchor="middle">
            {dec.emoji}
          </text>
        ))}

        {/* Visitors wandering */}
        {AGENT_IDS.map((agentId, i) => {
          const pos = VISITOR_POSITIONS[i];
          const isActive = activeVisitor === agentId;
          const wanderClass = `zt-visitor-wander-${i + 1}`;

          return (
            <g key={agentId} className={wanderClass}>
              {/* Active glow */}
              {isActive && (
                <circle
                  cx={pos.x}
                  cy={pos.y - 3}
                  r="11"
                  fill="none"
                  stroke="var(--zt-gold)"
                  strokeWidth="2"
                  className="zt-visitor-active"
                  opacity="0.8"
                />
              )}
              {/* Walking figure */}
              <text x={pos.x} y={pos.y} textAnchor="middle" fontSize="12">
                {"\u{1F6B6}"}
              </text>
              {/* Guest ID label */}
              <text
                x={pos.x}
                y={pos.y + 10}
                textAnchor="middle"
                fontSize="4.5"
                fill="var(--zt-tan)"
                fontFamily="'Press Start 2P', monospace"
              >
                {agentId}
              </text>
            </g>
          );
        })}

        {/* Money animation: flies from visitor to shop */}
        {purchaseAnim && purchaseAnim.phase === "money" && (
          <text
            key={`money-${purchaseAnim.txHash}`}
            className="zt-money-to-shop"
            fontSize="9"
            textAnchor="middle"
            style={{
              "--start-x": `${activePos.x}px`,
              "--start-y": `${activePos.y - 10}px`,
              "--end-x": `${SHOP.x}px`,
              "--end-y": `${SHOP.y - 10}px`,
            } as React.CSSProperties}
          >
            {"\u{1F4B8}"}
          </text>
        )}

        {/* Product animation: flies from shop to visitor */}
        {purchaseAnim && purchaseAnim.phase === "product" && (
          <text
            key={`product-${purchaseAnim.txHash}`}
            className="zt-product-to-visitor"
            fontSize="9"
            textAnchor="middle"
            style={{
              "--start-x": `${SHOP.x}px`,
              "--start-y": `${SHOP.y - 10}px`,
              "--end-x": `${activePos.x}px`,
              "--end-y": `${activePos.y - 10}px`,
            } as React.CSSProperties}
          >
            {purchaseAnim.productEmoji}
          </text>
        )}

        {/* Restock drop */}
        {restockAnim && (
          <text
            key={`restock-${restockAnim.key}`}
            className="zt-restock-drop-park"
            x={SHOP.x}
            y={SHOP.y - 12}
            textAnchor="middle"
            fontSize="10"
          >
            {restockAnim.productEm}
          </text>
        )}

        {/* Gift Shop */}
        <text
          x={SHOP.x}
          y={SHOP.y}
          textAnchor="middle"
          fontSize="18"
          className={purchaseAnim?.phase === "money" || restockAnim ? "zt-shop-shine" : ""}
          key={purchaseAnim ? `shop-${purchaseAnim.txHash}` : restockAnim ? `shop-r-${restockAnim.key}` : "shop-idle"}
        >
          {"\u{1F3EA}"}
        </text>
        <text
          x={SHOP.x}
          y={SHOP.y + 11}
          textAnchor="middle"
          fontSize="4.5"
          fill="var(--zt-gold)"
          fontFamily="'Press Start 2P', monospace"
        >
          GIFT SHOP
        </text>
      </svg>
    </div>
  );
}
