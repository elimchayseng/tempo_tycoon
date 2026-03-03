import { useState, useCallback } from "react";
import type { PreflightCheck } from "../lib/types";
import { ApiService, formatApiError } from "../services/api";

export type ZooPhase = "idle" | "preflight" | "ready" | "starting" | "running" | "stopping" | "complete";

export function useZoo() {
  const [phase, setPhase] = useState<ZooPhase>("idle");
  const [preflightChecks, setPreflightChecks] = useState<PreflightCheck[]>([]);
  const [error, setError] = useState<string | null>(null);

  const startPreflight = useCallback(async () => {
    setError(null);
    setPhase("preflight");

    // Initialize checks as pending
    const initialChecks: PreflightCheck[] = [
      { id: "blockchain", label: "Blockchain connectivity", status: "checking" },
      { id: "wallets", label: "Wallet initialization", status: "pending" },
      { id: "accounts", label: "Zoo accounts initialized", status: "pending" },
      { id: "balances", label: "Wallet balances", status: "pending" },
      { id: "merchants", label: "Merchant registry", status: "pending" },
      { id: "runner", label: "Agent runner", status: "pending" },
    ];
    setPreflightChecks(initialChecks);

    try {
      const result = await ApiService.zooPreflight();
      setPreflightChecks(result.checks);
      if (result.success) {
        setPhase("ready");
      } else {
        setError("Some preflight checks failed");
      }
    } catch (e) {
      setError(formatApiError(e));
      // Mark all still-pending checks as failed
      setPreflightChecks((prev) =>
        prev.map((ch) =>
          ch.status === "pending" || ch.status === "checking"
            ? { ...ch, status: "fail" as const, detail: "Request failed" }
            : ch
        )
      );
    }
  }, []);

  const openGates = useCallback(async () => {
    setError(null);
    setPhase("starting");
    try {
      await ApiService.zooStartAgents();
      setPhase("running");
    } catch (e) {
      setError(formatApiError(e));
      setPhase("ready");
    }
  }, []);

  const stopZoo = useCallback(async () => {
    setError(null);
    setPhase("stopping");
    try {
      await ApiService.zooStopAgents();
      setPreflightChecks([]);
      setPhase("idle");
    } catch (e) {
      setError(formatApiError(e));
      setPhase("running");
    }
  }, []);

  const restart = useCallback(async () => {
    setPhase("idle");
    setPreflightChecks([]);
    setError(null);
  }, []);

  const markComplete = useCallback(() => {
    setPhase("complete");
  }, []);

  return {
    phase,
    preflightChecks,
    error,
    startPreflight,
    openGates,
    stopZoo,
    restart,
    markComplete,
  };
}
