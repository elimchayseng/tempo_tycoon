import { useEffect, useRef, useState } from "react";
import type { ZooAgentState, ZooPurchaseReceipt, ZooMerchantState, ZooRestockEvent } from "../../lib/types";
import { cartDisplayInfo, productEmoji } from "../../utils/formatting";

interface ZooParkViewProps {
  agents: ZooAgentState[];
  latestReceipt: ZooPurchaseReceipt | null;
  merchantState: ZooMerchantState | null;
  restockEvents: ZooRestockEvent[];
  fullscreen?: boolean;
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

// Expanded layout for fullscreen viewport
const VISITOR_POSITIONS = [
  { x: 220, y: 270 },
  { x: 400, y: 290 },
  { x: 580, y: 265 },
];

const SHOP = { x: 400, y: 340 };

const ENCLOSURES = [
  { x: 30,  y: 20,  w: 130, h: 90, animal: "\u{1F981}", label: "Lions", size: 32 },
  { x: 200, y: 30,  w: 130, h: 85, animal: "\u{1F418}", label: "Elephants", size: 32 },
  { x: 470, y: 25,  w: 130, h: 88, animal: "\u{1F427}", label: "Penguins", size: 32 },
  { x: 640, y: 20,  w: 130, h: 90, animal: "\u{1F992}", label: "Giraffes", size: 32 },
];

const TREES = [
  { x: 40,  y: 160, e: "\u{1F333}", s: 22 },
  { x: 120, y: 200, e: "\u{1F332}", s: 18 },
  { x: 680, y: 170, e: "\u{1F333}", s: 20 },
  { x: 750, y: 210, e: "\u{1F332}", s: 16 },
  { x: 50,  y: 320, e: "\u{1F332}", s: 18 },
  { x: 730, y: 310, e: "\u{1F333}", s: 20 },
  { x: 160, y: 360, e: "\u{1FAA8}", s: 12 },
  { x: 640, y: 355, e: "\u{1FAA8}", s: 12 },
  { x: 300, y: 380, e: "\u{1F332}", s: 16 },
  { x: 510, y: 375, e: "\u{1F333}", s: 17 },
];

const BENCHES = [
  { x: 180, y: 235 },
  { x: 620, y: 240 },
];

const AGENT_IDS = ["guest_1", "guest_2", "guest_3"];

export default function ZooParkView({ agents, latestReceipt, merchantState, restockEvents, fullscreen, isMobile }: ZooParkViewProps & { isMobile?: boolean }) {
  const lastTxRef = useRef<string | null>(null);
  const lastRestockRef = useRef<string | null>(null);
  const [purchaseAnim, setPurchaseAnim] = useState<PurchaseAnim | null>(null);
  const [restockAnim, setRestockAnim] = useState<RestockAnim | null>(null);
  const [activeVisitor, setActiveVisitor] = useState<string | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const restockTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

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

    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    setActiveVisitor(agentId);
    setPurchaseAnim({ agentId, productEmoji: emojis, txHash: latestReceipt.tx_hash, phase: "money" });

    const t1 = setTimeout(() => {
      setPurchaseAnim((prev) => prev ? { ...prev, phase: "product" } : null);
    }, 1000);
    timersRef.current.push(t1);

    const t2 = setTimeout(() => {
      setPurchaseAnim(null);
      setActiveVisitor(null);
    }, 2300);
    timersRef.current.push(t2);

    return () => { timersRef.current.forEach(clearTimeout); timersRef.current = []; };
  }, [latestReceipt]);

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

    return () => { restockTimersRef.current.forEach(clearTimeout); restockTimersRef.current = []; };
  }, [restockEvents]);

  const getVisitorIndex = (agentId: string) => {
    const idx = AGENT_IDS.indexOf(agentId);
    return idx >= 0 ? idx : 0;
  };

  const activeIdx = purchaseAnim ? getVisitorIndex(purchaseAnim.agentId) : -1;
  const activePos = activeIdx >= 0 ? VISITOR_POSITIONS[activeIdx] : VISITOR_POSITIONS[0];

  const vb = fullscreen ? "0 0 800 420" : "0 0 340 98";

  return (
    <svg
      viewBox={vb}
      className="w-full h-full"
      preserveAspectRatio={isMobile ? "xMidYMid meet" : "xMidYMid slice"}
      style={fullscreen ? { position: "absolute", inset: 0 } : { height: "auto", maxHeight: 180 }}
    >
      {/* Base grass */}
      <rect x="0" y="0" width="800" height="420" fill="var(--zt-green-dark)" />

      {/* Grass texture variation */}
      <rect x="0" y="0" width="800" height="420" fill="url(#grassPattern)" opacity="0.3" />
      <defs>
        <pattern id="grassPattern" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
          <circle cx="10" cy="15" r="1.5" fill="#2a5a1a" />
          <circle cx="30" cy="8" r="1" fill="#1e4a14" />
          <circle cx="20" cy="32" r="1.2" fill="#2a5a1a" />
        </pattern>
      </defs>

      {/* Dirt paths */}
      <ellipse cx="400" cy="300" rx="220" ry="55" fill="none" stroke="#5a4a2a" strokeWidth="24" opacity="0.2" />
      <line x1="400" y1="130" x2="400" y2="250" stroke="#5a4a2a" strokeWidth="18" opacity="0.15" strokeLinecap="round" />

      {/* Fence line between enclosures and visitor area */}
      <line x1="15" y1="140" x2="785" y2="140" stroke="#8b6914" strokeWidth="2" strokeDasharray="8 4" opacity="0.4" />

      {/* Animal enclosures */}
      {ENCLOSURES.map((enc) => (
        <g key={enc.label}>
          <rect
            x={enc.x} y={enc.y} width={enc.w} height={enc.h}
            fill="rgba(45, 90, 30, 0.35)"
            stroke="#8b6914" strokeWidth="2" strokeDasharray="6 3"
            rx="4"
          />
          {/* Enclosure fence posts */}
          <circle cx={enc.x} cy={enc.y} r="3" fill="#8b6914" opacity="0.6" />
          <circle cx={enc.x + enc.w} cy={enc.y} r="3" fill="#8b6914" opacity="0.6" />
          <circle cx={enc.x} cy={enc.y + enc.h} r="3" fill="#8b6914" opacity="0.6" />
          <circle cx={enc.x + enc.w} cy={enc.y + enc.h} r="3" fill="#8b6914" opacity="0.6" />

          <text
            x={enc.x + enc.w / 2} y={enc.y + enc.h / 2 + 5}
            textAnchor="middle" fontSize={enc.size}
            className="zt-animal-idle"
          >
            {enc.animal}
          </text>
          <text
            x={enc.x + enc.w / 2} y={enc.y + enc.h - 6}
            textAnchor="middle" fontSize="8"
            fill="var(--zt-tan)" fontFamily="'Press Start 2P', monospace"
          >
            {enc.label}
          </text>
        </g>
      ))}

      {/* Trees and rocks */}
      {TREES.map((t, i) => (
        <text key={i} x={t.x} y={t.y} fontSize={t.s} textAnchor="middle">{t.e}</text>
      ))}

      {/* Benches */}
      {BENCHES.map((b, i) => (
        <text key={`bench-${i}`} x={b.x} y={b.y} fontSize="14" textAnchor="middle">
          {"\u{1FA91}"}
        </text>
      ))}

      {/* Visitors */}
      {AGENT_IDS.map((agentId, i) => {
        const pos = VISITOR_POSITIONS[i];
        const isActive = activeVisitor === agentId;
        const wanderClass = `zt-visitor-wander-${i + 1}`;

        return (
          <g key={agentId} className={wanderClass}>
            {isActive && (
              <circle
                cx={pos.x} cy={pos.y - 6}
                r="20" fill="none"
                stroke="var(--zt-gold)" strokeWidth="2.5"
                className="zt-visitor-active" opacity="0.8"
              />
            )}
            <text x={pos.x} y={pos.y} textAnchor="middle" fontSize="24">
              {"\u{1F6B6}"}
            </text>
            <text
              x={pos.x} y={pos.y + 18}
              textAnchor="middle" fontSize="8"
              fill="var(--zt-tan)" fontFamily="'Press Start 2P', monospace"
            >
              {agentId}
            </text>
          </g>
        );
      })}

      {/* Money animation */}
      {purchaseAnim && purchaseAnim.phase === "money" && (
        <text
          key={`money-${purchaseAnim.txHash}`}
          className="zt-money-to-shop"
          fontSize="18" textAnchor="middle"
          style={{
            "--start-x": `${activePos.x}px`,
            "--start-y": `${activePos.y - 20}px`,
            "--end-x": `${SHOP.x}px`,
            "--end-y": `${SHOP.y - 20}px`,
          } as React.CSSProperties}
        >
          {"\u{1F4B8}"}
        </text>
      )}

      {/* Product animation */}
      {purchaseAnim && purchaseAnim.phase === "product" && (
        <text
          key={`product-${purchaseAnim.txHash}`}
          className="zt-product-to-visitor"
          fontSize="18" textAnchor="middle"
          style={{
            "--start-x": `${SHOP.x}px`,
            "--start-y": `${SHOP.y - 20}px`,
            "--end-x": `${activePos.x}px`,
            "--end-y": `${activePos.y - 20}px`,
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
          x={SHOP.x} y={SHOP.y - 25}
          textAnchor="middle" fontSize="20"
        >
          {restockAnim.productEm}
        </text>
      )}

      {/* Gift Shop */}
      <text
        x={SHOP.x} y={SHOP.y}
        textAnchor="middle" fontSize="36"
        className={purchaseAnim?.phase === "money" || restockAnim ? "zt-shop-shine" : ""}
        key={purchaseAnim ? `shop-${purchaseAnim.txHash}` : restockAnim ? `shop-r-${restockAnim.key}` : "shop-idle"}
      >
        {"\u{1F3EA}"}
      </text>
      <text
        x={SHOP.x} y={SHOP.y + 22}
        textAnchor="middle" fontSize="9"
        fill="var(--zt-gold)" fontFamily="'Press Start 2P', monospace"
      >
        GIFT SHOP
      </text>
    </svg>
  );
}
