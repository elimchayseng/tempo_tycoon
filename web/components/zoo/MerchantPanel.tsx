import { useEffect, useRef, useState } from "react";
import type { Account, ZooPurchaseReceipt, ZooMerchantState, ZooRestockEvent, ZooLLMDecision, ZooPriceAdjustment, ZooAgentState } from "../../lib/types";
import { shortAddr, formatAlphaUsdBalance, ANIMAL_EMOJI, formatGuestLabel, productEmoji, cartDisplayInfo } from "../../utils/formatting";
import { MerchantLlmTerminal, MerchantAcpTerminal } from "./MerchantBrainTerminal";
import ReceiptViewer from "./ReceiptViewer";

interface MerchantPanelProps {
  merchant: Account | undefined;
  agents: ZooAgentState[];
  latestReceipt: ZooPurchaseReceipt | null;
  merchantState: ZooMerchantState | null;
  restockEvents: ZooRestockEvent[];
  merchantDecision: ZooLLMDecision | null;
  priceAdjustments: ZooPriceAdjustment[];
  simulationComplete?: boolean;
  receipts: ZooPurchaseReceipt[];
}

// Re-export for backward compat — ZooParkView is now rendered separately


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

export default function MerchantPanel({ merchant, agents, latestReceipt, merchantState, restockEvents, merchantDecision, priceAdjustments, simulationComplete, receipts }: MerchantPanelProps) {
  const lastTxRef = useRef<string | null>(null);
  const [balanceFlash, setBalanceFlash] = useState(false);
  const [flashingSkus, setFlashingSkus] = useState<Set<string>>(new Set());
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPriceAdjRef = useRef<number>(0);
  const balanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Receipt viewer modal state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  // Balance flash on purchase
  useEffect(() => {
    if (!latestReceipt) {
      setBalanceFlash(false);
      lastTxRef.current = null;
      return;
    }
    if (latestReceipt.tx_hash === lastTxRef.current) return;
    lastTxRef.current = latestReceipt.tx_hash;
    setBalanceFlash(true);
    if (balanceTimerRef.current) clearTimeout(balanceTimerRef.current);
    balanceTimerRef.current = setTimeout(() => setBalanceFlash(false), 2500);
    return () => {
      if (balanceTimerRef.current) clearTimeout(balanceTimerRef.current);
    };
  }, [latestReceipt]);

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
    <div className="flex flex-col">
      {/* Balance readout */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--zt-green-mid)]">
        <span className="font-pixel text-[8px] text-[var(--zt-tan)] uppercase">Balance</span>
        <span className={`font-pixel text-[11px] ${balanceFlash ? "zt-balance-flash" : "text-[var(--zt-gold)]"}`}>
          {balance}
        </span>
      </div>

      <div className="px-3 py-2 flex flex-col">
          {/* Inventory catalog */}
          {inventory.length > 0 && (
            <div className="border-t border-dashed border-[var(--zt-green-mid)] pt-1.5 space-y-0.5 shrink-0">
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
                    <span className={`w-16 text-right whitespace-nowrap ${pctColor}`} style={{ fontSize: "7px" }}>
                      {pctDiff !== 0 ? `${pctSign}${pctDiff.toFixed(0)}% net` : "—"}
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

          {/* Wallet + Financials — shrink-0 */}
          <div className="flex items-center justify-between shrink-0 mt-2">
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

          {/* Terminal section — compact, fills remaining space */}
          <div className="flex-1 flex flex-col min-h-0 mt-2 gap-1">
            <MerchantLlmTerminal
              decision={merchantDecision}
              simulationComplete={simulationComplete}
              merchantState={merchantState}
            />
            <MerchantAcpTerminal
              decision={merchantDecision}
              priceAdjustments={priceAdjustments}
              restockEvents={restockEvents}
              simulationComplete={simulationComplete}
            />
          </div>

          {/* Purchase History — shrink-0, below terminals */}
          <div className="border-t border-dashed border-[var(--zt-green-mid)] pt-2 shrink-0">
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

export type { MerchantPanelProps };
