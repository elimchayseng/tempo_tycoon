import type { WSContext } from "hono/ws";
import {
  type Abi,
  type Address,
  getAbiItem,
  decodeEventLog,
  type Log,
} from "viem";
import {
  publicClient,
  createTempoWalletClient,
  tip20Abi,
  CHAIN_CONFIG,
  shortAddress,
} from "./tempo-client.js";
import { accountStore } from "./accounts.js";
import { config } from "./config.js";
import type { LogEntry } from "../shared/types.js";

// Re-export LogEntry from shared types
export type { LogEntry } from "../shared/types.js";

// ---------------------------------------------------------------------------
// WebSocket client management
// ---------------------------------------------------------------------------

let entryCounter = 0;

function makeId(): string {
  return `log_${Date.now()}_${++entryCounter}`;
}

// Improved WebSocket connection management
const clients = new Set<WSContext>();
const clientMetadata = new WeakMap<WSContext, { connectedAt: number }>();

export function addClient(ws: WSContext): boolean {
  if (clients.size >= config.limits.maxWebSocketConnections) {
    console.warn(`WebSocket connection limit reached (${config.limits.maxWebSocketConnections})`);
    return false;
  }

  clients.add(ws);
  clientMetadata.set(ws, { connectedAt: Date.now() });
  console.log(`[ws] Client connected. Total: ${clients.size}/${config.limits.maxWebSocketConnections}`);
  return true;
}

export function removeClient(ws: WSContext): void {
  const removed = clients.delete(ws);
  clientMetadata.delete(ws);
  if (removed) {
    console.log(`[ws] Client disconnected. Total: ${clients.size}/${config.limits.maxWebSocketConnections}`);
  }
}

export function getClientCount(): number {
  return clients.size;
}

export function getClientLimit(): number {
  return config.limits.maxWebSocketConnections;
}

/** BigInt-safe JSON serializer */
function safeStringify(obj: unknown): string {
  return JSON.stringify(obj, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value
  );
}

function broadcast(message: Record<string, unknown>): void {
  if (clients.size === 0) return;

  const json = safeStringify(message);
  const deadConnections: WSContext[] = [];

  for (const ws of clients) {
    try {
      ws.send(json);
    } catch (error) {
      console.warn('[ws] Failed to send message to client:', error instanceof Error ? error.message : error);
      deadConnections.push(ws);
    }
  }

  // Clean up dead connections
  for (const ws of deadConnections) {
    removeClient(ws);
  }

  if (deadConnections.length > 0) {
    console.log(`[ws] Cleaned up ${deadConnections.length} dead connections`);
  }
}

// ---------------------------------------------------------------------------
// Low-level emitters
// ---------------------------------------------------------------------------

export function emitLog(entry: Omit<LogEntry, "id" | "timestamp">): LogEntry {
  const full: LogEntry = {
    ...entry,
    id: makeId(),
    timestamp: Date.now(),
  };
  broadcast({ type: "log", entry: full });
  return full;
}

export function emitActionStart(action: string) {
  broadcast({ type: "action_start", action });
}

export function emitActionComplete(action: string) {
  broadcast({ type: "action_complete", action });
}

export function emitActionError(action: string, error: string) {
  broadcast({ type: "action_error", action, error });
}

export function emitAccounts(accounts: unknown[]) {
  broadcast({ type: "accounts", accounts });
}

// ---------------------------------------------------------------------------
// Instrumented call — generic wrapper
// ---------------------------------------------------------------------------

/**
 * Execute an async function while streaming log entries over WebSocket.
 * Emits an "info" log before execution and an "error" log on failure.
 */
