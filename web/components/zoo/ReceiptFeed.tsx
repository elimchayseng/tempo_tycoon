import { useEffect, useRef } from "react";
import type { ZooPurchaseReceipt } from "../../lib/types";
import ReceiptCard from "./ReceiptCard";

interface ReceiptFeedProps {
  receipts: ZooPurchaseReceipt[];
}

export default function ReceiptFeed({ receipts }: ReceiptFeedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  // Auto-scroll when new receipts arrive (only if near top)
  useEffect(() => {
    if (receipts.length > prevCountRef.current && containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
    prevCountRef.current = receipts.length;
  }, [receipts.length]);

  if (receipts.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="font-pixel text-[10px] text-[var(--zt-tan)] leading-relaxed text-center">
          No purchase receipts yet.<br />
          Guests will buy food once<br />
          the zoo is open!
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto px-5 py-4"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {receipts.map((receipt, i) => (
          <ReceiptCard key={`${receipt.tx_hash}-${i}`} receipt={receipt} />
        ))}
      </div>
    </div>
  );
}
