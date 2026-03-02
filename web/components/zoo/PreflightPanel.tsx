import type { PreflightCheck } from "../../lib/types";
import type { ZooPhase } from "../../hooks/useZoo";

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
      return <span className="text-gray-500">&#9675;</span>;
    case "checking":
      return <span className="text-yellow-400 animate-spin inline-block">&#9881;</span>;
    case "pass":
      return <span className="text-emerald-400">&#10003;</span>;
    case "fail":
      return <span className="text-red-400">&#10007;</span>;
  }
}

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
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-full max-w-md bg-gray-900/80 border border-gray-800 rounded-lg p-6">
        <h2 className="text-sm font-semibold text-gray-300 mb-4 tracking-wide uppercase">
          Pre-Flight Checks
        </h2>

        <ul className="space-y-3 mb-6">
          {checks.map((check) => (
            <li key={check.id} className="flex items-start gap-3">
              <span className="w-5 text-center mt-0.5 shrink-0">
                <StatusIcon status={check.status} />
              </span>
              <div className="min-w-0">
                <span className="text-sm text-gray-200">{check.label}</span>
                {check.detail && (
                  <p className="text-xs text-gray-500 mt-0.5">{check.detail}</p>
                )}
              </div>
            </li>
          ))}
        </ul>

        {error && (
          <p className="text-xs text-red-400 mb-4">{error}</p>
        )}

        <div className="flex gap-2">
          {allPassed && phase === "ready" && (
            <button
              onClick={onOpenGates}
              className="flex-1 px-4 py-2 text-sm font-medium rounded bg-[var(--zoo-brown)] hover:brightness-110 text-white transition-colors"
            >
              Open Gates
            </button>
          )}
          {hasFailed && (
            <button
              onClick={onRetry}
              className="flex-1 px-4 py-2 text-sm font-medium rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
