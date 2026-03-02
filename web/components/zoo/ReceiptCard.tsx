import type { ZooPurchaseReceipt } from "../../lib/types";
import { shortAddr } from "../../utils/formatting";

interface ReceiptCardProps {
  receipt: ZooPurchaseReceipt;
}

function formatAgentName(id: string): string {
  return id
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const EXPLORER_URL = "https://explore.moderato.tempo.xyz";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center py-0.5">
      <span className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</span>
      <span className="text-xs text-gray-300 font-mono">{children}</span>
    </div>
  );
}

export default function ReceiptCard({ receipt }: ReceiptCardProps) {
  const explorerUrl = `${EXPLORER_URL}/tx/${receipt.tx_hash}`;
  const time = new Date(receipt.timestamp).toLocaleTimeString();

  return (
    <div className="bg-gray-900/60 border border-[var(--zoo-tan)]/20 rounded-lg p-3">
      {/* Header: product + amount */}
      <div className="flex items-start justify-between mb-2 pb-2 border-b border-gray-800/60">
        <div>
          <span className="text-sm font-medium text-gray-200">
            {receipt.product_name}
          </span>
          <span className="text-xs text-gray-500 ml-2 font-mono">{receipt.sku}</span>
        </div>
        <span className="text-sm font-mono font-semibold text-[var(--zoo-tan)]">
          ${receipt.amount}
        </span>
      </div>

      {/* Key-value rows */}
      <div className="space-y-0.5">
        {receipt.merchant_name && (
          <Row label="Merchant">{receipt.merchant_name}</Row>
        )}
        {receipt.merchant_address && (
          <Row label="Merchant Addr">{shortAddr(receipt.merchant_address)}</Row>
        )}
        <Row label="Agent">{formatAgentName(receipt.agent_id)}</Row>
        <Row label="Tx Hash">
          {receipt.tx_hash ? (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-400 hover:text-indigo-300"
            >
              {shortAddr(receipt.tx_hash)}
            </a>
          ) : (
            "—"
          )}
        </Row>
        <Row label="Block">{receipt.block_number || "—"}</Row>
        <Row label="Gas Used">{receipt.gas_used || "—"}</Row>
        <Row label="Time">{time}</Row>
      </div>
    </div>
  );
}