export async function instrumentedCall<T>(
  action: string,
  label: string,
  fn: () => Promise<T>,
  opts?: {
    type?: LogEntry["type"];
    annotations?: string[];
    indent?: number;
    data?: Record<string, unknown>;
  }
): Promise<T> {
  emitLog({
    action,
    type: opts?.type ?? "info",
    label,
    data: opts?.data ?? {},
    annotations: opts?.annotations,
    indent: opts?.indent,
  });

  try {
    const result = await fn();
    return result;
  } catch (err) {
    emitLog({
      action,
      type: "error",
      label: `${label} — failed`,
      data: { error: err instanceof Error ? err.message : String(err) },
      indent: opts?.indent,
    });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Instrumented readContract
// ---------------------------------------------------------------------------

export async function instrumentedReadContract<T = unknown>(
  action: string,
  opts: {
    address: Address;
    abi: Abi;
    functionName: string;
    args?: unknown[];
    label?: string;
    indent?: number;
  }
): Promise<T> {
  const { address, abi, functionName, args, indent } = opts;
  const label = opts.label ?? `Read ${functionName}`;

  // Log the RPC call
  emitLog({
    action,
    type: "rpc_call",
    label: `RPC: eth_call`,
    data: {
      to: address,
      function: `${functionName}(${(args ?? []).map((a) => shortDisplay(a)).join(", ")})`,
    },
    indent,
  });

  const result = await publicClient.readContract({
    address,
    abi: abi as any,
    functionName,
    args: args as any,
  });

  // Log the result
  emitLog({
    action,
    type: "rpc_result",
    label: `Result: ${shortDisplay(result)}`,
    data: { raw: result },
    indent,
  });

  return result as T;
}

// ---------------------------------------------------------------------------
// Instrumented writeContract (sign + submit + confirm)
// ---------------------------------------------------------------------------

export async function instrumentedWriteContract(
  action: string,
  opts: {
    accountLabel: string;
    address: Address;
    abi: Abi;
    functionName: string;
    args?: unknown[];
    label?: string;
    indent?: number;
    annotations?: string[];
  }
) {
  const { accountLabel, address, abi, functionName, args, indent, annotations } = opts;
  const label = opts.label ?? `Write ${functionName}`;
  const account = accountStore.getAccount(accountLabel);
  const walletClient = createTempoWalletClient(account);

  // Log the transaction being built
  emitLog({
    action,
    type: "tx_built",
    label: `Building ${functionName} transaction...`,
    data: {
      contract: address,
      function: functionName,
      args: (args ?? []).map((a) => shortDisplay(a)),
      signer: `${shortAddress(account.address)} (${accountLabel})`,
    },
    indent,
  });

  // Sign and submit
  emitLog({
    action,
    type: "info",
    label: "Signing transaction...",
    data: {
      signer: `${shortAddress(account.address)} (${accountLabel})`,
      tx_type: "Tempo Transaction (EIP-2718 type 0x42)",
      chain_id: CHAIN_CONFIG.chainId,
    },
    indent: (indent ?? 0) + 1,
  });

  // NOTE: Using any cast here for viem typing compatibility
  // Runtime behavior is correct as verified in testing
  const hash = await walletClient.writeContract({
    address,
    abi: abi as any,
    functionName,
    args: args as any,
    chain: null, // Let viem infer the chain from the client
  } as any);

  emitLog({
    action,
    type: "tx_submitted",
    label: `Submitted to Tempo testnet`,
    data: {
      rpc: "eth_sendRawTransaction",
      endpoint: CHAIN_CONFIG.rpcUrl,
      tx_hash: hash,
    },
    indent,
  });

  // Wait for confirmation
  emitLog({
    action,
    type: "info",
    label: "Waiting for confirmation...",
    data: {},
    indent,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  // Decode events from the receipt
  const decodedEvents = decodeReceiptEvents(receipt.logs, abi);

  emitLog({
    action,
    type: "tx_confirmed",
    label: `Confirmed in block #${receipt.blockNumber} ${receipt.status === "success" ? "✓" : "✗"}`,
    data: {
      status: receipt.status,
      gas_used: receipt.gasUsed.toString(),
      block_number: receipt.blockNumber.toString(),
      events: decodedEvents,
      explorer: `${CHAIN_CONFIG.explorerUrl}/tx/${hash}`,
    },
    annotations,
    indent,
  });

  return { hash, receipt, decodedEvents };
}

// ---------------------------------------------------------------------------
// Instrumented sendTransaction (raw tx, for batched/sponsored flows)
// ---------------------------------------------------------------------------

export async function instrumentedSendTransaction(
  action: string,
  opts: {
    walletClient: any;
    accountLabel: string;
    request: Record<string, unknown>;
    label?: string;
    indent?: number;
    annotations?: string[];
  }
) {
  const { walletClient, accountLabel, request, indent, annotations } = opts;
  const label = opts.label ?? "Send transaction";

  emitLog({
    action,
    type: "tx_submitted",
    label: `Submitting to Tempo testnet...`,
    data: {
      rpc: "eth_sendRawTransaction",
      endpoint: CHAIN_CONFIG.rpcUrl,
      sender: accountLabel,
      ...request,
    },
    indent,
  });

  const hash = await walletClient.sendTransaction(request as any);

  emitLog({
    action,
    type: "info",
    label: `tx_hash: ${hash}`,
    data: { tx_hash: hash },
    indent: (indent ?? 0) + 1,
  });

  emitLog({
    action,
    type: "info",
    label: "Waiting for confirmation...",
    data: {},
    indent,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const decodedEvents = decodeReceiptEvents(receipt.logs, tip20Abi);

  emitLog({
    action,
    type: "tx_confirmed",
    label: `Confirmed in block #${receipt.blockNumber} ${receipt.status === "success" ? "✓" : "✗"}`,
    data: {
      status: receipt.status,
      gas_used: receipt.gasUsed.toString(),
      block_number: receipt.blockNumber.toString(),
      events: decodedEvents,
      explorer: `${CHAIN_CONFIG.explorerUrl}/tx/${hash}`,
    },
    annotations,
    indent,
  });

  return { hash, receipt, decodedEvents };
}

// ---------------------------------------------------------------------------
// Instrumented getLogs
// ---------------------------------------------------------------------------

export async function instrumentedGetLogs(
  action: string,
  opts: {
    address: Address;
    abi: Abi;
    eventName: string;
    args?: Record<string, unknown>;
    fromBlock?: bigint;
    toBlock?: bigint | "latest";
    label?: string;
    indent?: number;
  }
) {
  const { address, abi, eventName, args, fromBlock, toBlock, indent } = opts;
  const label = opts.label ?? `Query ${eventName} events`;

  emitLog({
    action,
    type: "rpc_call",
    label: "RPC: eth_getLogs",
    data: {
      address,
      event: eventName,
      filter: args ?? "none",
      from_block: fromBlock?.toString() ?? "latest-1000",
      to_block: toBlock?.toString() ?? "latest",
    },
    indent,
  });

  const logs = await publicClient.getLogs({
    address,
    event: getAbiItem({ abi: abi as any, name: eventName }) as any,
    args: args as any,
    fromBlock: fromBlock ?? "earliest",
    toBlock: toBlock ?? "latest",
  });

  emitLog({
    action,
    type: "rpc_result",
    label: `Found ${logs.length} events`,
    data: { count: logs.length },
    indent,
  });

  return logs;
}

// ---------------------------------------------------------------------------
// Action runner — wraps an entire action with start/complete/error lifecycle
// ---------------------------------------------------------------------------

export async function runAction<T>(
  action: string,
  fn: () => Promise<T>
): Promise<T> {
  emitActionStart(action);
  try {
    const result = await fn();
    // Refresh and broadcast account state after each action
    if (accountStore.isInitialized()) {
      emitAccounts(accountStore.toPublic());
    }
    emitActionComplete(action);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emitLog({
      action,
      type: "error",
      label: `Action failed: ${message}`,
      data: { error: message },
    });
    emitActionError(action, message);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Decode events from a transaction receipt using the provided ABI */
function decodeReceiptEvents(logs: Log[], abi: Abi): Record<string, unknown>[] {
  const decoded: Record<string, unknown>[] = [];
  for (const log of logs) {
    try {
      const event: any = decodeEventLog({
        abi: abi as any,
        data: log.data,
        topics: log.topics,
      });
      decoded.push({
        event: event.eventName,
        args: Object.fromEntries(
          Object.entries(event.args ?? {}).map(([k, v]) => [k, shortDisplay(v)])
        ),
      });
    } catch {
      // Skip events that don't match the provided ABI
    }
  }
  return decoded;
}

/** Display a value in a short, readable format */
function shortDisplay(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") {
    if (value.startsWith("0x") && value.length > 20) {
      return shortAddress(value);
    }
    return value;
  }
  if (Array.isArray(value)) return `[${value.map(shortDisplay).join(", ")}]`;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
