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
    <div className="shrink-0 border-t border-gray-800/60 bg-gray-950 px-4 py-2 flex items-center justify-between text-xs text-gray-500">
      <div className="flex items-center gap-2">
        <span className="text-gray-400 font-medium">Zoo Master Fund</span>
        <span className="font-mono">{shortAddr(zooMaster.address)}</span>
      </div>
      <span className="font-mono text-[var(--zoo-tan)]">{balance}</span>
    </div>
  );
}
