import { createLogger } from '../shared/logger.js';
import { sendAction } from "../server/actions/send.js";
import { accountStore } from "../server/accounts.js";
import { rpcCircuitBreaker } from './circuit-breaker.js';
import type { CheckoutSession, PurchaseRecord, MerchantProduct } from './types.js';

const log = createLogger('PaymentManager');

// --- Transaction Queue (singleton) ---
// Ensures sequential tx processing with minimum gap to avoid nonce collisions.
class TransactionQueue {
  private queue: Array<{ fn: () => Promise<unknown>; resolve: (v: unknown) => void; reject: (e: unknown) => void }> = [];
  private processing = false;
  private readonly minGapMs = 500;

  enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ fn, resolve: resolve as (v: unknown) => void, reject });
      if (!this.processing) this.process();
    });
  }

  private async process(): Promise<void> {
    this.processing = true;
    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      try {
        const result = await item.fn();
        item.resolve(result);
      } catch (err) {
        item.reject(err);
      }
      if (this.queue.length > 0) {
        await new Promise(r => setTimeout(r, this.minGapMs));
      }
    }
    this.processing = false;
  }
}

const txQueue = new TransactionQueue();

const NON_RECOVERABLE_PATTERNS = [
  'insufficient funds',
  'insufficient balance',
  'unknown account',
  'account not found',
];

export interface PaymentResult {
  success: boolean;
  tx_hash?: string;
  block_number?: string;
  amount: string;
  error?: string;
  gas_used?: string;
}

export class PaymentManager {
  private readonly agentId: string;
  private readonly agentLabel: string;

  constructor(agentId: string, agentLabel: string) {
    this.agentId = agentId;
    this.agentLabel = agentLabel;

    log.info(`[${this.agentId}] Payment manager initialized for ${agentLabel}`);
  }

  /**
   * Execute payment for a checkout session
   */
  async makePayment(session: CheckoutSession, product: MerchantProduct): Promise<PaymentResult> {
    log.info(`[${this.agentId}] Processing payment for session ${session.session_id}`);
    log.debug(`[${this.agentId}] Product: ${product.name} ($${session.amount}), Recipient: ${session.recipient_address}`);

    try {
      const merchantLabel = await this.getMerchantLabelFromAddress(session.recipient_address);

      const paymentParams = {
        from: this.agentLabel,
        to: merchantLabel,
        amount: session.amount,
        memo: session.memo
      };

      log.debug(`[${this.agentId}] Executing payment:`, {
        from: paymentParams.from,
        to: paymentParams.to,
        amount: `$${paymentParams.amount}`,
        memo: paymentParams.memo
      });

      const sendResult = await sendAction(paymentParams);

      log.info(`[${this.agentId}] Payment completed successfully!`);

      const result: PaymentResult = {
        success: true,
        amount: session.amount,
        tx_hash: sendResult.txHash,
        block_number: sendResult.blockNumber,
        gas_used: sendResult.gasUsed,
      };

      log.debug(`[${this.agentId}] Payment result:`, result);

      return result;

    } catch (error) {
      log.error(`[${this.agentId}] Payment failed:`, error);

      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        success: false,
        amount: session.amount,
        error: `Payment failed: ${errorMessage}`
      };
    }
  }

  /**
   * Execute payment with retry logic and circuit breaker protection.
   */
  async makePaymentWithRetry(session: CheckoutSession, product: MerchantProduct): Promise<PaymentResult> {
    const maxRetries = 3;
    const baseDelayMs = 2000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await rpcCircuitBreaker.execute(() =>
          txQueue.enqueue(() => this.makePayment(session, product))
        );

        if (result.success) return result;

        const errLower = (result.error || '').toLowerCase();
        if (NON_RECOVERABLE_PATTERNS.some(p => errLower.includes(p))) {
          log.warn(`[${this.agentId}] Non-recoverable error, skipping retry: ${result.error}`);
          return result;
        }

        if (attempt < maxRetries) {
          const delay = baseDelayMs * Math.pow(2, attempt - 1);
          log.warn(`[${this.agentId}] Payment attempt ${attempt}/${maxRetries} failed, retrying in ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
        } else {
          return result;
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);

        if (NON_RECOVERABLE_PATTERNS.some(p => msg.toLowerCase().includes(p))) {
          return { success: false, amount: session.amount, error: msg };
        }

        if (attempt < maxRetries) {
          const delay = baseDelayMs * Math.pow(2, attempt - 1);
          log.warn(`[${this.agentId}] Payment attempt ${attempt}/${maxRetries} threw, retrying in ${delay}ms: ${msg}`);
          await new Promise(r => setTimeout(r, delay));
        } else {
          return { success: false, amount: session.amount, error: msg };
        }
      }
    }

    return { success: false, amount: session.amount, error: 'Exhausted all retries' };
  }

  /**
   * Create a purchase record from successful payment
   */
  createPurchaseRecord(
    session: CheckoutSession,
    product: MerchantProduct,
    paymentResult: PaymentResult,
    needsBefore: { food_need: number; fun_need: number },
    needsAfter: { food_need: number; fun_need: number }
  ): PurchaseRecord {
    const record: PurchaseRecord = {
      purchase_id: `purchase_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      session_id: session.session_id,
      sku: product.sku,
      name: product.name,
      amount: paymentResult.amount,
      tx_hash: paymentResult.tx_hash || 'unknown',
      block_number: paymentResult.block_number || 'unknown',
      completed_at: new Date(),
      need_before: needsBefore,
      need_after: needsAfter
    };

    log.info(`[${this.agentId}] Purchase record created: ${record.purchase_id}`);
    log.debug(`[${this.agentId}] Need change: food ${needsBefore.food_need} -> ${needsAfter.food_need}`);

    return record;
  }

  /**
   * Get merchant label from address
   */
  private async getMerchantLabelFromAddress(address: string): Promise<string> {
    log.debug(`[${this.agentId}] Mapping merchant address ${address} to label`);

    const account = accountStore.getByAddress(address);
    if (account) {
      log.debug(`[${this.agentId}] Resolved to ${account.label}`);
      return account.label;
    }

    throw new Error(`No account found for address ${address}`);
  }

  /**
   * Validate payment amount against session
   */
  validatePaymentAmount(session: CheckoutSession, maxBudget: number): boolean {
    const sessionAmount = parseFloat(session.amount);

    if (sessionAmount > maxBudget) {
      log.warn(`[${this.agentId}] Payment amount ($${sessionAmount}) exceeds budget ($${maxBudget})`);
      return false;
    }

    log.debug(`[${this.agentId}] Payment amount ($${sessionAmount}) within budget ($${maxBudget})`);
    return true;
  }

  getStatus() {
    return {
      agent_id: this.agentId,
      agent_label: this.agentLabel,
      payment_method: 'tempo_alphausd',
      supported_features: [
        'tempo_transactions',
        'memo_support',
        'automatic_fee_calculation',
        'balance_validation'
      ]
    };
  }

  estimateTransactionFee(): number {
    return 0.01;
  }

  async checkSufficientBalance(amount: string, currentBalance: number): Promise<boolean> {
    const paymentAmount = parseFloat(amount);
    const estimatedFee = this.estimateTransactionFee();
    const totalCost = paymentAmount + estimatedFee;

    const hasSufficientBalance = currentBalance >= totalCost;

    log.debug(`[${this.agentId}] Balance check: $${currentBalance.toFixed(2)} vs $${totalCost.toFixed(2)} needed — ${hasSufficientBalance ? 'OK' : 'INSUFFICIENT'}`);

    return hasSufficientBalance;
  }
}
