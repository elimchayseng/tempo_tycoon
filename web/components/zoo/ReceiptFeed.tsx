import { useEffect, useRef } from "react";
import type { ZooPurchaseReceipt } from "../../lib/types";
import ReceiptCard from "./ReceiptCard";

interface ReceiptFeedProps {
  receipts: ZooPurchaseReceipt[];
}

export default function ReceiptFeed({ receipts }: ReceiptFeedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  // Auto-scroll to show newest receipt (left edge)
  useEffect(() => {
    if (receipts.length > prevCountRef.current && containerRef.current) {
      containerRef.current.scrollLeft = 0;
    }
    prevCountRef.current = receipts.length;
  }, [receipts.length]);

  if (receipts.length === 0) {
    return (
      <div className="h-[130px] flex items-center justify-center border-t border-[var(--zt-border-dark)]">
        <p className="font-pixel text-[8px] text-[var(--zt-tan)] leading-relaxed text-center">
          No purchase receipts yet. Guests will buy food once the zoo is open!
        </p>
      </div>
    );
  }

  return (
    <div className="border-t border-[var(--zt-border-dark)]">
      <div className="px-5 pt-2 pb-1">
        <span className="font-pixel text-[7px] text-[var(--zt-tan)] uppercase tracking-widest">
          Receipts
        </span>
      </div>
      <div
        ref={containerRef}
        className="overflow-x-auto px-5 pb-3"
      >
        <div className="flex flex-row flex-nowrap gap-3">
          {receipts.map((receipt, i) => (
            <ReceiptCard key={`${receipt.tx_hash}-${i}`} receipt={receipt} />
          ))}
        </div>
      </div>
    </div>
  );
}
