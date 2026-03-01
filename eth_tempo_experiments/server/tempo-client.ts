import {
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  type WalletClient,
  type Chain,
  type Transport,
  type Account,
} from "viem";
import { tempoModerato } from "viem/chains";
import { tempoActions, Abis, Addresses } from "viem/tempo";
import { config } from "./config.js";

const transport = http(config.chain.rpcUrl);

// NOTE: We use 'as any' here due to complex viem extension typing issues.
// The runtime behavior is correct and has been verified. This is a known
// limitation with viem's current TypeScript definitions for extensions.
// TODO: Remove when viem improves extension typing in future versions.
export const publicClient = createPublicClient({
  chain: tempoModerato,
  transport,
}).extend(tempoActions as any) as any;

export function createTempoWalletClient(account: Account) {
  return createWalletClient({
    chain: tempoModerato,
    transport,
    account,
  }).extend(tempoActions as any) as any;
}

// Re-export Tempo ABIs and addresses for use in actions
export const tip20Abi = Abis.tip20;
export const tempoAddresses = Addresses;

// Key contract addresses
export const ALPHA_USD = config.contracts.alphaUsd;
export const PATH_USD = Addresses.pathUsd;
export const BETA_USD = config.contracts.betaUsd;
export const TIP20_FACTORY = Addresses.tip20Factory;
export const STABLECOIN_DEX = Addresses.stablecoinDex;

export const CHAIN_CONFIG = config.chain;

// TIP-20 uses 6 decimals (like USDC)
export const TIP20_DECIMALS = 6;

/** Convert a human-readable USD amount (e.g. "5.00") to raw TIP-20 units */
export function parseUsdAmount(amount: string): bigint {
  const parts = amount.split(".");
  const whole = BigInt(parts[0]) * BigInt(10 ** TIP20_DECIMALS);
  if (parts[1]) {
    const decimals = parts[1].padEnd(TIP20_DECIMALS, "0").slice(0, TIP20_DECIMALS);
    return whole + BigInt(decimals);
  }
  return whole;
}

/** Convert raw TIP-20 units to a human-readable USD string */
export function formatUsdAmount(raw: bigint | any): string {
  // If raw is undefined or null, force it to 0n
  const bigRaw = (raw === undefined || raw === null) ? 0n : BigInt(raw);
  
  const divisor = 10n ** BigInt(TIP20_DECIMALS);
  const whole = bigRaw / divisor;
  const frac = bigRaw % divisor;
  
  const fracStr = frac.toString().padStart(TIP20_DECIMALS, "0");
  const trimmed = fracStr.replace(/0+$/, "").padEnd(2, "0");
  
  return `${whole}.${trimmed}`;
}

/** Shorten an address for display: 0x1234...abcd */
export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
