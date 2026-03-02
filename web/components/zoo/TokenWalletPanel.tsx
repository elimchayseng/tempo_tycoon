import { useEffect } from "react";
import type { TokenInfo, WalletInfo, BalanceHistoryEntry } from "../../lib/types";
import { shortAddr } from "../../utils/formatting";
import BalanceHistorySparkline from "./BalanceHistorySparkline";

interface TokenWalletPanelProps {
  tokenInfo: TokenInfo | null;
  wallets: WalletInfo[];
  balanceHistories: Record<string, BalanceHistoryEntry[]>;
  fetchBalanceHistory: (agentId: string) => void;
}

function roleIcon(role: string): string {
  if (role === "facilitator") return "🏛️";
  if (role === "merchant") return "🏪";
  return "🎫";
}

export default function TokenWalletPanel({
  tokenInfo,
  wallets,
  balanceHistories,
  fetchBalanceHistory,
}: TokenWalletPanelProps) {
  // Fetch balance histories for agent wallets on mount
  useEffect(() => {
    for (const w of wallets) {
      if (w.role === "agent") {
        const agentId = w.label.toLowerCase().replace(/ /g, "_");
        fetchBalanceHistory(agentId);
      }
    }
  }, [wallets.length]);

  return (
    <div className="space-y-3 px-3 py-3">
      {/* Token info card */}
      {tokenInfo && (
        <div className="zt-inset px-3 py-2" style={{ background: "rgba(0,0,0,0.3)" }}>
          <div className="font-pixel text-[7px] text-gray-400 mb-1">TOKEN</div>
          <div className="flex items-center gap-2">
            <span className="text-sm">🪙</span>
            <div>
              <div className="font-pixel text-[9px] text-[var(--zt-gold)]">
                {tokenInfo.name} ({tokenInfo.symbol})
              </div>
              <div className="font-pixel text-[7px] text-gray-500 mt-0.5">
                {tokenInfo.standard} &middot; {tokenInfo.decimals} decimals
              </div>
            </div>
          </div>
          <div className="font-mono text-[8px] text-gray-500 mt-1 break-all">
            {tokenInfo.address}
          </div>
        </div>
      )}

      {/* Wallet cards */}
      {wallets.length === 0 ? (
        <div className="text-center py-4">
          <span className="font-pixel text-[8px] text-gray-500 animate-pulse">
            Loading wallets...
          </span>
        </div>
      ) : (
        <div className="space-y-2">
          {wallets.map((wallet) => {
            const agentId = wallet.label.toLowerCase().replace(/ /g, "_");
            const history = balanceHistories[agentId] ?? [];

            return (
              <div
                key={wallet.address}
                className="zt-inset px-3 py-2"
                style={{ background: "rgba(0,0,0,0.2)" }}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">{roleIcon(wallet.role)}</span>
                    <span className="font-pixel text-[8px] text-[var(--zt-tan)]">
                      {wallet.label}
                    </span>
                  </div>
                  <span className="font-pixel text-[9px] text-[var(--zt-gold)]">
                    ${wallet.balance} AUSD
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <a
                      href={wallet.explorer_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-[7px] text-[var(--zt-green-light)] hover:underline"
                    >
                      {shortAddr(wallet.address)}
                    </a>
                    <span className="font-pixel text-[7px] text-gray-500 ml-2">
                      nonce: {wallet.nonce}
                    </span>
                  </div>
                  {wallet.role === "agent" && history.length > 1 && (
                    <BalanceHistorySparkline history={history} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
