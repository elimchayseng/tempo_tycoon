import { useEffect, useRef, useState } from "react";
import type { Account, ZooPurchaseReceipt, ZooMerchantState, ZooRestockEvent } from "../../lib/types";
import { shortAddr, formatAlphaUsdBalance, ANIMAL_EMOJI, formatGuestLabel, productEmoji } from "../../utils/formatting";

interface MerchantPanelProps {
  merchant: Account | undefined;
  latestReceipt: ZooPurchaseReceipt | null;
  merchantState: ZooMerchantState | null;
  restockEvents: ZooRestockEvent[];
}

interface AnimState {
  guestEmoji: string;
  guestAddr: string;
  productEm: string;
  amount: string;
  txHash: string;
}

interface ActivityEntry {
  guestEmoji: string;
  guestAddr: string;
  productEm: string;
  productName: string;
  amount: string;
  txHash: string;
}

function buildProtocolSteps(receipt: ZooPurchaseReceipt, guestLabel: string): { text: string; delay: number }[] {
  const prodEm = productEmoji(receipt.product_name);
  return [
    { text: `${guestLabel} evaluating purchase decision...`, delay: 0 },
    { text: `Discovering merchants via /api/zoo/registry`, delay: 600 },
    { text: `Browsing merchant catalog...`, delay: 1200 },
    { text: `Found ${prodEm} ${receipt.product_name} — $${receipt.amount} AUSD`, delay: 1800 },
    { text: `Creating checkout session...`, delay: 2400 },
    { text: `🔐 Signing transferWithMemo tx...`, delay: 3000 },
    { text: `📡 Broadcasting to Tempo Moderato...`, delay: 3600 },
    { text: `✅ AlphaUSD transfer confirmed on-chain!`, delay: 4200 },
  ];
}

function buildRestockSteps(event: ZooRestockEvent): { text: string; delay: number }[] {
  const prodEm = productEmoji(event.name);
  return [
    { text: `📦 Low stock detected: ${prodEm} ${event.name}`, delay: 0 },
    { text: `Calculating restock: ${event.quantity} units @ cost basis`, delay: 600 },
    { text: `🔐 Signing restock payment: $${event.cost} → Zoo Master`, delay: 1200 },
    { text: `📡 Broadcasting to Tempo Moderato...`, delay: 1800 },
    { text: `✅ Restocked ${prodEm} ${event.name} +${event.quantity} units!`, delay: 2400 },
  ];
}

const ALPHA_USD = "0x20c0000000000000000000000000000000000001";

function StockBar({ stock, maxStock }: { stock: number; maxStock: number }) {
  const cells = [];
  for (let i = 0; i < maxStock; i++) {
    const filled = i < stock;
    let colorClass = "bg-green-600";
    if (stock <= 1 && stock > 0) colorClass = "bg-amber-500";
    if (!filled) colorClass = "bg-gray-700";

    cells.push(
      <div
        key={i}
        className={`w-3 h-3 rounded-sm ${colorClass} ${filled && stock <= 1 ? 'animate-pulse' : ''}`}
      />
    );
  }
  return <div className="flex gap-0.5">{cells}</div>;
}

