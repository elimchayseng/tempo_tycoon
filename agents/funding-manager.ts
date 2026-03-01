import { AccountState } from "../eth_tempo_experiments/server/accounts.js";
import { batchAction } from "../eth_tempo_experiments/server/actions/batch.js";
import { ALPHA_USD } from "../eth_tempo_experiments/server/tempo-client.js";
import type { BatchFundingRequest, BatchFundingResult, AgentConfig } from "./types.js";

export class FundingManager {
  private readonly zooMasterLabel = 'zoo_master';
  private readonly refundThreshold: number;
  private readonly initialFundingAmount: string;
  private readonly refundAmount: string;

  constructor(config: {
    refundThreshold?: number;
    initialFundingAmount?: string;
    refundAmount?: string;
  } = {}) {
    this.refundThreshold = config.refundThreshold || 10.0;
    this.initialFundingAmount = config.initialFundingAmount || "50.00";
    this.refundAmount = config.refundAmount || "30.00";
  }

  /**
   * Fund all attendees with initial funding amount
   */
  async fundAllAttendees(attendeeConfigs: AgentConfig[]): Promise<BatchFundingResult> {
    console.log(`[FundingManager] 💰 Initiating initial funding for ${attendeeConfigs.length} attendees...`);

    const recipients = attendeeConfigs.map(config => ({
      address: config.address,
      amount: this.initialFundingAmount,
      agent_id: config.agent_id
    }));

    const request: BatchFundingRequest = {
      recipients,
      reason: 'initial_funding'
    };

    return this.executeBatchFunding(request);
  }

  /**
   * Check attendee balances and fund those below threshold
   */
  async checkAndRefundAttendees(
    attendeeAccounts: { label: string; address: string; balances: Record<string, bigint> }[]
  ): Promise<BatchFundingResult | null> {
    const lowBalanceAttendees = this.findLowBalanceAttendees(attendeeAccounts);

    if (lowBalanceAttendees.length === 0) {
      console.log(`[FundingManager] ✓ All attendees have sufficient balance (>${this.refundThreshold} AlphaUSD)`);
      return null;
    }

    console.log(`[FundingManager] 🔄 ${lowBalanceAttendees.length} attendees need refunding...`);

    const recipients = lowBalanceAttendees.map(attendee => ({
      address: attendee.address,
      amount: this.refundAmount,
      agent_id: attendee.label.replace(' ', '_').toLowerCase() // Convert "Attendee 1" to "attendee_1"
    }));

    const request: BatchFundingRequest = {
      recipients,
      reason: 'refund'
    };

    return this.executeBatchFunding(request);
  }

  /**
   * Find attendees with balance below threshold
   */
  private findLowBalanceAttendees(
    attendeeAccounts: { label: string; address: string; balances: Record<string, bigint> }[]
  ): { label: string; address: string; balance: number }[] {
    const lowBalanceAttendees = [];
    // Use imported ALPHA_USD constant for consistency

    for (const account of attendeeAccounts) {
      const balanceBigInt = account.balances[ALPHA_USD] || BigInt(0);
      // Convert from 6-decimal TIP20 format to USD
      const balanceUsd = Number(balanceBigInt) / 1_000_000;

      console.log(`[FundingManager] ${account.label}: $${balanceUsd.toFixed(2)} AlphaUSD`);

      if (balanceUsd < this.refundThreshold) {
        lowBalanceAttendees.push({
          label: account.label,
          address: account.address,
          balance: balanceUsd
        });
        console.log(`[FundingManager] ⚠️  ${account.label} below threshold ($${balanceUsd.toFixed(2)} < $${this.refundThreshold})`);
      }
    }

    return lowBalanceAttendees;
  }

