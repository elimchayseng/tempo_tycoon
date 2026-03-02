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
      return <span className="text-[var(--zt-text-mid)]">&#9675;</span>;
    case "checking":
      return <span className="text-[var(--zt-brown-light)] animate-spin inline-block">&#9881;</span>;
    case "pass":
      return <span className="text-[var(--zt-green-mid)]">&#10003;</span>;
    case "fail":
      return <span className="text-red-600">&#10007;</span>;
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
      <div className="w-full max-w-md zt-bevel overflow-hidden">
        {/* Title bar */}
        <div className="zt-titlebar">
          🔧 ZOO SETUP
        </div>

        {/* Parchment body */}
        <div className="zt-parchment px-5 py-4">
          <ul className="space-y-3 mb-5">
            {checks.map((check) => (
              <li key={check.id} className="flex items-start gap-3">
                <span className="w-5 text-center mt-0.5 shrink-0 text-sm">
                  <StatusIcon status={check.status} />
                </span>
                <div className="min-w-0">
                  <span className="font-pixel text-[8px] text-[var(--zt-text-dark)]">
                    {check.label}
                  </span>
                  {check.detail && (
                    <p className="text-[10px] text-[var(--zt-text-mid)] mt-0.5 font-mono">
                      {check.detail}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {error && (
            <p className="font-pixel text-[7px] text-red-600 mb-4">{error}</p>
          )}

          <div className="flex gap-2">
            {allPassed && phase === "ready" && (
              <button onClick={onOpenGates} className="zt-btn-brown flex-1">
                Open Gates
              </button>
            )}
            {hasFailed && (
              <button onClick={onRetry} className="zt-btn flex-1">
                Retry
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
