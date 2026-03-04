import { createLogger } from '../shared/logger.js';
import { accountStore } from "../server/accounts.js";
import { publicClient, ALPHA_USD } from "../server/tempo-client.js";
import { Abis } from "viem/tempo";

const log = createLogger('BalanceSync');

/**
 * Utility to sync agent balances between blockchain and local state.
 * Reads balances directly from the Tempo blockchain via readContract.
 * Exported as plain functions — no instance state needed.
 */

export async function getAlphaUsdOnChainBalance(agentId: string): Promise<number> {
  try {
    const account = accountStore.get(agentId);
    if (!account) {
      log.error(`Account not found for agent: ${agentId}`);
      return 0;
    }

    // Read balance directly from the blockchain
    const balanceBigInt = await publicClient.readContract({
      address: ALPHA_USD,
      abi: Abis.tip20,
      functionName: "balanceOf",
      args: [account.address],
    }) as bigint;

    const balanceUsd = Number(balanceBigInt) / 1_000_000;

    // Update the in-memory cache so other consumers stay fresh
    accountStore.updateBalance(account.label, ALPHA_USD, balanceBigInt);

    log.debug(`${agentId} (${account.address}) on-chain balance: $${balanceUsd.toFixed(2)}`);

    return balanceUsd;

  } catch (error) {
    log.error(`Failed to get blockchain balance for ${agentId}:`, error);
    return 0;
  }
}

export function getWalletAddress(agentId: string): string | null {
  const account = accountStore.get(agentId);
  return account ? account.address : null;
}