export default function MerchantPanel({ merchant, latestReceipt, merchantState, restockEvents }: MerchantPanelProps) {
  const lastTxRef = useRef<string | null>(null);
  const lastRestockRef = useRef<string | null>(null);
  const [anim, setAnim] = useState<AnimState | null>(null);
  const [balanceFlash, setBalanceFlash] = useState(false);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [protocolStep, setProtocolStep] = useState<string | null>(null);
  const [restockProtocolStep, setRestockProtocolStep] = useState<string | null>(null);
  const [showRestockProtocol, setShowRestockProtocol] = useState(false);
  const stepTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const restockTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Purchase animation
  useEffect(() => {
    if (!latestReceipt) return;
    if (latestReceipt.tx_hash === lastTxRef.current) return;

    lastTxRef.current = latestReceipt.tx_hash;

    const guestEmoji = ANIMAL_EMOJI[latestReceipt.agent_id] ?? "🦊";
    const guestAddr = latestReceipt.agent_address ? shortAddr(latestReceipt.agent_address) : latestReceipt.agent_id;
    const guestLabel = formatGuestLabel(latestReceipt.agent_id, latestReceipt.agent_address);
    const productEm = productEmoji(latestReceipt.product_name);

    setAnim({
      guestEmoji,
      guestAddr,
      productEm,
      amount: latestReceipt.amount,
      txHash: latestReceipt.tx_hash,
    });
    setBalanceFlash(true);

    setActivity((prev) => [
      {
        guestEmoji,
        guestAddr,
        productEm,
        productName: latestReceipt.product_name,
        amount: latestReceipt.amount,
        txHash: latestReceipt.tx_hash,
      },
      ...prev.slice(0, 2),
    ]);

    stepTimersRef.current.forEach(clearTimeout);
    stepTimersRef.current = [];

    const steps = buildProtocolSteps(latestReceipt, guestLabel);
    for (const step of steps) {
      const id = setTimeout(() => setProtocolStep(step.text), step.delay);
      stepTimersRef.current.push(id);
    }

    const timer = setTimeout(() => {
      setAnim(null);
      setBalanceFlash(false);
      setProtocolStep(null);
    }, 5000);
    stepTimersRef.current.push(timer);

    return () => {
      stepTimersRef.current.forEach(clearTimeout);
      stepTimersRef.current = [];
    };
  }, [latestReceipt]);

  // Restock animation
  useEffect(() => {
    const latestRestock = restockEvents[0];
    if (!latestRestock) return;
    if (latestRestock.tx_hash === lastRestockRef.current) return;

    lastRestockRef.current = latestRestock.tx_hash;
    setShowRestockProtocol(true);

    restockTimersRef.current.forEach(clearTimeout);
    restockTimersRef.current = [];

    const steps = buildRestockSteps(latestRestock);
    for (const step of steps) {
      const id = setTimeout(() => setRestockProtocolStep(step.text), step.delay);
      restockTimersRef.current.push(id);
    }

    const hideTimer = setTimeout(() => {
      setShowRestockProtocol(false);
      setRestockProtocolStep(null);
    }, 4000);
    restockTimersRef.current.push(hideTimer);

    return () => {
      restockTimersRef.current.forEach(clearTimeout);
      restockTimersRef.current = [];
    };
  }, [restockEvents]);

  if (!merchant) return null;

  const rawBalance = merchant.balances[ALPHA_USD] ?? "0";
  const balance = formatAlphaUsdBalance(rawBalance);

  const inventory = merchantState?.inventory ?? [];

  return (
    <div className="px-5 pt-4 shrink-0">
      <div className="zt-bevel overflow-hidden">
        {/* Title bar */}
        <div className="zt-titlebar flex items-center justify-between">
          <span>🏪 ZOO GIFT SHOP</span>
          <span className={balanceFlash ? "zt-balance-flash" : "text-[var(--zt-gold)]"}>
            💰 {balance}
          </span>
        </div>

        {/* Body */}
        <div className="bg-[var(--zt-green-dark)] px-4 py-3 space-y-3">
          {/* Wallet address */}
          <div className="font-pixel text-[10px] text-gray-500">
            Wallet: {shortAddr(merchant.address)}
          </div>

          {/* Inventory grid */}
          {inventory.length > 0 && (
            <div className="space-y-1">
              <div className="font-pixel text-[9px] text-gray-400 uppercase tracking-wider">Inventory</div>
              {inventory.map((item) => (
                <div key={item.sku} className="flex items-center gap-2 font-pixel text-[10px]">
                  <span className="w-4 text-center">{productEmoji(item.name)}</span>
                  <span className={`w-20 truncate ${item.stock === 0 ? 'text-gray-600' : 'text-[var(--zt-tan)]'}`}>
                    {item.name}
                  </span>
                  <StockBar stock={item.stock} maxStock={item.max_stock} />
                  <span className={`w-6 text-right ${
                    item.stock === 0 ? 'text-red-500 font-bold' :
                    item.stock <= 1 ? 'text-amber-400' :
                    'text-gray-400'
                  }`}>
                    {item.stock === 0 ? 'OUT' : item.stock}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Financials row */}
          {merchantState && (
            <div className="flex gap-4 font-pixel text-[10px]">
              <span className="text-green-400">Rev: ${merchantState.total_revenue}</span>
              <span className="text-red-400">Cost: ${merchantState.total_cost}</span>
              <span className={`${parseFloat(merchantState.profit) >= 0 ? 'text-[var(--zt-gold)]' : 'text-red-500'}`}>
                Profit: ${merchantState.profit}
              </span>
            </div>
          )}

          {/* Animation area */}
          <div className="relative h-16 flex items-center justify-between px-4 overflow-hidden">
            {/* Guest side */}
            <div className="z-10 flex flex-col items-center">
              <span className="text-3xl">{anim ? anim.guestEmoji : "🦁"}</span>
              {anim && (
                <span className="font-pixel text-[8px] text-[var(--zt-tan)] whitespace-nowrap mt-0.5">
                  {anim.guestAddr}
                </span>
              )}
            </div>

            {/* Animated coin (left → right) */}
            {anim && (
              <div
                key={`coin-${anim.txHash}`}
                className="zt-coin-fly absolute left-12 text-sm whitespace-nowrap"
              >
                💸 <span className="text-base">${anim.amount}</span>
              </div>
            )}

            {/* Animated product (right → left) */}
            {anim && (
              <div
                key={`item-${anim.txHash}`}
                className="zt-item-fly absolute right-12 text-lg"
              >
                {anim.productEm}
              </div>
            )}

            {/* Shop side */}
            <div className={`text-3xl z-10 ${anim ? "zt-shop-bounce" : ""}`} key={anim ? `shop-${anim.txHash}` : "shop-idle"}>
              🏪
            </div>
          </div>

          {/* Protocol step text (purchases) */}
          {protocolStep && (
            <div
              key={protocolStep}
              className="zt-step-fade font-pixel text-[10px] text-[var(--zt-gold)] px-1 truncate"
              style={{ textShadow: "0 0 6px rgba(255,215,0,0.4)" }}
            >
              &gt; {protocolStep}
            </div>
          )}

          {/* Restock protocol step */}
          {showRestockProtocol && restockProtocolStep && (
            <div
              key={restockProtocolStep}
              className="zt-step-fade font-pixel text-[10px] text-amber-400 px-1 truncate"
              style={{ textShadow: "0 0 6px rgba(245,158,11,0.4)" }}
            >
              &gt; {restockProtocolStep}
            </div>
          )}

          {/* Mini activity log */}
          {activity.length > 0 && (
            <>
              <div className="border-t border-dashed border-[var(--zt-green-mid)] my-1" />
              <div className="space-y-1">
                {activity.map((entry) => (
                  <div
                    key={entry.txHash}
                    className="font-pixel text-[10px] text-[var(--zt-tan)] flex items-center gap-1.5"
                  >
                    <span>{entry.guestEmoji}</span>
                    <span className="text-[var(--zt-tan)]">{entry.guestAddr}</span>
                    <span className="text-gray-500">bought</span>
                    <span>{entry.productEm} {entry.productName}</span>
                    <span className="text-[var(--zt-gold)] ml-auto">${entry.amount}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ACP Protocol Object (restock) */}
          {restockEvents.length > 0 && (
            <RestockProtocolObject latestEvent={restockEvents[0]} />
          )}
        </div>
      </div>
    </div>
  );
}

function RestockProtocolObject({ latestEvent }: { latestEvent: ZooRestockEvent }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-t border-dashed border-[var(--zt-green-mid)] pt-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="font-pixel text-[9px] text-gray-400 hover:text-gray-300 w-full text-left"
      >
        {expanded ? '▼' : '▶'} Last Restock Protocol Object
      </button>
      {expanded && (
        <pre className="font-pixel text-[9px] text-amber-300 bg-black/30 rounded px-2 py-1 mt-1 overflow-x-auto">
{JSON.stringify({
  action: 'restock_payment',
  sku: latestEvent.sku,
  name: latestEvent.name,
  units: latestEvent.quantity,
  cost: `$${latestEvent.cost}`,
  to: 'Zoo Master (supplier)',
  status: 'confirmed',
  tx_hash: latestEvent.tx_hash,
  block: latestEvent.block_number,
}, null, 2)}
        </pre>
      )}
    </div>
  );
}
