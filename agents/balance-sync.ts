import { accountStore } from "../eth_tempo_experiments/server/accounts.js";
import { formatUsdAmount, ALPHA_USD } from "../eth_tempo_experiments/server/tempo-client.js";

/**
 * Utility to sync agent balances between blockchain and local state
 */
export class BalanceSync {

  /**
   * Get live blockchain balance for an agent
   */
  async getBlockchainBalance(agentId: string): Promise<number> {
    try {
      // Get the account from the account store
      const account = accountStore.get(agentId);
      if (!account) {
        console.error(`[BalanceSync] ❌ Account not found for agent: ${agentId}`);
        return 0;
      }

      // Get the balance from account store (which should be updated by transactions)
      const balanceBigInt = account.balances[ALPHA_USD] || BigInt(0);

      // Convert from 6-decimal TIP20 format to USD
      const balanceUsd = Number(balanceBigInt) / 1_000_000;

      console.log(`[BalanceSync] 💰 ${agentId} (${account.address}) balance: $${balanceUsd.toFixed(2)}`);

      return balanceUsd;

    } catch (error) {
      console.error(`[BalanceSync] ❌ Failed to get blockchain balance for ${agentId}:`, error);
      return 0;
    }
  }

  /**
   * Get formatted balance string
   */
  async getFormattedBalance(agentId: string): Promise<string> {
    const balance = await this.getBlockchainBalance(agentId);
    return balance.toFixed(2);
  }

  /**
   * Check if agent has sufficient balance for an amount
   */
  async hasSufficientBalance(agentId: string, requiredAmount: number): Promise<boolean> {
    const currentBalance = await this.getBlockchainBalance(agentId);
    const hasEnough = currentBalance >= requiredAmount;

    if (!hasEnough) {
      console.log(`[BalanceSync] 💳 ${agentId} insufficient balance: $${currentBalance.toFixed(2)} < $${requiredAmount.toFixed(2)}`);
    }

    return hasEnough;
  }

  /**
   * Log balance comparison for debugging
   */
  async logBalanceComparison(agentId: string, localBalance: string): Promise<void> {
    const blockchainBalance = await this.getBlockchainBalance(agentId);
    const blockchainBalanceStr = blockchainBalance.toFixed(2);

    if (localBalance !== blockchainBalanceStr) {
      console.warn(`[BalanceSync] ⚠️  Balance mismatch for ${agentId}:`);
      console.warn(`[BalanceSync]   Local state: $${localBalance}`);
      console.warn(`[BalanceSync]   Blockchain:  $${blockchainBalanceStr}`);
      console.warn(`[BalanceSync]   Difference:  $${(blockchainBalance - parseFloat(localBalance)).toFixed(2)}`);
    } else {
      console.log(`[BalanceSync] ✅ ${agentId} balances in sync: $${blockchainBalanceStr}`);
    }
  }

  /**
   * Get wallet address for an agent
   */
  getWalletAddress(agentId: string): string | null {
    const account = accountStore.get(agentId);
    return account ? account.address : null;
  }

  /**
   * Get account info for logging
   */
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