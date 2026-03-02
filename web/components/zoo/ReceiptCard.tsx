import type { ZooPurchaseReceipt } from "../../lib/types";
import { shortAddr } from "../../utils/formatting";

interface ReceiptCardProps {
  receipt: ZooPurchaseReceipt;
}

const EXPLORER_URL = "https://explore.moderato.tempo.xyz";

function productEmoji(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("hotdog") || lower.includes("hot dog")) return "🌭";
  if (lower.includes("burger") || lower.includes("hamburger")) return "🍔";
  if (lower.includes("soda") || lower.includes("drink")) return "🥤";
  if (lower.includes("popcorn")) return "🍿";
  if (lower.includes("nacho")) return "🧀";
  if (lower.includes("ice cream") || lower.includes("icecream")) return "🍦";
  if (lower.includes("pretzel")) return "🥨";
  if (lower.includes("pizza")) return "🍕";
  if (lower.includes("fries") || lower.includes("french")) return "🍟";
  if (lower.includes("cotton candy")) return "🍬";
  if (lower.includes("water") || lower.includes("bottle")) return "💧";
  if (lower.includes("coffee")) return "☕";
  return "🍽️";
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center py-0.5">
      <span className="font-pixel text-[7px] text-[var(--zt-text-mid)] uppercase tracking-wide">
        {label}
      </span>
      <span className="text-xs text-[var(--zt-text-dark)] font-mono">{children}</span>
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
        <span className="text-[var(--zt-gold)]">${receipt.amount}</span>
      </div>

      {/* Parchment body */}
      <div className="zt-parchment px-3 py-2">
        <div className="space-y-0.5">
          {receipt.merchant_name && (
            <Row label="Merchant">{receipt.merchant_name}</Row>
          )}
          <Row label="Guest">{shortAddr(receipt.agent_id)}</Row>
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
          <Row label="Time">{time}</Row>
        </div>
      </div>
    </div>
  );
}
