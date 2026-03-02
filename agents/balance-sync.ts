import { createLogger } from '../shared/logger.js';
import { accountStore } from "../server/accounts.js";
import { ALPHA_USD } from "../server/tempo-client.js";

const log = createLogger('BalanceSync');

/**
 * Utility to sync agent balances between blockchain and local state
 */
export class BalanceSync {

  async getAlphaUsdOnChainBalance(agentId: string): Promise<number> {
    try {
      const account = accountStore.get(agentId);
      if (!account) {
        log.error(`Account not found for agent: ${agentId}`);
        return 0;
      }

      const balanceBigInt = account.balances[ALPHA_USD] || BigInt(0);
      const balanceUsd = Number(balanceBigInt) / 1_000_000;

      log.debug(`${agentId} (${account.address}) balance: $${balanceUsd.toFixed(2)}`);

      return balanceUsd;

    } catch (error) {
      log.error(`Failed to get blockchain balance for ${agentId}:`, error);
      return 0;
    }
  }

  async getFormattedBalance(agentId: string): Promise<string> {
    const balance = await this.getAlphaUsdOnChainBalance(agentId);
    return balance.toFixed(2);
  }

  async hasMinimumAlphaUsd(agentId: string, requiredAmount: number): Promise<boolean> {
    const currentBalance = await this.getAlphaUsdOnChainBalance(agentId);
    const hasEnough = currentBalance >= requiredAmount;

    if (!hasEnough) {
      log.warn(`${agentId} insufficient balance: $${currentBalance.toFixed(2)} < $${requiredAmount.toFixed(2)}`);
    }

    return hasEnough;
  }

  async logBalanceComparison(agentId: string, localBalance: string): Promise<void> {
    const blockchainBalance = await this.getAlphaUsdOnChainBalance(agentId);
    const blockchainBalanceStr = blockchainBalance.toFixed(2);

    if (localBalance !== blockchainBalanceStr) {
      log.warn(`Balance mismatch for ${agentId}: local=$${localBalance}, chain=$${blockchainBalanceStr}, diff=$${(blockchainBalance - parseFloat(localBalance)).toFixed(2)}`);
    } else {
      log.debug(`${agentId} balances in sync: $${blockchainBalanceStr}`);
    }
  }

  getWalletAddress(agentId: string): string | null {
    const account = accountStore.get(agentId);
    return account ? account.address : null;
  }

  getAccountInfo(agentId: string): { address: string; balance: string } | null {
    const account = accountStore.get(agentId);
    if (!account) {
      return null;
    }

    const balanceBigInt = account.balances[ALPHA_USD] || BigInt(0);
    const balanceUsd = Number(balanceBigInt) / 1_000_000;

    return {
      address: account.address,
      balance: balanceUsd.toFixed(2)
    };
  }
}
