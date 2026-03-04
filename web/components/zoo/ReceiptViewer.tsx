import { useEffect, useState, useCallback } from "react";
import type { ZooPurchaseReceipt } from "../../lib/types";
import { shortAddr, cartDisplayInfo, formatGuestLabel } from "../../utils/formatting";

const EXPLORER_URL = "https://explore.moderato.tempo.xyz";

interface ReceiptViewerProps {
  receipts: ZooPurchaseReceipt[];
  initialIndex: number;
  onClose: () => void;
}

export default function ReceiptViewer({ receipts, initialIndex, onClose }: ReceiptViewerProps) {
  const [index, setIndex] = useState(initialIndex);

  const goPrev = useCallback(() => {
    setIndex((i) => (i > 0 ? i - 1 : i));
  }, []);

  const goNext = useCallback(() => {
    setIndex((i) => (i < receipts.length - 1 ? i + 1 : i));
  }, [receipts.length]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, goPrev, goNext]);

  const receipt = receipts[index];
  if (!receipt) return null;

  const { emojis, displayName } = cartDisplayInfo(receipt.items);
  const explorerUrl = `${EXPLORER_URL}/tx/${receipt.tx_hash}`;
  const time = new Date(receipt.timestamp).toLocaleTimeString();
  const needChange = receipt.need_after - receipt.need_before;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="zt-bevel max-w-md w-full mx-4 zt-booth-enter"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title bar */}
        <div className="zt-titlebar flex items-center justify-between">
          <span>TX RECEIPTS</span>
          <button
            onClick={onClose}
            className="font-pixel text-[11px] text-white/80 hover:text-white leading-none"
          >
            X
          </button>
        </div>

        {/* Receipt ticket */}
        <div className="zt-parchment p-4">
          {/* Header: emoji + product + amount */}
          <div className="flex items-center gap-3 pb-2">
            <span className="text-2xl">{emojis}</span>
            <div className="flex-1">
              <div className="font-pixel text-[12px] text-[var(--zt-text-dark)]">
                {displayName}
              </div>
            </div>
            <div className="font-pixel text-[14px] text-[var(--zt-text-dark)]">
              ${receipt.amount}
            </div>
          </div>

          {/* Perforated edge */}
          <div className="zt-ticket-perf -mx-4" />

          {/* Detail fields */}
          <div className="space-y-1.5 pt-2">
            {receipt.merchant_name && (
              <Row label="Merchant" value={receipt.merchant_name} />
            )}
            <Row
              label="Guest"
              value={formatGuestLabel(receipt.agent_id, receipt.agent_address)}
            />
            <div className="flex justify-between items-center">
              <span className="font-pixel text-[8px] text-[var(--zt-text-mid)] uppercase">Tx</span>
              {receipt.tx_hash ? (
                <a
                  href={explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[10px] text-[var(--zt-green-mid)] hover:text-[var(--zt-green-light)] underline"
                >
                  {shortAddr(receipt.tx_hash)}
                </a>
              ) : (
                <span className="font-mono text-[10px] text-[var(--zt-text-dark)]">&mdash;</span>
              )}
            </div>
            <Row label="Block" value={receipt.block_number || "\u2014"} />
            {receipt.fee_ausd && (
              <Row label="Gas fee" value={`$${receipt.fee_ausd} AUSD`} />
            )}
            {receipt.fee_payer && (
              <div className="flex justify-between items-center">
                <span className="font-pixel text-[8px] text-[var(--zt-text-mid)] uppercase">Gas paid by</span>
                <span className="font-pixel text-[10px] text-[var(--zt-gold)]">{receipt.fee_payer}</span>
              </div>
            )}
            {receipt.gas_used && (
              <Row label="Gas" value={Number(receipt.gas_used).toLocaleString()} />
            )}
            <Row
              label="Need change"
              value={`${needChange >= 0 ? "+" : ""}${needChange.toFixed(1)}%`}
            />
            <Row label="Time" value={time} />
          </div>
        </div>

        {/* Navigation bar */}
        <div className="zt-statusbar flex items-center justify-between px-3 py-2">
          <button
            onClick={goPrev}
            disabled={index === 0}
            className="font-pixel text-[9px] text-white disabled:text-white/30 hover:text-[var(--zt-gold)] disabled:hover:text-white/30"
          >
            &lt; PREV
          </button>
          <span className="font-pixel text-[9px] text-[var(--zt-tan)]">
            {index + 1} of {receipts.length}
          </span>
          <button
            onClick={goNext}
            disabled={index === receipts.length - 1}
            className="font-pixel text-[9px] text-white disabled:text-white/30 hover:text-[var(--zt-gold)] disabled:hover:text-white/30"
          >
            NEXT &gt;
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="font-pixel text-[8px] text-[var(--zt-text-mid)] uppercase">{label}</span>
      <span className="font-pixel text-[10px] text-[var(--zt-text-dark)]">{value}</span>
    </div>
  );
}
