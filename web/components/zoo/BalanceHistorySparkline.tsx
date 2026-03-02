import type { BalanceHistoryEntry } from "../../lib/types";

interface BalanceHistorySparklineProps {
  history: BalanceHistoryEntry[];
  width?: number;
  height?: number;
}

export default function BalanceHistorySparkline({
  history,
  width = 100,
  height = 30,
}: BalanceHistorySparklineProps) {
  if (history.length < 2) {
    return (
      <svg width={width} height={height} className="opacity-40">
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="var(--zt-tan)"
          strokeWidth={1}
          strokeDasharray="4 2"
        />
      </svg>
    );
  }

  const balances = history.map((h) => parseFloat(h.balance) || 0);
  const min = Math.min(...balances);
  const max = Math.max(...balances);
  const range = max - min || 1;
  const padding = 2;

  const points = balances
    .map((val, i) => {
      const x = (i / (balances.length - 1)) * (width - padding * 2) + padding;
      const y = height - padding - ((val - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height}>
      <polyline
        points={points}
        fill="none"
        stroke="var(--zt-gold)"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Dot on last point */}
      {balances.length > 0 && (() => {
        const lastVal = balances[balances.length - 1];
        const lastX = width - padding;
        const lastY = height - padding - ((lastVal - min) / range) * (height - padding * 2);
        return (
          <circle
            cx={lastX}
            cy={lastY}
            r={2}
            fill="var(--zt-gold)"
          />
        );
      })()}
    </svg>
  );
}
