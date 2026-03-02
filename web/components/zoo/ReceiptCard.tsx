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

function MiniBar({ value, label }: { value: number; label: string }) {
  const pct = Math.min(value, 100);
  const color =
    pct > 60 ? "bg-emerald-500" : pct > 30 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-gray-500 w-10">{label}</span>
      <div className="w-16 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] text-gray-500 font-mono w-6 text-right">{value}</span>
    </div>
  );
}

export default function ReceiptCard({ receipt }: ReceiptCardProps) {
  const explorerUrl = `https://moderato.explorer.calderaexplorer.xyz/tx/${receipt.tx_hash}`;
  const time = new Date(receipt.timestamp).toLocaleTimeString();

  return (
    <div className="bg-gray-900/60 border border-[var(--zoo-tan)]/20 rounded-lg p-3">
      <div className="flex items-start justify-between mb-2">
        <div>
          <span className="text-sm font-medium text-gray-200">
            {receipt.product_name}
          </span>
          <span className="text-xs text-gray-500 ml-2 font-mono">{receipt.sku}</span>
        </div>
        <span className="text-sm font-mono text-[var(--zoo-tan)]">
          ${receipt.amount}
        </span>
      </div>

      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-400">
          {formatAgentName(receipt.agent_id)}
        </span>
        <span className="text-[10px] text-gray-600">{time}</span>
      </div>

      {/* Transaction details */}
      <div className="grid grid-cols-3 gap-2 text-[10px] text-gray-500 mb-2">
        <div>
          tx:{" "}
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-400 hover:text-indigo-300 font-mono"
          >
            {receipt.tx_hash ? shortAddr(receipt.tx_hash) : "—"}
          </a>
        </div>
        <div>block: <span className="font-mono text-gray-400">{receipt.block_number || "—"}</span></div>
        <div>gas: <span className="font-mono text-gray-400">{receipt.gas_used || "—"}</span></div>
      </div>

      {/* Need before/after */}
      <div className="flex gap-4">
        <MiniBar value={receipt.need_before} label="before" />
        <MiniBar value={receipt.need_after} label="after" />
      </div>
    </div>
  );
}
