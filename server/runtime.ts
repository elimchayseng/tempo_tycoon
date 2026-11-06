/**
 * Runtime hooks that differ between the Node server and the Cloudflare
 * Durable Object host.
 *
 * Agents talk to the merchant (ACP) endpoints over HTTP. On Node that is a
 * real loopback request to localhost; inside a Durable Object there is no
 * localhost, so the host registers an in-process fetch that dispatches
 * straight into the Hono app instead.
 */

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

let internalFetch: FetchFn | null = null;
let internalBaseUrl: string | null = null;

/** Register an in-process fetch used for agent → server (ACP) requests. */
export function setInternalFetch(fn: FetchFn, baseUrl: string): void {
  internalFetch = fn;
  internalBaseUrl = baseUrl;
}

/** Fetch used by agents for ACP requests. Defaults to the global fetch. */
export function getInternalFetch(): FetchFn {
  return internalFetch ?? ((input, init) => globalThis.fetch(input, init));
}

/** Base URL agents use to reach the ACP endpoints. */
export function getInternalBaseUrl(): string {
  return internalBaseUrl ?? `http://localhost:${process.env.PORT || 4000}`;
}
