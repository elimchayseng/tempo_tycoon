import { useEffect, useRef, useState } from "react";
import type { NetworkStats } from "../../lib/types";

interface NetworkAnalyticsPanelProps {
  stats: NetworkStats | null;
}

function latencyColor(ms: number): string {
  if (ms < 300) return "bg-emerald-400";
  if (ms < 800) return "bg-yellow-400";
  return "bg-red-400";
}

function latencyLabel(ms: number): string {
  if (ms < 300) return "Good";
  if (ms < 800) return "Fair";
  return "Slow";
}

export default function NetworkAnalyticsPanel({ stats }: NetworkAnalyticsPanelProps) {
  const prevBlockRef = useRef<number>(0);
  const [blockFlash, setBlockFlash] = useState(false);

  useEffect(() => {
    if (stats && stats.latest_block !== prevBlockRef.current && prevBlockRef.current > 0) {
      setBlockFlash(true);
      const t = setTimeout(() => setBlockFlash(false), 600);
      return () => clearTimeout(t);
    }
    if (stats) prevBlockRef.current = stats.latest_block;
  }, [stats?.latest_block]);

  if (!stats) {
    return (
      <div className="px-3 py-4 text-center">
        <span className="font-pixel text-[8px] text-gray-500 animate-pulse">
          Connecting to network...
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-3 px-3 py-3">
      {/* Chain info */}
      <div className="zt-inset px-3 py-2" style={{ background: "rgba(0,0,0,0.3)" }}>
        <div className="font-pixel text-[7px] text-gray-400 mb-1">CHAIN</div>
        <div className="font-pixel text-[9px] text-[var(--zt-tan)]">
          {stats.chain_name}
        </div>
        <div className="font-pixel text-[7px] text-gray-500 mt-0.5">
          ID: {stats.chain_id}
        </div>
      </div>

      {/* Block height */}
      <div className="flex items-center justify-between">
        <span className="font-pixel text-[7px] text-gray-400">BLOCK</span>
        <span
          className={`font-pixel text-[10px] text-[var(--zt-gold)] transition-all ${
            blockFlash ? "zt-block-flash scale-110" : ""
          }`}
        >
          #{stats.latest_block.toLocaleString()}
        </span>
      </div>

      {/* Gas price */}
      <div className="flex items-center justify-between">
        <span className="font-pixel text-[7px] text-gray-400">GAS PRICE</span>
        <span className="font-pixel text-[9px] text-[var(--zt-tan)]">
          {stats.gas_price_gwei} Gwei
        </span>
      </div>

      {/* RPC Latency */}
      <div className="flex items-center justify-between">
        <span className="font-pixel text-[7px] text-gray-400">RPC LATENCY</span>
        <div className="flex items-center gap-1.5">
          <span className={`inline-block w-2 h-2 ${latencyColor(stats.rpc_latency_ms)}`} />
          <span className="font-pixel text-[9px] text-[var(--zt-tan)]">
            {stats.rpc_latency_ms}ms
          </span>
          <span className="font-pixel text-[7px] text-gray-500">
            {latencyLabel(stats.rpc_latency_ms)}
          </span>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-dashed border-[var(--zt-green-mid)]" />

      {/* Zoo TX stats */}
      <div className="flex items-center justify-between">
        <span className="font-pixel text-[7px] text-gray-400">ZOO TX COUNT</span>
        <span className="font-pixel text-[10px] text-[var(--zt-gold)]">
          {stats.zoo_tx_count}
        </span>
      </div>

      <div className="flex items-center justify-between">
        <span className="font-pixel text-[7px] text-gray-400">THROUGHPUT</span>
        <span className="font-pixel text-[9px] text-[var(--zt-tan)]">
          {stats.zoo_tx_throughput_per_min} tx/min
        </span>
      </div>
    </div>
  );
}
