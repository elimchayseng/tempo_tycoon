/**
 * transferWithRetry tests — retry on transient RPC errors without double-sending.
 */
import { describe, it, expect, vi } from 'vitest';
import { BaseError, HttpRequestError, RpcRequestError, TimeoutError } from 'viem';
import { transferWithRetry, isTransientTransportError } from '../server/actions/transfer-retry.js';

const RPC_URL = 'https://rpc.moderato.tempo.xyz';
const TOKEN = '0x20c0000000000000000000000000000000000001' as const;
const SENDER = '0x1111111111111111111111111111111111111111' as const;
const RECIPIENT = '0x2222222222222222222222222222222222222222' as const;
const AMOUNT = 50_000_000n; // $50.00

/** Mirrors what viem throws when Cloudflare returns `error code: 502` for eth_sendRawTransactionSync. */
function http502() {
  const http = new HttpRequestError({
    url: RPC_URL,
    status: 502,
    body: { method: 'eth_sendRawTransactionSync' },
    details: 'error code: 502',
  });
  return new BaseError('An unknown RPC error occurred.', { cause: http });
}

function rpcError(message: string) {
  return new RpcRequestError({ url: RPC_URL, body: {}, error: { code: -32000, message } });
}

function receipt(hash = '0xabc') {
  return { receipt: { transactionHash: hash, gasUsed: 21_000n, blockNumber: 1n, effectiveGasPrice: 1n } };
}

/**
 * Mock wallet client: `transferSync` is the only write it supports. `balances`
 * is the sequence of recipient balances successive balanceOf reads return.
 */
function setup(opts: { balances: bigint[]; nonce?: number }) {
  const walletClient = {
    account: { address: SENDER },
    transferSync: vi.fn(),
  };
  const balances = [...opts.balances];
  const publicClient = {
    readContract: vi.fn(async () => (balances.length > 1 ? balances.shift()! : balances[0])),
    getTransactionCount: vi.fn(async () => opts.nonce ?? 7),
  };
  const sleep = vi.fn(async (_ms: number) => {});
  const run = () =>
    transferWithRetry({
      walletClient,
      publicClient,
      token: TOKEN,
      to: RECIPIENT,
      amount: AMOUNT,
      transfer: (client, params) => client.transferSync(params),
      sleep,
    });
  return { walletClient, publicClient, sleep, run };
}

describe('transferWithRetry', () => {
  it('retries once after a 502, reusing the nonce, after checking the transfer did not land', async () => {
    const { walletClient, publicClient, sleep, run } = setup({ balances: [0n, 0n] });
    walletClient.transferSync.mockRejectedValueOnce(http502()).mockResolvedValueOnce(receipt('0xok'));

    const out = await run();

    expect(out).toEqual({ result: receipt('0xok'), attempts: 2, recovered: false });
    expect(walletClient.transferSync).toHaveBeenCalledTimes(2);
    const [first, second] = walletClient.transferSync.mock.calls.map((c) => c[0]);
    expect(first.nonce).toBe(7);
    expect(second.nonce).toBe(7);
    expect(second).toEqual(first);
    expect(sleep).toHaveBeenCalledWith(1_000);
    // baseline read + re-check before the retry
    expect(publicClient.readContract).toHaveBeenCalledTimes(2);
    expect(publicClient.getTransactionCount).toHaveBeenCalledWith({ address: SENDER, blockTag: 'pending' });
  });

  it('does not resend when the failed attempt actually landed', async () => {
    const { walletClient, run } = setup({ balances: [0n, AMOUNT] });
    walletClient.transferSync.mockRejectedValueOnce(http502());

    const out = await run();

    expect(out).toEqual({ result: null, attempts: 1, recovered: true });
    expect(walletClient.transferSync).toHaveBeenCalledTimes(1);
  });

  it('treats a nonce conflict on retry as landed once the balance confirms it', async () => {
    const { walletClient, run } = setup({ balances: [0n, 0n, AMOUNT] });
    walletClient.transferSync
      .mockRejectedValueOnce(http502())
      .mockRejectedValueOnce(rpcError('nonce too low'));

    const out = await run();

    expect(out).toEqual({ result: null, attempts: 2, recovered: true });
    expect(walletClient.transferSync).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-transient errors', async () => {
    const { walletClient, sleep, run } = setup({ balances: [0n] });
    walletClient.transferSync.mockRejectedValueOnce(rpcError('execution reverted: insufficient balance'));

    await expect(run()).rejects.toBeInstanceOf(RpcRequestError);
    expect(walletClient.transferSync).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('gives up after 3 attempts with 1s/2s backoff', async () => {
    const { walletClient, sleep, run } = setup({ balances: [0n] });
    walletClient.transferSync.mockRejectedValue(http502());

    await expect(run()).rejects.toThrow('An unknown RPC error occurred.');
    expect(walletClient.transferSync).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([1_000, 2_000]);
  });
});

describe('isTransientTransportError', () => {
  const http = (status?: number) =>
    new HttpRequestError({ url: RPC_URL, status, body: {}, cause: status ? undefined : new TypeError('fetch failed') });

  it.each([502, 503, 504, 500])('retries HTTP %i', (status) => {
    expect(isTransientTransportError(new BaseError('wrapped', { cause: http(status) }))).toBe(true);
  });

  it('retries network failures and timeouts', () => {
    expect(isTransientTransportError(http(undefined))).toBe(true);
    expect(isTransientTransportError(new TimeoutError({ body: {}, url: RPC_URL }))).toBe(true);
    expect(isTransientTransportError(new Error('read ECONNRESET'))).toBe(true);
  });

  it('does not retry 4xx, JSON-RPC errors or plain errors', () => {
    expect(isTransientTransportError(http(400))).toBe(false);
    expect(isTransientTransportError(http(429))).toBe(false);
    expect(isTransientTransportError(rpcError('execution reverted'))).toBe(false);
    expect(isTransientTransportError(new Error('Unknown sender account'))).toBe(false);
  });
});
