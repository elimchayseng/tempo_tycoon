import { useState } from "react";
import type { LogEntry as LogEntryType } from "../lib/types";
import AnnotationBox from "./AnnotationBox";

type Props = {
  entry: LogEntryType;
};

const TYPE_STYLES: Record<string, string> = {
  info: "text-gray-300",
  rpc_call: "text-blue-400",
  rpc_result: "text-cyan-400",
  tx_built: "text-yellow-400",
  tx_submitted: "text-orange-400",
  tx_confirmed: "text-emerald-400",
  error: "text-red-400",
  annotation: "text-indigo-300",
};

const TYPE_ICONS: Record<string, string> = {
  info: "\u2192",
  rpc_call: "\u250C",
  rpc_result: "\u2514",
  tx_built: "\u250C",
  tx_submitted: "\u251C",
  tx_confirmed: "\u2714",
  error: "\u2718",
  annotation: "\uD83D\uDCA1",
};

/** Render a value with special formatting for addresses and hashes */
function renderValue(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return JSON.stringify(value, null, 2);
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

/** Check if the data payload is worth showing expanded */
function hasInterestingData(data: Record<string, unknown>): boolean {
  const keys = Object.keys(data);
  return keys.length > 0;
}

export default function LogEntry({ entry }: Props) {
  const indent = entry.indent ?? 0;
  const style = TYPE_STYLES[entry.type] || "text-gray-300";
  const icon = TYPE_ICONS[entry.type] || "\u2192";
  const dataEntries = Object.entries(entry.data);
  const showData = hasInterestingData(entry.data) && entry.type !== "annotation";

  const [expanded, setExpanded] = useState(false);
  const isExpandable = showData && dataEntries.length > 2;
  // Show first 2 fields inline, rest on expand
  const visibleData = isExpandable && !expanded ? dataEntries.slice(0, 2) : dataEntries;

  return (
    <div className="group" style={{ marginLeft: indent * 20 }}>
      {/* Main label row */}
      <div
        className={`font-mono text-sm ${style} leading-relaxed flex items-start gap-1`}
      >
        <span className="opacity-40 select-none shrink-0 w-4 text-center">
          {icon}
        </span>
        <span className="break-all">{entry.label}</span>
      </div>

      {/* Data fields */}
      {showData && (
        <div className="ml-5 mt-0.5 font-mono text-xs space-y-px">
          {visibleData.map(([key, value]) => {
            const rendered = renderValue(value);
            const isMultiline = rendered.includes("\n");
            return (
              <div key={key} className="flex gap-1.5">
                <span className="text-gray-600 shrink-0">{key}:</span>
                {isMultiline ? (
                  <pre className="text-gray-400 whitespace-pre-wrap break-all">
                    {rendered}
                  </pre>
                ) : (
                  <span className="text-gray-400 break-all">{rendered}</span>
                )}
              </div>
            );
          })}
          {isExpandable && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-gray-600 hover:text-gray-400 transition-colors text-[11px] mt-0.5"
            >
              {expanded
                ? "\u25B4 collapse"
                : `\u25BE ${dataEntries.length - 2} more fields...`}
            </button>
          )}
        </div>
      )}

      {/* Annotations */}
      {entry.annotations && entry.annotations.length > 0 && (
        <div className="ml-5 mt-1">
          <AnnotationBox annotations={entry.annotations as string[]} />
        </div>
      )}
    </div>
  );
}
