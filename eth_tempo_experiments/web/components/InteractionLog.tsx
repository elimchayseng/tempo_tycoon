import { useEffect, useRef, useMemo } from "react";
import type { LogEntry as LogEntryType } from "../lib/types";
import LogEntry from "./LogEntry";

type Props = {
  logs: LogEntryType[];
  onClear: () => void;
};

type ActionGroup = {
  action: string;
  entries: LogEntryType[];
};

/** Labels for known actions */
const ACTION_LABELS: Record<string, string> = {
  setup: "Setup Accounts",
  balance: "Check Balances",
  send: "Send Payment",
  "send-sponsored": "Sponsored Send",
  batch: "Batch Payment",
  history: "Transaction History",
  swap: "DEX Swap",
  schedule: "Scheduled Payment",
};

export default function InteractionLog({ logs, onClear }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Only auto-scroll if user is near the bottom already
    const isNearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (isNearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [logs]);

  // Group logs by action
  const groups = useMemo(() => {
    const result: ActionGroup[] = [];
    let current: ActionGroup | null = null;

    for (const entry of logs) {
      if (!current || current.action !== entry.action) {
        current = { action: entry.action, entries: [] };
        result.push(current);
      }
      current.entries.push(entry);
    }

    return result;
  }, [logs]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 shrink-0">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
          Interaction Log
        </h2>
        <div className="flex items-center gap-3">
          {logs.length > 0 && (
            <span className="text-[11px] text-gray-600">
              {logs.length} entries
            </span>
          )}
          <button
            onClick={onClear}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Log entries */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-2">
            <div className="text-3xl opacity-30">&#9881;</div>
            <p className="text-sm">
              Run an action to see blockchain interactions here.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((group, gi) => (
              <div key={`${group.action}-${gi}`}>
                {/* Action group header */}
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-px bg-gray-800 flex-1" />
                  <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider shrink-0">
                    {ACTION_LABELS[group.action] ?? group.action}
                  </span>
                  <div className="h-px bg-gray-800 flex-1" />
                </div>

                {/* Entries */}
                <div className="space-y-0.5">
                  {group.entries.map((entry) => (
                    <LogEntry key={entry.id} entry={entry} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
