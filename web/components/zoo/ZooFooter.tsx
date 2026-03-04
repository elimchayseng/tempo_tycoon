import type { Account } from "../../lib/types";
import { shortAddr, formatAlphaUsdBalance } from "../../utils/formatting";

const EXPLORER_URL = "https://explore.moderato.tempo.xyz";

interface ZooFooterProps {
  zooMaster: Account | undefined;
}

export default function ZooFooter({ zooMaster }: ZooFooterProps) {
  if (!zooMaster) return null;

  const alphaUsdAddress = "0x20c0000000000000000000000000000000000001";
  const rawBalance = zooMaster.balances[alphaUsdAddress] ?? "0";
  const balance = formatAlphaUsdBalance(rawBalance);

  return (
    <footer className="zt-statusbar shrink-0 px-4 py-2 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="font-pixel text-[7px] text-[var(--zt-tan)]">Zoo Master</span>
        <a
          href={`${EXPLORER_URL}/address/${zooMaster.address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-pixel text-[7px] text-gray-400 hover:text-[var(--zt-gold)] transition-colors"
        >
          {shortAddr(zooMaster.address)}
        </a>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-pixel text-[9px] text-[var(--zt-gold)]">
          💰 {balance}
        </span>
        <span className="font-pixel text-[7px] text-gray-500">
          Tempo Moderato
        </span>
      </div>
    </footer>
  );
}
