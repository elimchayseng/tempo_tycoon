import type { ZooPurchaseReceipt } from "../../lib/types";
import { shortAddr, productEmoji, formatGuestLabel } from "../../utils/formatting";

interface ReceiptCardProps {
  receipt: ZooPurchaseReceipt;
}

const EXPLORER_URL = "https://explore.moderato.tempo.xyz";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-1">
      <span className="font-pixel text-[8px] text-[var(--zt-text-mid)] uppercase tracking-wide">
        {label}
      </span>
      <span className="text-sm text-[var(--zt-text-dark)] font-mono break-all">{children}</span>
    </div>
  );
}

export default function ReceiptCard({ receipt }: ReceiptCardProps) {
  const explorerUrl = `${EXPLORER_URL}/tx/${receipt.tx_hash}`;
  const time = new Date(receipt.timestamp).toLocaleTimeString();
  const emoji = productEmoji(receipt.product_name);

  return (
    <div className="zt-bevel overflow-hidden">
      {/* Green title bar */}
      <div className="zt-titlebar flex items-center justify-between">
        <span>
          {emoji} {receipt.product_name}
        </span>
        <span className="text-[var(--zt-gold)]">${receipt.amount} AUSD</span>
      </div>

      {/* Parchment body */}
      <div className="zt-parchment px-3 py-3">
        <div className="space-y-1">
          {receipt.merchant_name && (
            <Row label="Merchant">{receipt.merchant_name}</Row>
          )}
          <Row label="Guest">{formatGuestLabel(receipt.agent_id, receipt.agent_address)}</Row>
          <Row label="Tx Hash">
            {receipt.tx_hash ? (
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--zt-green-mid)] hover:text-[var(--zt-green-light)] underline"
              >
                {shortAddr(receipt.tx_hash)}
              </a>
            ) : (
              "—"
            )}
          </Row>
          <Row label="Block">{receipt.block_number || "—"}</Row>
          {receipt.gas_used && (
            <Row label="Gas Used">{Number(receipt.gas_used).toLocaleString()}</Row>
          )}
          <Row label="Time">{time}</Row>
        </div>
      </div>
    </div>
  );
}
