import { useEffect, useRef, useState } from "react";
import type { Account, ZooPurchaseReceipt, ZooMerchantState, ZooRestockEvent, ZooLLMDecision, ZooPriceAdjustment } from "../../lib/types";
import { shortAddr, formatAlphaUsdBalance, ANIMAL_EMOJI, formatGuestLabel, productEmoji, cartDisplayInfo } from "../../utils/formatting";
import MerchantBrainTerminal from "./MerchantBrainTerminal";
import ReceiptViewer from "./ReceiptViewer";

interface MerchantPanelProps {
  merchant: Account | undefined;
  latestReceipt: ZooPurchaseReceipt | null;
  merchantState: ZooMerchantState | null;
  restockEvents: ZooRestockEvent[];
  merchantDecision: ZooLLMDecision | null;
  priceAdjustments: ZooPriceAdjustment[];
  simulationComplete?: boolean;
  receipts: ZooPurchaseReceipt[];
}

interface AnimState {
  guestEmoji: string;
  guestAddr: string;
  productEm: string;
  amount: string;
  txHash: string;
}

interface RestockAnimState {
  productEm: string;
  key: string;
}

const ALPHA_USD = "0x20c0000000000000000000000000000000000001";
const EXPLORER_URL = "https://explore.moderato.tempo.xyz";

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

