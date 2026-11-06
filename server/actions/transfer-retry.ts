import {
  BaseError,
  HttpRequestError,
  RpcRequestError,
  SocketClosedError,
  TimeoutError,
  WebSocketRequestError,
} from "viem";
import { Actions, Abis } from "viem/tempo";

/**
 * Retry wrapper for a single TIP-20 transfer, safe against double-sends.
 *
 * viem's http transport already retries a 5xx a few times within ~1s, resending
 * the same signed bytes. This adds a slower, application-level retry on top for
 * upstream outages that last longer than that (e.g. a Cloudflare 502 from the RPC).
 *
 * Double-send protection:
 *   1. The sender's nonce is pinned before the first attempt and reused on every
 *      retry, so at most one of the attempts can ever be included on-chain.
 *   2. Before each retry the recipient's balance is re-read; if it already went up
 *      by `amount`, the earlier attempt landed despite the error and we stop.
 */

const NONCE_ERROR = /nonce too low|already known|replacement transaction underpriced|nonce.*(used|expired)/i;
const NETWORK_ERROR = /ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|EPIPE|socket hang up|fetch failed|network error|timed out/i;

export const DEFAULT_BACKOFF_MS = [1_000, 2_000, 4_000];
export const DEFAULT_MAX_ATTEMPTS = 3;
const NONCE_CONFLICT_POLLS = 5;
const NONCE_CONFLICT_POLL_MS = 1_000;

function errorChain(error: unknown): unknown[] {
  const chain: unknown[] = [];
  let current: unknown = error;
  while (current && chain.length < 10 && !chain.includes(current)) {
    chain.push(current);
    current = (current as { cause?: unknown }).cause;
  }
  return chain;
}

/**
 * True for errors worth retrying: HTTP 5xx, network failures and timeouts.
 * JSON-RPC errors (reverts, bad nonce, insufficient funds) and 4xx are not.
 */
export function isTransientTransportError(error: unknown): boolean {
  const chain = errorChain(error);

  // A JSON-RPC error body means the node processed the request and rejected it.
  if (chain.some((e) => e instanceof RpcRequestError)) return false;

  for (const e of chain) {
    if (e instanceof HttpRequestError) {
      // No status => fetch itself failed (DNS, connection reset, ...).
      if (e.status === undefined) return true;
      return e.status >= 500 && e.status < 600;
    }
    if (e instanceof TimeoutError) return true;
    if (e instanceof SocketClosedError || e instanceof WebSocketRequestError) return true;
  }

  // Non-viem errors (raw fetch/undici failures): fall back to the message.
  return chain.some((e) => e instanceof Error && !(e instanceof BaseError) && NETWORK_ERROR.test(e.message));
}

function isNonceConflict(error: unknown): boolean {
  return errorChain(error).some((e) => {
    if (!(e instanceof Error)) return false;
    const text = e instanceof BaseError ? `${e.shortMessage} ${e.details ?? ""}` : e.message;
    return NONCE_ERROR.test(text);
  });
}

export function describeError(error: unknown): string {
  if (error instanceof BaseError) {
    const http = errorChain(error).find((e): e is HttpRequestError => e instanceof HttpRequestError);
    if (http) return `HTTP ${http.status ?? "request failed"}${http.details ? `: ${http.details}` : ""}`;
    return error.shortMessage;
  }
  return error instanceof Error ? error.message : String(error);
}

export interface TransferWithRetryParams {
  walletClient: any;
  publicClient: any;
  token: `0x${string}`;
  to: `0x${string}`;
  amount: bigint;
  memo?: `0x${string}`;
  maxAttempts?: number;
  backoffMs?: number[];
  /** Injectable for tests. Defaults to `Actions.token.transferSync`. */
  transfer?: (client: any, params: any) => Promise<any>;
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void;
}

export interface TransferWithRetryResult<R = any> {
  /** Result of `transferSync`, or null when an earlier attempt was found on-chain without a receipt. */
  result: R | null;
  attempts: number;
  /** True when a failed attempt was detected as having landed (balance went up) and was not resent. */
  recovered: boolean;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function transferWithRetry<R = any>(
  params: TransferWithRetryParams
): Promise<TransferWithRetryResult<R>> {
  const {
    walletClient,
    publicClient,
    token,
    to,
    amount,
    memo,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    backoffMs = DEFAULT_BACKOFF_MS,
    transfer = Actions.token.transferSync as (client: any, params: any) => Promise<any>,
    sleep = defaultSleep,
    onRetry,
  } = params;

  const readBalance = async () =>
    (await publicClient.readContract({
      address: token,
      abi: Abis.tip20,
      functionName: "balanceOf",
      args: [to],
    })) as bigint;

  const sender = walletClient.account?.address as `0x${string}` | undefined;
  if (!sender) throw new Error("transferWithRetry: wallet client has no account");

  // Baseline for the landed check, and the nonce every attempt will reuse.
  const [balanceBefore, nonce] = await Promise.all([
    readBalance(),
    publicClient.getTransactionCount({ address: sender, blockTag: "pending" }) as Promise<number>,
  ]);

  const landed = async () => {
    try {
      return (await readBalance()) >= balanceBefore + amount;
    } catch {
      return false; // RPC still down; caller decides whether to keep going
    }
  };

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await transfer(walletClient, {
        token,
        to,
        amount,
        ...(memo ? { memo } : {}),
        nonce,
      });
      return { result, attempts: attempt, recovered: false };
    } catch (error) {
      lastError = error;

      // On a retry, a nonce conflict means an earlier attempt with this nonce
      // reached the node (it may still be in the mempool). Wait briefly for it
      // to show up in the recipient's balance instead of failing outright.
      if (attempt > 1 && isNonceConflict(error)) {
        for (let i = 0; i < NONCE_CONFLICT_POLLS; i++) {
          if (await landed()) return { result: null, attempts: attempt, recovered: true };
          if (i < NONCE_CONFLICT_POLLS - 1) await sleep(NONCE_CONFLICT_POLL_MS);
        }
        throw error;
      }

      if (!isTransientTransportError(error) || attempt === maxAttempts) break;

      const delayMs = backoffMs[Math.min(attempt - 1, backoffMs.length - 1)] ?? 0;
      onRetry?.({ attempt, delayMs, error });
      await sleep(delayMs);

      if (await landed()) return { result: null, attempts: attempt, recovered: true };
    }
  }

  // Last chance: the final attempt may have landed despite its error.
  if (isTransientTransportError(lastError) && (await landed())) {
    return { result: null, attempts: maxAttempts, recovered: true };
  }
  throw lastError;
}
