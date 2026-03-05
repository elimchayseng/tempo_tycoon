import type { TokenInfo, WalletInfo } from "../../lib/types";
import { shortAddr, ANIMAL_EMOJI } from "../../utils/formatting";

interface TokenWalletPanelProps {
  tokenInfo: TokenInfo | null;
  wallets: WalletInfo[];
}

function roleIcon(role: string): string {
  if (role === "facilitator") return "🏛️";
  if (role === "merchant") return "🏪";
  return "🎫";
}

export default function TokenWalletPanel({
  tokenInfo,
  wallets,
}: TokenWalletPanelProps) {

  return (
    <div className="space-y-4 px-4 py-4">
      {/* Token info card */}
      {tokenInfo && (
        <div className="zt-inset px-4 py-3" style={{ background: "rgba(0,0,0,0.3)" }}>
          <div className="font-pixel text-[10px] text-gray-400 mb-1">TOKEN</div>
          <div className="flex items-center gap-2.5">
            <span className="text-base">🪙</span>
            <div>
              <div className="font-pixel text-[13px] text-[var(--zt-gold)]">
                {tokenInfo.name} ({tokenInfo.symbol})
              </div>
              <div className="font-pixel text-[10px] text-gray-500 mt-0.5">
                {tokenInfo.standard} &middot; {tokenInfo.decimals} decimals
              </div>
            </div>
          </div>
          <div className="font-mono text-[9px] text-gray-500 mt-1.5 break-all">
            {tokenInfo.address}
          </div>
        </div>
      )}

      {/* Wallet cards */}
      {wallets.length === 0 ? (
        <div className="text-center py-4">
          <span className="font-pixel text-[11px] text-gray-500 animate-pulse">
            Loading wallets...
          </span>
        </div>
      ) : (
        <div className="space-y-3">
          {wallets.map((wallet) => {
            const agentId = wallet.label.toLowerCase().replace(/ /g, "_");

            return (
              <div
                key={wallet.address}
                className="zt-inset px-4 py-3"
                style={{ background: "rgba(0,0,0,0.2)" }}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    {wallet.role === "agent" ? (
                      <>
                        <span className="text-lg">{ANIMAL_EMOJI[agentId] ?? "🧑"}</span>
                        <span className="font-pixel text-[11px] text-[var(--zt-tan)]">
                          {agentId}: {shortAddr(wallet.address)}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-base">{roleIcon(wallet.role)}</span>
                        <span className="font-pixel text-[11px] text-[var(--zt-tan)]">
                          {wallet.role === "merchant" ? "Zoo Gift Shop" : wallet.label}
                        </span>
                      </>
                    )}
                  </div>
                  <span className="font-pixel text-[13px] text-[var(--zt-gold)]">
                    ${wallet.balance} AUSD
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <a
                      href={wallet.explorer_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-[10px] text-[var(--zt-green-light)] hover:underline"
                    >
                      {shortAddr(wallet.address)}
                    </a>
                    <span className="font-pixel text-[10px] text-gray-500 ml-2">
                      nonce: {wallet.nonce}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
