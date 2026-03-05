import { useState, useEffect, useRef, useCallback } from "react";
import type {
  LogEntry,
  AccountsState,
  WsMessage,
  ZooAgentState,
  ZooPurchaseReceipt,
  NetworkStats,
  TransactionFlowEvent,
  BalanceUpdate,
  ZooMerchantState,
  ZooRestockEvent,
  ZooLLMDecision,
  ZooPriceAdjustment,
} from "../lib/types";

const RECONNECT_DELAYS = [500, 1000, 2000, 4000];

export function useWebSocket() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [accounts, setAccounts] = useState<AccountsState>([]);
  const [connected, setConnected] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [zooAgents, setZooAgents] = useState<ZooAgentState[]>([]);
  const [receipts, setReceipts] = useState<ZooPurchaseReceipt[]>([]);
  const [networkStats, setNetworkStats] = useState<NetworkStats | null>(null);
  const [txFlowEvents, setTxFlowEvents] = useState<TransactionFlowEvent[]>([]);
  const [balanceUpdates, setBalanceUpdates] = useState<BalanceUpdate[]>([]);
  const [merchantState, setMerchantState] = useState<ZooMerchantState | null>(null);
  const [restockEvents, setRestockEvents] = useState<ZooRestockEvent[]>([]);
  const [llmDecisions, setLlmDecisions] = useState<Record<string, ZooLLMDecision>>({});
  const [priceAdjustments, setPriceAdjustments] = useState<ZooPriceAdjustment[]>([]);
  const [simulationComplete, setSimulationComplete] = useState(false);
  const [fundingProgress, setFundingProgress] = useState<{ step: string; detail?: string } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);

  // Fetch initial accounts on mount (in case server already has state)
  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((data) => {
        if (data.accounts?.length > 0) setAccounts(data.accounts);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    // Closure-scoped flag — immune to StrictMode re-mount race conditions
    let active = true;

    function connect() {
      if (!active) return;

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!active) { ws.close(); return; }
        setConnected(true);
        retryRef.current = 0;
      };

      ws.onclose = () => {
        setConnected(false);
        if (active) {
          const delay =
            RECONNECT_DELAYS[
              Math.min(retryRef.current, RECONNECT_DELAYS.length - 1)
            ];
          retryRef.current++;
          setTimeout(connect, delay);
        }
      };

      ws.onerror = () => {
        ws.close();
      };

      ws.onmessage = (event) => {
        if (!active) return;

        let msg: WsMessage;
        try {
          msg = JSON.parse(event.data);
        } catch {
          console.warn('WebSocket: malformed JSON received, ignoring');
          return;
        }

        switch (msg.type) {
          case "log":
            setLogs((prev) => [...prev, msg.entry]);
            break;
          case "accounts":
            setAccounts(msg.accounts);
            break;
          case "action_start":
            setActiveAction(msg.action);
            break;
          case "action_complete":
            setActiveAction(null);
            break;
          case "action_error":
            setActiveAction(null);
            break;
          case "zoo_agents":
            setZooAgents(msg.agents);
            break;
          case "zoo_purchase":
            setReceipts((prev) => [msg.receipt, ...prev].slice(0, 200));
            break;
          case "zoo_network_stats":
            setNetworkStats(msg.stats);
            break;
          case "zoo_tx_flow":
            setTxFlowEvents((prev) => [msg.event, ...prev].slice(0, 50));
            break;
          case "zoo_balance_update":
            setBalanceUpdates((prev) => [msg.update, ...prev].slice(0, 100));
            break;
          case "zoo_merchant_state":
            setMerchantState(msg.merchant);
            break;
          case "zoo_restock_event":
            setRestockEvents((prev) => [msg.event, ...prev].slice(0, 50));
            break;
          case "zoo_llm_decision":
            setLlmDecisions((prev) => ({ ...prev, [msg.decision.agent_id]: msg.decision }));
            break;
          case "zoo_price_adjustment":
            setPriceAdjustments((prev) => [msg.event, ...prev].slice(0, 50));
            break;
          case "zoo_simulation_complete":
            setSimulationComplete(true);
            break;
          case "zoo_funding_progress":
            setFundingProgress({ step: msg.step, detail: msg.detail });
            break;
        }
      };
    }

    connect();

    return () => {
      active = false;
      wsRef.current?.close();
    };
  }, []);

  const clearLogs = useCallback(() => setLogs([]), []);
  const clearReceipts = useCallback(() => setReceipts([]), []);
  const resetSimulationData = useCallback(() => {
    setZooAgents([]);
    setReceipts([]);
    setNetworkStats(null);
    setTxFlowEvents([]);
    setBalanceUpdates([]);
    setMerchantState(null);
    setRestockEvents([]);
    setLogs([]);
    setAccounts([]);
    setLlmDecisions({});
    setPriceAdjustments([]);
    setSimulationComplete(false);
    setFundingProgress(null);
  }, []);

  return {
    logs,
    accounts,
    connected,
    activeAction,
    clearLogs,
    zooAgents,
    receipts,
    clearReceipts,
    networkStats,
    txFlowEvents,
    balanceUpdates,
    merchantState,
    restockEvents,
    llmDecisions,
    priceAdjustments,
    simulationComplete,
    fundingProgress,
    resetSimulationData,
  };
}
