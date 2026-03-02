import type { Account } from "../../lib/types";
import { shortAddr, formatBalance } from "../../utils/formatting";

interface ZooFooterProps {
  zooMaster: Account | undefined;
}

export default function ZooFooter({ zooMaster }: ZooFooterProps) {
  if (!zooMaster) return null;

  const alphaUsdAddress = "0x20c0000000000000000000000000000000000001";
  const rawBalance = zooMaster.balances[alphaUsdAddress] ?? "0";
  const balance = formatBalance(rawBalance);

  return (
    <footer className="zt-statusbar shrink-0 px-4 py-2 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="font-pixel text-[7px] text-[var(--zt-tan)]">Zoo Master</span>
        <span className="font-pixel text-[7px] text-gray-400">{shortAddr(zooMaster.address)}</span>
      </div>
      <span className="font-pixel text-[9px] text-[var(--zt-gold)]">
        💰 {balance}
      </span>
    </footer>
  );
}
