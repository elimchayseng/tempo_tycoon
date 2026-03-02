import { useEffect, useRef, useState } from "react";
import type { Account, ZooPurchaseReceipt } from "../../lib/types";
import { shortAddr, formatAlphaUsdBalance, ANIMAL_EMOJI, ANIMAL_NAME, productEmoji } from "../../utils/formatting";

interface MerchantPanelProps {
  merchant: Account | undefined;
  latestReceipt: ZooPurchaseReceipt | null;
}

interface AnimState {
  guestEmoji: string;
  guestName: string;
  productEm: string;
  amount: string;
  txHash: string;
}

interface ActivityEntry {
  guestEmoji: string;
  guestName: string;
  productEm: string;
  productName: string;
  amount: string;
  txHash: string;
}

function buildProtocolSteps(receipt: ZooPurchaseReceipt, guestEmoji: string, guestName: string): { text: string; delay: number }[] {
  const prodEm = productEmoji(receipt.product_name);
  return [
    { text: `${guestEmoji} ${guestName} evaluating purchase decision...`, delay: 0 },
    { text: `Discovering merchants via /api/zoo/registry`, delay: 600 },
    { text: `Browsing merchant catalog...`, delay: 1200 },
    { text: `Found ${prodEm} ${receipt.product_name} — $${receipt.amount} AUSD`, delay: 1800 },
    { text: `Creating checkout session...`, delay: 2400 },
    { text: `🔐 Signing transferWithMemo tx...`, delay: 3000 },
    { text: `📡 Broadcasting to Tempo Moderato...`, delay: 3600 },
    { text: `✅ AlphaUSD transfer confirmed on-chain!`, delay: 4200 },
  ];
}

const ALPHA_USD = "0x20c0000000000000000000000000000000000001";

export default function MerchantPanel({ merchant, latestReceipt }: MerchantPanelProps) {
  const lastTxRef = useRef<string | null>(null);
  const [anim, setAnim] = useState<AnimState | null>(null);
  const [balanceFlash, setBalanceFlash] = useState(false);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [protocolStep, setProtocolStep] = useState<string | null>(null);
  const stepTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (!latestReceipt) return;
    if (latestReceipt.tx_hash === lastTxRef.current) return;

    lastTxRef.current = latestReceipt.tx_hash;

    const guestEmoji = ANIMAL_EMOJI[latestReceipt.agent_id] ?? "🦊";
    const guestName = ANIMAL_NAME[latestReceipt.agent_id] ?? latestReceipt.agent_id;
    const productEm = productEmoji(latestReceipt.product_name);

    setAnim({
      guestEmoji,
      guestName,
      productEm,
      amount: latestReceipt.amount,
      txHash: latestReceipt.tx_hash,
    });
    setBalanceFlash(true);

    setActivity((prev) => [
      {
        guestEmoji,
        guestName,
        productEm,
        productName: latestReceipt.product_name,
        amount: latestReceipt.amount,
        txHash: latestReceipt.tx_hash,
      },
      ...prev.slice(0, 2),
    ]);

    // Clear any in-flight protocol step timers from a previous purchase
    stepTimersRef.current.forEach(clearTimeout);
    stepTimersRef.current = [];

    const steps = buildProtocolSteps(latestReceipt, guestEmoji, guestName);
    for (const step of steps) {
      const id = setTimeout(() => setProtocolStep(step.text), step.delay);
      stepTimersRef.current.push(id);
    }

    const timer = setTimeout(() => {
      setAnim(null);
      setBalanceFlash(false);
      setProtocolStep(null);
    }, 5000);
    stepTimersRef.current.push(timer);

    return () => {
      stepTimersRef.current.forEach(clearTimeout);
      stepTimersRef.current = [];
    };
  }, [latestReceipt]);

  if (!merchant) return null;

  const rawBalance = merchant.balances[ALPHA_USD] ?? "0";
  const balance = formatAlphaUsdBalance(rawBalance);

  return (
    <div className="px-5 pt-4 shrink-0">
      <div className="zt-bevel overflow-hidden">
        {/* Title bar */}
        <div className="zt-titlebar flex items-center justify-between">
          <span>🏪 ZOO GIFT SHOP</span>
          <span className={balanceFlash ? "zt-balance-flash" : "text-[var(--zt-gold)]"}>
            💰 {balance}
          </span>
        </div>

        {/* Body */}
        <div className="bg-[var(--zt-green-dark)] px-4 py-3 space-y-3">
          {/* Wallet address */}
          <div className="font-pixel text-[10px] text-gray-500">
            Wallet: {shortAddr(merchant.address)}
          </div>

          {/* Animation area */}
          <div className="relative h-16 flex items-center justify-between px-4 overflow-hidden">
            {/* Guest side */}
            <div className="z-10 flex flex-col items-center">
              <span className="text-3xl">{anim ? anim.guestEmoji : "🦁"}</span>
              {anim && (
                <span className="font-pixel text-[8px] text-[var(--zt-tan)] whitespace-nowrap mt-0.5">
                  {(anim.guestName ?? "Guest").split(" ")[0]}
                </span>
              )}
            </div>

            {/* Animated coin (left → right) */}
            {anim && (
              <div
                key={`coin-${anim.txHash}`}
                className="zt-coin-fly absolute left-12 text-sm whitespace-nowrap"
              >
                💸 <span className="text-base">${anim.amount}</span>
              </div>
            )}

            {/* Animated product (right → left) */}
            {anim && (
              <div
                key={`item-${anim.txHash}`}
                className="zt-item-fly absolute right-12 text-lg"
              >
                {anim.productEm}
              </div>
            )}

            {/* Shop side */}
            <div className={`text-3xl z-10 ${anim ? "zt-shop-bounce" : ""}`} key={anim ? `shop-${anim.txHash}` : "shop-idle"}>
              🏪
            </div>
          </div>

          {/* Protocol step text */}
          {protocolStep && (
            <div
              key={protocolStep}
              className="zt-step-fade font-pixel text-[10px] text-[var(--zt-gold)] px-1 truncate"
              style={{ textShadow: "0 0 6px rgba(255,215,0,0.4)" }}
            >
              &gt; {protocolStep}
            </div>
          )}

          {/* Mini activity log */}
          {activity.length > 0 && (
            <>
              <div className="border-t border-dashed border-[var(--zt-green-mid)] my-1" />
              <div className="space-y-1">
                {activity.map((entry) => (
                  <div
                    key={entry.txHash}
                    className="font-pixel text-[10px] text-[var(--zt-tan)] flex items-center gap-1.5"
                  >
                    <span>{entry.guestEmoji}</span>
                    <span className="text-[var(--zt-tan)]">{(entry.guestName ?? "Guest").split(" ")[0]}</span>
                    <span className="text-gray-500">bought</span>
                    <span>{entry.productEm} {entry.productName}</span>
                    <span className="text-[var(--zt-gold)] ml-auto">${entry.amount}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
