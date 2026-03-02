import type { PreflightCheck } from "../../lib/types";
import type { ZooPhase } from "../../hooks/useZoo";
import { shortAddr, formatAlphaUsdBalance, ANIMAL_EMOJI, productEmoji } from "../../utils/formatting";

interface PreflightPanelProps {
  checks: PreflightCheck[];
  phase: ZooPhase;
  error: string | null;
  onOpenGates: () => void;
  onRetry: () => void;
}

function StatusIcon({ status }: { status: PreflightCheck["status"] }) {
  switch (status) {
    case "pending":
      return <span className="text-[var(--zt-text-mid)]">&#9675;</span>;
    case "checking":
      return <span className="text-[var(--zt-brown-light)] animate-spin inline-block">&#9881;</span>;
    case "pass":
      return <span className="text-[var(--zt-green-mid)]">&#10003;</span>;
    case "fail":
      return <span className="text-red-600">&#10007;</span>;
  }
}

function MetadataDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="font-pixel text-[7px] text-gray-400 shrink-0">{label}:</span>
      <span className="font-pixel text-[7px] text-[var(--zt-tan)] break-all">{value}</span>
    </div>
  );
}

function BlockchainMetadata({ metadata }: { metadata: Record<string, unknown> }) {
  return (
    <div className="space-y-0.5">
      <MetadataDetail label="Network" value={metadata.chainName as string} />
      <MetadataDetail label="Chain ID" value={String(metadata.chainId)} />
      <MetadataDetail label="RPC" value={metadata.rpcUrl as string} />
      <MetadataDetail label="Explorer" value={metadata.explorerUrl as string} />
      <MetadataDetail label="Token" value={`AlphaUSD (${metadata.tokenStandard}, ${metadata.tokenDecimals} decimals)`} />
      <MetadataDetail label="Contract" value={metadata.tokenContract as string} />
    </div>
  );
}

function AccountsMetadata({ metadata }: { metadata: Record<string, unknown> }) {
  const accounts = (metadata.accounts ?? []) as { label: string; address: string }[];
  return (
    <div className="space-y-0.5">
      {accounts.map((acc) => (
        <div key={acc.address} className="flex gap-2">
          <span className="font-pixel text-[7px] text-gray-400 shrink-0">{acc.label}:</span>
          <span className="font-pixel text-[7px] text-[var(--zt-tan)] font-mono">{shortAddr(acc.address)}</span>
        </div>
      ))}
    </div>
  );
}

function BalancesMetadata({ metadata }: { metadata: Record<string, unknown> }) {
  const wallets = (metadata.wallets ?? []) as { label: string; address: string; balance: string }[];
  const attendeeEmojis: Record<string, string> = {
    "Attendee 1": ANIMAL_EMOJI.attendee_1 ?? "",
    "Attendee 2": ANIMAL_EMOJI.attendee_2 ?? "",
    "Attendee 3": ANIMAL_EMOJI.attendee_3 ?? "",
  };
  return (
    <div className="space-y-0.5">
      {wallets.map((w) => {
        const emoji = attendeeEmojis[w.label] ?? "";
        const balDisplay = formatAlphaUsdBalance(w.balance);
        return (
          <div key={w.address} className="flex gap-2 items-center">
            <span className="font-pixel text-[7px] text-gray-400 shrink-0">
              {w.label}{emoji ? ` ${emoji}` : ""}:
            </span>
            <span className="font-pixel text-[7px] text-[var(--zt-tan)] font-mono">
              {shortAddr(w.address)}
            </span>
            <span className="font-pixel text-[7px] text-[var(--zt-gold)] ml-auto">
              {balDisplay}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function MerchantMetadata({ metadata }: { metadata: Record<string, unknown> }) {
  const merchants = (metadata.merchants ?? []) as {
    name: string;
    category: string;
    itemCount: number;
    menu?: { name: string; price: string; category: string }[];
  }[];
  return (
    <div className="space-y-2">
      {merchants.map((m) => (
        <div key={m.name}>
          <div className="flex gap-2 items-center mb-1">
            <span className="font-pixel text-[8px] text-[var(--zt-tan)]">🏪 {m.name}</span>
            <span className="font-pixel text-[7px] text-gray-400">{m.category}</span>
          </div>
          {m.menu && m.menu.length > 0 && (
            <div className="space-y-0.5 pl-2 border-l border-[var(--zt-green-mid)]">
              {m.menu.map((item) => (
                <div key={item.name} className="flex gap-2 items-center">
                  <span className="text-xs shrink-0">{productEmoji(item.name)}</span>
                  <span className="font-pixel text-[7px] text-gray-300">{item.name}</span>
                  <span className="font-pixel text-[7px] text-gray-400">{item.category}</span>
                  <span className="font-pixel text-[7px] text-[var(--zt-gold)] ml-auto">${item.price}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function RunnerMetadata({ metadata }: { metadata: Record<string, unknown> }) {
  return (
    <div className="space-y-0.5">
      <MetadataDetail label="Polling" value={`${metadata.pollingInterval}ms`} />
      <MetadataDetail label="Decay rate" value={String(metadata.needDecayRate)} />
      <MetadataDetail label="Purchase threshold" value={String(metadata.purchaseThreshold)} />
    </div>
  );
}

const METADATA_RENDERERS: Record<string, React.FC<{ metadata: Record<string, unknown> }>> = {
  blockchain: BlockchainMetadata,
  accounts: AccountsMetadata,
  balances: BalancesMetadata,
  merchants: MerchantMetadata,
  runner: RunnerMetadata,
};

export default function PreflightPanel({
  checks,
  phase,
  error,
  onOpenGates,
  onRetry,
}: PreflightPanelProps) {
  const hasFailed = checks.some((ch) => ch.status === "fail");
  const allPassed = checks.length > 0 && checks.every((ch) => ch.status === "pass");

  return (
    <div className="flex-1 overflow-y-auto px-5 py-5">
      {/* Section title */}
      <div className="font-pixel text-[10px] text-[var(--zt-tan)] mb-4">
        🔧 ZOO SETUP
      </div>

      {/* Check cards */}
      <div className="space-y-3 mb-5">
        {checks.map((check) => {
          const Renderer = METADATA_RENDERERS[check.id];
          return (
            <div key={check.id} className="zt-bevel overflow-hidden">
              <div className="zt-titlebar flex items-center gap-3">
                <span className="w-5 text-center shrink-0 text-sm">
                  <StatusIcon status={check.status} />
                </span>
                <span className="font-pixel text-[8px]">{check.label}</span>
                {check.detail && (
                  <span className="text-[10px] opacity-70 ml-auto font-mono">
                    {check.detail}
                  </span>
                )}
              </div>
              {check.status === "pass" && check.metadata && Renderer && (
                <div className="bg-[var(--zt-green-dark)] px-3 py-2">
                  <Renderer metadata={check.metadata} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <p className="font-pixel text-[7px] text-red-600 mb-4">{error}</p>
      )}

      <div className="flex gap-2">
        {allPassed && phase === "ready" && (
          <button onClick={onOpenGates} className="zt-btn-brown">
            Open Gates
          </button>
        )}
        {hasFailed && (
          <button onClick={onRetry} className="zt-btn">
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
