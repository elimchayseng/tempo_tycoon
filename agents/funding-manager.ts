import { createLogger } from '../shared/logger.js';
import { batchAction } from "../server/actions/batch.js";
import { ALPHA_USD } from "../server/tempo-client.js";
import type { BatchFundingRequest, BatchFundingResult, AgentConfig } from "./types.js";

const log = createLogger('FundingManager');

export class FundingManager {
  private readonly zooMasterLabel = 'zoo_master';
  private refundThreshold: number;
  private initialFundingAmount: string;
  private refundAmount: string;

  constructor(config: {
    refundThreshold?: number;
    initialFundingAmount?: string;
    refundAmount?: string;
  } = {}) {
    this.refundThreshold = config.refundThreshold || 10.0;
    this.initialFundingAmount = config.initialFundingAmount || "50.00";
    this.refundAmount = config.refundAmount || "30.00";
  }

  async fundAllAgentWallets(attendeeConfigs: AgentConfig[]): Promise<BatchFundingResult> {
    log.info(`Initiating initial funding for ${attendeeConfigs.length} attendees...`);

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

  async fundMerchantWallet(merchantAddress: string, merchantAgentId: string): Promise<BatchFundingResult> {
    log.info(`Initiating merchant funding for ${merchantAgentId}...`);

    const request: BatchFundingRequest = {
      recipients: [{
        address: merchantAddress,
        amount: this.initialFundingAmount,
        agent_id: merchantAgentId,
      }],
      reason: 'initial_funding',
    };

    return this.executeBatchFunding(request);
  }

  async checkAndTopUpAgentWallets(
    attendeeAccounts: { label: string; address: string; balances: Record<string, bigint> }[]
  ): Promise<BatchFundingResult | null> {
    const lowBalanceAttendees = this.findLowAlphaUsdWallets(attendeeAccounts);

    if (lowBalanceAttendees.length === 0) {
      log.debug(`All attendees have sufficient balance (>${this.refundThreshold} AlphaUSD)`);
      return null;
    }

    log.info(`${lowBalanceAttendees.length} attendees need refunding...`);

    const recipients = lowBalanceAttendees.map(attendee => ({
      address: attendee.address,
      amount: this.refundAmount,
      agent_id: attendee.label.replace(' ', '_').toLowerCase()
    }));

    const request: BatchFundingRequest = {
      recipients,
      reason: 'refund'
    };

    return this.executeBatchFunding(request);
  }

  private findLowAlphaUsdWallets(
    attendeeAccounts: { label: string; address: string; balances: Record<string, bigint> }[]
  ): { label: string; address: string; balance: number }[] {
    const lowBalanceAttendees = [];

    for (const account of attendeeAccounts) {
      const balanceBigInt = account.balances[ALPHA_USD] || BigInt(0);
      const balanceUsd = Number(balanceBigInt) / 1_000_000;

      log.debug(`${account.label}: $${balanceUsd.toFixed(2)} AlphaUSD`);

      if (balanceUsd < this.refundThreshold) {
        lowBalanceAttendees.push({
          label: account.label,
          address: account.address,
          balance: balanceUsd
        });
        log.info(`${account.label} below threshold ($${balanceUsd.toFixed(2)} < $${this.refundThreshold})`);
      }
    }

    return lowBalanceAttendees;
  }

  private async executeBatchFunding(request: BatchFundingRequest): Promise<BatchFundingResult> {
    try {
      const totalAmount = request.recipients.reduce((sum, r) => sum + parseFloat(r.amount), 0);
      const reasonText = request.reason === 'initial_funding' ? 'Initial Zoo Funding' : 'Zoo Refunding';

      log.info(`Executing batch ${request.reason} for ${request.recipients.length} attendees (Total: $${totalAmount.toFixed(2)})`);

      log.debug('Wallet Address Mapping:');
      request.recipients.forEach((recipient) => {
        log.debug(`  ${recipient.agent_id} -> ${recipient.address} (funding $${recipient.amount})`);
      });

      const batchParams = {
        from: this.zooMasterLabel,
        payments: request.recipients.map((recipient, index) => ({
          to: recipient.agent_id,
          amount: recipient.amount,
          memo: `${reasonText} #${index + 1}`
        }))
      };

      log.debug('Batch payment structure:', {
        from: batchParams.from,
        payment_count: batchParams.payments.length,
        total_amount: `$${totalAmount.toFixed(2)}`,
      });

      const batchResult = await batchAction(batchParams);

      const txHashes = batchResult?.txHashes || [];

      if (txHashes.length > 0) {
        txHashes.forEach((txHash, index) => {
          const recipient = request.recipients[index];
          if (recipient) {
            log.debug(`${recipient.agent_id} funded $${recipient.amount} - TX: ${txHash}`);
          }
        });
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

      log.info(`Batch funding completed: $${result.total_amount} to ${result.funded_agents.length} agents`);

      return result;

    } catch (error) {
      log.error('Batch funding failed:', error);

      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        success: false,
        funded_agents: [],
        total_amount: "0.00",
        error: `Batch funding failed: ${errorMessage}`
      };
    }
  }

  getStatus() {
    return {
      zoo_master_label: this.zooMasterLabel,
      refund_threshold: `$${this.refundThreshold}`,
      initial_funding_amount: `$${this.initialFundingAmount}`,
      refund_amount: `$${this.refundAmount}`,
      funding_method: 'batch_payment'
    };
  }

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

    log.info('Configuration updated:', this.getStatus());
  }
}
