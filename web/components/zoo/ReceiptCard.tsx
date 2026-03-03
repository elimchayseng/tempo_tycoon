import type { ZooPurchaseReceipt } from "../../lib/types";
import { shortAddr, productEmoji, formatGuestLabel } from "../../utils/formatting";

interface ReceiptCardProps {
  receipt: ZooPurchaseReceipt;
}

const EXPLORER_URL = "https://explore.moderato.tempo.xyz";

export default function ReceiptCard({ receipt }: ReceiptCardProps) {
  const explorerUrl = `${EXPLORER_URL}/tx/${receipt.tx_hash}`;
  const time = new Date(receipt.timestamp).toLocaleTimeString();
  const emoji = productEmoji(receipt.product_name);

  return (
    <div className="zt-bevel overflow-hidden shrink-0" style={{ width: 220 }}>
      {/* Title bar */}
      <div className="zt-titlebar flex items-center justify-between text-[8px] px-2 py-0.5">
        <span className="truncate">
          {emoji} {receipt.product_name}
        </span>
        <span className="text-[var(--zt-gold)] ml-1 whitespace-nowrap">${receipt.amount}</span>
      </div>

      {/* Compact parchment body */}
      <div className="zt-parchment px-2 py-1.5 space-y-0.5">
        {receipt.merchant_name && (
          <div className="flex justify-between">
            <span className="font-pixel text-[6px] text-[var(--zt-text-mid)] uppercase">Merchant</span>
            <span className="font-pixel text-[7px] text-[var(--zt-text-dark)]">{receipt.merchant_name}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="font-pixel text-[6px] text-[var(--zt-text-mid)] uppercase">Guest</span>
          <span className="font-pixel text-[7px] text-[var(--zt-text-dark)] truncate ml-1 max-w-[130px] text-right">
            {formatGuestLabel(receipt.agent_id, receipt.agent_address)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="font-pixel text-[6px] text-[var(--zt-text-mid)] uppercase">Tx</span>
          {receipt.tx_hash ? (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[7px] text-[var(--zt-green-mid)] hover:text-[var(--zt-green-light)] underline"
            >
              {shortAddr(receipt.tx_hash)}
            </a>
          ) : (
            <span className="font-mono text-[7px] text-[var(--zt-text-dark)]">—</span>
          )}
        </div>
        <div className="flex justify-between">
          <span className="font-pixel text-[6px] text-[var(--zt-text-mid)] uppercase">Block</span>
          <span className="font-mono text-[7px] text-[var(--zt-text-dark)]">{receipt.block_number || "—"}</span>
        </div>
        {receipt.gas_used && (
          <div className="flex justify-between">
            <span className="font-pixel text-[6px] text-[var(--zt-text-mid)] uppercase">Gas</span>
            <span className="font-mono text-[7px] text-[var(--zt-text-dark)]">{Number(receipt.gas_used).toLocaleString()}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="font-pixel text-[6px] text-[var(--zt-text-mid)] uppercase">Time</span>
          <span className="font-mono text-[7px] text-[var(--zt-text-dark)]">{time}</span>
        </div>
      </div>
    </div>
  );
}
