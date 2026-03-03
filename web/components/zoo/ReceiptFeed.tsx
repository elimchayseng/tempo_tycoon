import { useEffect, useRef, useState } from "react";
import type { ZooPurchaseReceipt } from "../../lib/types";
import { productEmoji } from "../../utils/formatting";
import ReceiptViewer from "./ReceiptViewer";

interface ReceiptFeedProps {
  receipts: ZooPurchaseReceipt[];
}

export default function ReceiptFeed({ receipts }: ReceiptFeedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);
  const [boothOpen, setBoothOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Auto-scroll to show newest receipt (left edge)
  useEffect(() => {
    if (receipts.length > prevCountRef.current && containerRef.current) {
      containerRef.current.scrollLeft = 0;
    }
    prevCountRef.current = receipts.length;
  }, [receipts.length]);

  function openViewer(index: number) {
    setSelectedIndex(index);
    setBoothOpen(true);
  }

  if (receipts.length === 0) {
    return (
      <div className="h-[50px] flex items-center justify-center border-t border-[var(--zt-border-dark)]">
        <p className="font-pixel text-[9px] text-[var(--zt-tan)] leading-relaxed text-center">
          No purchase receipts yet. Guests will buy food once the zoo is open!
        </p>
      </div>
    );
  }

  return (
    <div className="border-t border-[var(--zt-border-dark)]">
      {/* Header row */}
      <div className="px-5 pt-2 pb-1 flex items-center justify-between">
        <span className="font-pixel text-[7px] text-[var(--zt-tan)] uppercase tracking-widest">
          TX Receipts
        </span>
        <button
          onClick={() => openViewer(0)}
          className="font-pixel text-[8px] text-[var(--zt-gold)] hover:text-white transition-colors"
        >
          ---&gt; View All Receipts
        </button>
      </div>

      {/* Chip strip */}
      <div
        ref={containerRef}
        className="overflow-x-auto px-5 pb-3"
      >
        <div className="flex flex-row flex-nowrap gap-2">
          {receipts.map((receipt, i) => {
            const emoji = productEmoji(receipt.product_name);
            return (
              <button
                key={`${receipt.tx_hash}-${i}`}
                onClick={() => openViewer(i)}
                className="zt-chip zt-parchment shrink-0 px-2 py-1 cursor-pointer flex items-center gap-1"
                style={{ minWidth: 140 }}
              >
                <span className="text-sm">{emoji}</span>
                <span className="font-pixel text-[9px] text-[var(--zt-text-dark)] truncate">
                  {receipt.product_name}
                </span>
                <span className="font-pixel text-[9px] text-[var(--zt-gold)] ml-auto whitespace-nowrap">
                  ${receipt.amount}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Receipt Viewer modal */}
      {boothOpen && (
        <ReceiptViewer
          receipts={receipts}
          initialIndex={selectedIndex}
          onClose={() => setBoothOpen(false)}
        />
      )}
    </div>
  );
}
