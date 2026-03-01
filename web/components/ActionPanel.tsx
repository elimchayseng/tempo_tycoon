import { useState } from "react";
import type { Account } from "../lib/types";
import { ApiService, formatApiError } from "../services/api";
import { formatBalance, shortAddr, capitalize } from "../utils/formatting";

type Props = {
  accounts: Account[];
  activeAction: string | null;
};

const ACCOUNT_NAMES = ["alice", "bob", "merchant", "sponsor"] as const;

export default function ActionPanel({ accounts, activeAction }: Props) {
  // Form state
  const [sendFrom, setSendFrom] = useState("alice");
  const [sendTo, setSendTo] = useState("bob");
  const [sendAmount, setSendAmount] = useState("5.00");
  const [sendMemo, setSendMemo] = useState("dinner last night");
  const [feeMode, setFeeMode] = useState<"self" | "sponsored">("self");

  // Batch payment state
  const [batchFrom, setBatchFrom] = useState("sponsor");
  const [showBatchForm, setShowBatchForm] = useState(false);

  // Error state
  const [error, setError] = useState<string | null>(null);

  // Helper function to handle API calls with error handling
  const handleApiCall = async (apiCall: () => Promise<void>, errorContext: string) => {
    try {
      setError(null);
      await apiCall();
    } catch (err) {
      const errorMessage = formatApiError(err);
      setError(`${errorContext}: ${errorMessage}`);
      console.error(`[${errorContext}]`, err);
    }
  };

  const isRunning = activeAction !== null;
  const hasAccounts = accounts.length > 0;
  const alphaUsd = "0x20c0000000000000000000000000000000000001";

  return (
    <div className="flex flex-col gap-5 p-4 h-full overflow-y-auto">
      {/* Error Display */}
      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded p-3">
          <p className="text-red-400 text-xs font-medium">Error</p>
          <p className="text-red-300 text-sm mt-1">{error}</p>
          <button
            onClick={() => setError(null)}
            className="text-red-500 hover:text-red-400 text-xs mt-2"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Accounts */}
      <section>
        <h2 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Accounts
        </h2>
        {!hasAccounts ? (
          <p className="text-gray-600 text-xs leading-relaxed">
            No accounts yet.
            <br />
            Click <strong>Setup Accounts</strong> below.
          </p>
        ) : (
          <div className="space-y-1">
            {accounts.map((a) => (
              <div
                key={a.label}
                className="bg-gray-800/40 border border-gray-800 px-3 py-2 rounded"
              >
                <div className="flex justify-between items-baseline">
                  <span className="text-sm font-medium text-gray-200">
                    {a.label}
                  </span>
                  <span className="text-sm font-mono text-emerald-400">
                    {a.balances[alphaUsd]
                      ? formatBalance(a.balances[alphaUsd])
                      : "\u2014"}
                  </span>
                </div>
                <div className="text-[11px] font-mono text-gray-600 mt-0.5">
                  {shortAddr(a.address)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Divider */}
      <div className="h-px bg-gray-800" />

      {/* Actions */}
      <section>
        <h2 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Actions
        </h2>
        <div className="space-y-2">
          <ActionButton
            label="Setup Accounts"
            active={activeAction === "setup"}
            disabled={isRunning}
            variant="primary"
            onClick={() => handleApiCall(ApiService.setup, "Setup Accounts")}
          />
          <ActionButton
            label="Check Balances"
            active={activeAction === "balance"}
            disabled={isRunning || !hasAccounts}
            onClick={() => handleApiCall(ApiService.checkBalances, "Check Balances")}
          />
        </div>
      </section>

      {/* Send Payment form */}
      <section>
        <h2 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Send Payment
        </h2>
        <div className="space-y-2">
          <div className="flex gap-2">
            <SelectField
              label="From"
              value={sendFrom}
              onChange={setSendFrom}
              options={ACCOUNT_NAMES}
            />
            <SelectField
              label="To"
              value={sendTo}
              onChange={setSendTo}
              options={ACCOUNT_NAMES}
            />
          </div>
          <InputField
            label="Amount (USD)"
            value={sendAmount}
            onChange={setSendAmount}
            placeholder="5.00"
          />
          <InputField
            label="Memo"
            value={sendMemo}
            onChange={setSendMemo}
            placeholder="dinner last night"
          />

          {/* Fee mode toggle */}
          <div className="flex gap-1 p-0.5 bg-gray-800/60 rounded text-xs">
            <button
              onClick={() => setFeeMode("self")}
              className={`flex-1 px-2 py-1.5 rounded transition-colors ${
                feeMode === "self"
                  ? "bg-gray-700 text-gray-200"
                  : "text-gray-500 hover:text-gray-400"
              }`}
            >
              Self-pay fee
            </button>
            <button
              onClick={() => setFeeMode("sponsored")}
              className={`flex-1 px-2 py-1.5 rounded transition-colors ${
                feeMode === "sponsored"
                  ? "bg-gray-700 text-gray-200"
                  : "text-gray-500 hover:text-gray-400"
              }`}
            >
              Sponsored
            </button>
          </div>

          <ActionButton
            label={"Send \u2192"}
            active={
              activeAction === "send" ||
              activeAction === "send-sponsored"
            }
            disabled={isRunning || !hasAccounts}
            variant="success"
            onClick={() => {
              const request = { from: sendFrom, to: sendTo, amount: sendAmount, memo: sendMemo };
              if (feeMode === "self") {
                handleApiCall(() => ApiService.send(request), "Send Payment");
              } else {
                handleApiCall(() => ApiService.sendSponsored(request), "Send Sponsored Payment");
              }
            }}
          />
        </div>
      </section>

      {/* Divider */}
      <div className="h-px bg-gray-800" />

      {/* Batch Payment */}
      <section>
        <h2 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Batch Payment
        </h2>
        <div className="space-y-2">
          {!showBatchForm ? (
            <ActionButton
              label="Batch Payroll (3 payments)"
              active={activeAction === "batch"}
              disabled={isRunning || !hasAccounts}
              onClick={() => {
                const batchRequest = {
                  from: "sponsor",
                  payments: [
                    { to: "alice", amount: "10", memo: "PAYROLL-001" },
                    { to: "bob", amount: "15", memo: "PAYROLL-002" },
                    { to: "merchant", amount: "8.50", memo: "PAYROLL-003" }
                  ]
                };
                handleApiCall(() => ApiService.batch(batchRequest), "Batch Payment");
              }}
            />
          ) : (
            // Future: Custom batch form could go here
            <p className="text-xs text-gray-600">Custom batch form placeholder</p>
          )}
        </div>
      </section>

      {/* Divider */}
      <div className="h-px bg-gray-800" />

      {/* More actions */}
      <section>
        <div className="space-y-2">
          <ActionButton
            label="View History"
            active={activeAction === "history"}
            disabled={isRunning || !hasAccounts}
            onClick={() => handleApiCall(() => ApiService.history({ account: "alice" }), "View History")}
          />
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ActionButton({
  label,
  onClick,
  disabled,
  active,
  variant = "default",
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  active?: boolean;
  variant?: "default" | "primary" | "success";
}) {
  const base =
    "w-full px-3 py-2 rounded text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2";
  const variants = {
    default:
      "bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-600",
    primary: "bg-indigo-600 hover:bg-indigo-500",
    success: "bg-emerald-600 hover:bg-emerald-500",
  };

  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`${base} ${variants[variant]}`}
    >
      {active && <Spinner />}
      {label}
    </button>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-3.5 w-3.5 text-current opacity-70"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.963 7.963 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
}) {
  return (
    <label className="flex-1">
      <span className="text-[11px] text-gray-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full mt-0.5 px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-gray-200 focus:border-gray-500 focus:outline-none"
      >
        {options.map((n) => (
          <option key={n} value={n}>
            {capitalize(n)}
          </option>
        ))}
      </select>
    </label>
  );
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label>
      <span className="text-[11px] text-gray-500">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full mt-0.5 px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-gray-200 placeholder:text-gray-600 focus:border-gray-500 focus:outline-none"
      />
    </label>
  );
}