export default function MerchantPanel({ merchant, latestReceipt, merchantState, restockEvents, merchantDecision, priceAdjustments, simulationComplete, receipts }: MerchantPanelProps) {
  const lastTxRef = useRef<string | null>(null);
  const lastRestockRef = useRef<string | null>(null);
  const [anim, setAnim] = useState<AnimState | null>(null);
  const [restockAnim, setRestockAnim] = useState<RestockAnimState | null>(null);
  const [balanceFlash, setBalanceFlash] = useState(false);
  const [flashingSkus, setFlashingSkus] = useState<Set<string>>(new Set());
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPriceAdjRef = useRef<number>(0);
  const stepTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const restockTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Receipt viewer modal state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  // Purchase animation
  useEffect(() => {
    if (!latestReceipt) {
      stepTimersRef.current.forEach(clearTimeout);
      stepTimersRef.current = [];
      setAnim(null);
      setBalanceFlash(false);
      lastTxRef.current = null;
      return;
    }
    if (latestReceipt.tx_hash === lastTxRef.current) return;

    lastTxRef.current = latestReceipt.tx_hash;

    const guestEmoji = ANIMAL_EMOJI[latestReceipt.agent_id] ?? "🧑";
    const guestAddr = latestReceipt.agent_address ? shortAddr(latestReceipt.agent_address) : latestReceipt.agent_id;
    const { emojis: cartEmojis } = cartDisplayInfo(latestReceipt.items);

    setAnim({
      guestEmoji,
      guestAddr,
      productEm: cartEmojis,
      amount: latestReceipt.amount,
      txHash: latestReceipt.tx_hash,
    });
    setBalanceFlash(true);

    stepTimersRef.current.forEach(clearTimeout);
    stepTimersRef.current = [];

    const timer = setTimeout(() => {
      setAnim(null);
      setBalanceFlash(false);
    }, 5000);
    stepTimersRef.current.push(timer);

    return () => {
      stepTimersRef.current.forEach(clearTimeout);
      stepTimersRef.current = [];
      setAnim(null);
      setBalanceFlash(false);
    };
  }, [latestReceipt]);

  // Restock animation
  useEffect(() => {
    const latestRestock = restockEvents[0];
    if (!latestRestock) {
      restockTimersRef.current.forEach(clearTimeout);
      restockTimersRef.current = [];
      setRestockAnim(null);
      lastRestockRef.current = null;
      return;
    }
    if (latestRestock.tx_hash === lastRestockRef.current) return;

    lastRestockRef.current = latestRestock.tx_hash;
    const prodEm = productEmoji(latestRestock.name);

    setRestockAnim({ productEm: prodEm, key: latestRestock.tx_hash });

    restockTimersRef.current.forEach(clearTimeout);
    restockTimersRef.current = [];

    const animTimer = setTimeout(() => setRestockAnim(null), 1500);
    restockTimersRef.current.push(animTimer);

    return () => {
      restockTimersRef.current.forEach(clearTimeout);
      restockTimersRef.current = [];
      setRestockAnim(null);
    };
  }, [restockEvents]);

  // Price flash animation
  useEffect(() => {
    if (priceAdjustments.length === 0) return;
    const latestTs = priceAdjustments[0]?.timestamp ?? 0;
    if (latestTs === lastPriceAdjRef.current) return;
    lastPriceAdjRef.current = latestTs;

    const skus = new Set(priceAdjustments.filter((pa) => pa.timestamp === latestTs).map((pa) => pa.sku));
    setFlashingSkus(skus);

    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlashingSkus(new Set()), 1500);

    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, [priceAdjustments]);

  const rawBalance = merchant?.balances[ALPHA_USD] ?? "0";
  const balance = formatAlphaUsdBalance(rawBalance);
  const inventory = merchantState?.inventory ?? [];

  return (
    <div className="h-full flex flex-col p-2 overflow-y-auto">
      <div className="zt-bevel overflow-hidden flex flex-col">
        {/* Title bar */}
        <div className="zt-titlebar flex items-center justify-between shrink-0">
          <span>🏪 ZOO GIFT SHOP</span>
          <span className={balanceFlash ? "zt-balance-flash" : "text-[var(--zt-gold)]"}>
            💰 {balance}
          </span>
        </div>

        {/* Body */}
        <div className="bg-[var(--zt-green-dark)] px-3 py-2 space-y-2 flex-1 min-h-0 overflow-y-auto">
          {/* Wallet + Financials */}
          <div className="flex items-center justify-between">
            <div className="font-pixel text-[9px] text-gray-500">
              Merchant Wallet:{" "}
              {merchant ? (
                <a
                  href={`${EXPLORER_URL}/address/${merchant.address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--zt-green-light)] hover:text-[var(--zt-gold)] hover:underline cursor-pointer transition-colors"
                >
                  {shortAddr(merchant.address)}
                </a>
              ) : (
                <span className="text-gray-600">...</span>
              )}
            </div>
            {merchantState && (
              <div className="flex gap-3 font-pixel text-[9px]">
                <span className="text-green-400">Rev: ${merchantState.total_revenue}</span>
                <span className="text-red-400">Cost: ${merchantState.total_cost}</span>
                <span className={`${parseFloat(merchantState.profit) >= 0 ? 'text-[var(--zt-gold)]' : 'text-red-500'}`}>
                  Profit: ${merchantState.profit}
                </span>
              </div>
            )}
          </div>

          {/* Animation area */}
          <div className="relative">
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

              {/* Animated coin */}
              {anim && (
                <div key={`coin-${anim.txHash}`} className="zt-coin-fly absolute left-12 text-sm whitespace-nowrap">
                  💸 <span className="text-base">${anim.amount}</span>
                </div>
              )}

              {/* Animated product */}
              {anim && (
                <div key={`item-${anim.txHash}`} className="zt-item-fly absolute right-12 text-lg">
                  {anim.productEm}
                </div>
              )}

              {/* Shop side */}
              <div className="relative z-10">
                {restockAnim && (
                  <div
                    key={`restock-${restockAnim.key}`}
                    className="zt-restock-drop absolute -top-2 left-1/2 -translate-x-1/2 text-xl pointer-events-none"
                  >
                    {restockAnim.productEm}
                  </div>
                )}
                <div
                  className={`text-3xl ${anim ? "zt-shop-bounce" : ""} ${restockAnim ? "zt-shop-absorb" : ""}`}
                  key={anim ? `shop-${anim.txHash}` : restockAnim ? `shop-restock-${restockAnim.key}` : "shop-idle"}
                >
                  🏪
                </div>
              </div>
            </div>
          </div>

          {/* Inventory catalog */}
          {inventory.length > 0 && (
            <div className="border-t border-dashed border-[var(--zt-green-mid)] pt-1.5 space-y-0.5">
              <div className="font-pixel text-[8px] text-gray-500 uppercase tracking-wider mb-0.5">Catalog</div>
              {inventory.map((item) => {
                const price = parseFloat(item.price);
                const basePrice = parseFloat(item.base_price || item.price);
                const pctDiff = basePrice > 0 ? ((price - basePrice) / basePrice) * 100 : 0;
                const pctColor = pctDiff > 0 ? "text-green-400" : pctDiff < 0 ? "text-red-400" : "text-gray-500";
                const pctSign = pctDiff > 0 ? "+" : "";
                const isFlashing = flashingSkus.has(item.sku);

                return (
                  <div key={item.sku} className="flex items-center gap-1.5 font-pixel text-[9px]">
                    <span className="text-xs">{productEmoji(item.name)}</span>
                    <span className="text-[var(--zt-tan)] min-w-[60px] truncate">{item.name}</span>
                    <span className={`w-12 text-right ${isFlashing ? "zt-price-flash" : "text-[var(--zt-gold)]"}`}>
                      ${price.toFixed(2)}
                    </span>
                    <span className={`w-10 text-right ${pctColor}`} style={{ fontSize: "7px" }}>
                      {pctDiff !== 0 ? `${pctSign}${pctDiff.toFixed(0)}%` : "—"}
                    </span>
                    <StockBar stock={item.stock} maxStock={item.max_stock} />
                    <span className={`w-5 text-right ${
                      item.stock === 0 ? 'text-red-500 font-bold' :
                      item.stock <= 1 ? 'text-amber-400' :
                      'text-gray-500'
                    }`}>
                      {item.stock === 0 ? '!' : item.stock}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Merchant Brain Terminal */}
          <MerchantBrainTerminal
            decision={merchantDecision}
            priceAdjustments={priceAdjustments}
            restockEvents={restockEvents}
            simulationComplete={simulationComplete}
            merchantState={merchantState}
          />

          {/* Purchase History Table */}
          <div className="border-t border-dashed border-[var(--zt-green-mid)] pt-2">
            <div className="flex items-center justify-between mb-1">
              <span className="font-pixel text-[7px] text-[var(--zt-tan)] uppercase tracking-widest">
                🧾 Purchase History
              </span>
              {receipts.length > 0 && (
                <button
                  onClick={() => { setViewerIndex(0); setViewerOpen(true); }}
                  className="font-pixel text-[7px] text-[var(--zt-gold)] hover:text-white transition-colors"
                >
                  View All →
                </button>
              )}
            </div>
            {receipts.length === 0 ? (
              <div className="text-center py-2">
                <span className="font-pixel text-[7px] text-gray-500">No purchases yet</span>
              </div>
            ) : (
              <div className="max-h-[140px] overflow-y-auto">
                <table className="w-full font-pixel text-[8px]">
                  <thead>
                    <tr className="text-gray-500 text-left">
                      <th className="pb-1 pr-1">#</th>
                      <th className="pb-1 pr-1">Guest</th>
                      <th className="pb-1 pr-1">Items</th>
                      <th className="pb-1 pr-1 text-right">Amount</th>
                      <th className="pb-1 text-right">TX</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receipts.map((receipt, i) => {
                      const guestEmoji = ANIMAL_EMOJI[receipt.agent_id] ?? "🧑";
                      const { emojis } = cartDisplayInfo(receipt.items);
                      const txShort = receipt.tx_hash ? `${receipt.tx_hash.slice(0, 6)}..` : "—";

                      return (
                        <tr
                          key={`${receipt.tx_hash}-${i}`}
                          className="hover:bg-[var(--zt-green-mid)]/30 cursor-pointer transition-colors border-t border-[var(--zt-green-mid)]/30"
                          onClick={() => { setViewerIndex(i); setViewerOpen(true); }}
                        >
                          <td className="py-0.5 pr-1 text-gray-500">{receipts.length - i}</td>
                          <td className="py-0.5 pr-1">{guestEmoji}</td>
                          <td className="py-0.5 pr-1">{emojis}</td>
                          <td className="py-0.5 pr-1 text-right text-[var(--zt-gold)]">${receipt.amount}</td>
                          <td className="py-0.5 text-right">
                            {receipt.tx_hash ? (
                              <a
                                href={`${EXPLORER_URL}/tx/${receipt.tx_hash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[var(--zt-green-light)] hover:text-[var(--zt-gold)] hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {txShort}
                              </a>
                            ) : (
                              <span className="text-gray-500">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Receipt Viewer modal */}
      {viewerOpen && (
        <ReceiptViewer
          receipts={receipts}
          initialIndex={viewerIndex}
          onClose={() => setViewerOpen(false)}
        />
      )}
    </div>
  );
}
