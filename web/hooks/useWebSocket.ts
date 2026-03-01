import { useState, useEffect, useRef, useCallback } from "react";
import type { LogEntry, AccountsState, WsMessage } from "../lib/types";

const RECONNECT_DELAYS = [500, 1000, 2000, 4000];

export function useWebSocket() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [accounts, setAccounts] = useState<AccountsState>([]);
  const [connected, setConnected] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
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
        const msg: WsMessage = JSON.parse(event.data);

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

  return { logs, accounts, connected, activeAction, clearLogs };
}