  /**
   * Execute batch funding using the existing batch payment system
   */
  private async executeBatchFunding(request: BatchFundingRequest): Promise<BatchFundingResult> {
    try {
      const totalAmount = request.recipients.reduce((sum, r) => sum + parseFloat(r.amount), 0);
      const reasonText = request.reason === 'initial_funding' ? 'Initial Zoo Funding' : 'Zoo Refunding';

      console.log(`[FundingManager] 🚀 Executing batch ${request.reason} for ${request.recipients.length} attendees (Total: $${totalAmount.toFixed(2)})`);

      // Log wallet addresses for each agent being funded
      console.log(`[FundingManager] 💳 Wallet Address Mapping:`);
      request.recipients.forEach((recipient, index) => {
        console.log(`[FundingManager]   ${recipient.agent_id} → 💰 ${recipient.address} (funding $${recipient.amount})`);
      });

      // Prepare batch payment request in the format expected by batchAction
      const batchParams = {
        from: this.zooMasterLabel,
        payments: request.recipients.map((recipient, index) => ({
          to: recipient.agent_id, // Use agent_id as the account label for the batch action
          amount: recipient.amount,
          memo: `${reasonText} #${index + 1}`
        }))
      };

      console.log(`[FundingManager] 📤 Batch payment structure:`, {
        from: batchParams.from,
        payment_count: batchParams.payments.length,
        total_amount: `$${totalAmount.toFixed(2)}`,
        payments: batchParams.payments.map(p => `${p.amount} → ${p.to} (${p.memo})`)
      });

      // Execute the batch payment using the existing batch system
      const batchResult = await batchAction(batchParams);

      // Extract transaction hashes from batch result if available
      const txHashes = batchResult?.txHashes || [];

      console.log(`[FundingManager] 🔗 Transaction Details:`);
      if (txHashes && txHashes.length > 0) {
        txHashes.forEach((txHash, index) => {
          const recipient = request.recipients[index];
          if (recipient) {
            console.log(`[FundingManager]   ${recipient.agent_id} (${recipient.address}) funded $${recipient.amount} - TX: ${txHash}`);
            console.log(`[FundingManager]   🔍 Verify: https://testnet.tempoexplorer.com/tx/${txHash}`);
          }
        });
      } else {
        console.log(`[FundingManager]   ℹ️  Transaction hashes not available from batch operation`);
      }

      const result: BatchFundingResult = {
        success: true,
        funded_agents: request.recipients.map(r => r.agent_id),
        total_amount: totalAmount.toFixed(2),
        transaction_hashes: txHashes,
        wallet_addresses: request.recipients.reduce((acc, r) => {
          acc[r.agent_id] = r.address;
          return acc;
        }, {} as Record<string, string>)
      };

      console.log(`[FundingManager] ✅ Batch funding completed successfully!`);
      console.log(`[FundingManager] 📊 Funding Summary:`, {
        funded_agents: result.funded_agents,
        total_amount: `$${result.total_amount}`,
        reason: request.reason,
        transaction_count: txHashes.length,
        wallet_mapping: result.wallet_addresses
      });

      return result;

    } catch (error) {
      console.error(`[FundingManager] ❌ Batch funding failed:`, error);

      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        success: false,
        funded_agents: [],
        total_amount: "0.00",
        error: `Batch funding failed: ${errorMessage}`
      };
    }
  }

  /**
   * Get funding status and configuration info
   */
  getStatus() {
    return {
      zoo_master_label: this.zooMasterLabel,
      refund_threshold: `$${this.refundThreshold}`,
      initial_funding_amount: `$${this.initialFundingAmount}`,
      refund_amount: `$${this.refundAmount}`,
      funding_method: 'batch_payment'
    };
  }

  /**
   * Update funding configuration
   */
  updateConfig(config: {
    refundThreshold?: number;
    initialFundingAmount?: string;
    refundAmount?: string;
  }) {
    if (config.refundThreshold !== undefined) {
      this.refundThreshold = config.refundThreshold;
    }
    if (config.initialFundingAmount !== undefined) {
      this.initialFundingAmount = config.initialFundingAmount;
    }
    if (config.refundAmount !== undefined) {
      this.refundAmount = config.refundAmount;
    }

    console.log(`[FundingManager] ⚙️  Configuration updated:`, this.getStatus());
  }
}