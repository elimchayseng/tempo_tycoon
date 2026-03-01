import { sendAction } from "../eth_tempo_experiments/server/actions/send.js";
import { accountStore } from "../eth_tempo_experiments/server/accounts.js";
import { rpcCircuitBreaker } from './circuit-breaker.js';
import type { CheckoutSession, PurchaseRecord, MerchantProduct } from './types.js';

// --- Transaction Queue (singleton) ---
// Ensures sequential tx processing with minimum gap to avoid nonce collisions.
class TransactionQueue {
  private queue: Array<{ fn: () => Promise<any>; resolve: (v: any) => void; reject: (e: any) => void }> = [];
  private processing = false;
  private readonly minGapMs = 500;

  enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
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
  private readonly agentLabel: string; // Account label for sendAction (e.g., "Attendee 1")

  constructor(agentId: string, agentLabel: string) {
    this.agentId = agentId;
    this.agentLabel = agentLabel;

    console.log(`[PaymentManager:${this.agentId}] 💳 Payment manager initialized for ${agentLabel}`);
  }

  /**
   * Execute payment for a checkout session
   */
  async makePayment(session: CheckoutSession, product: MerchantProduct): Promise<PaymentResult> {
    console.log(`[PaymentManager:${this.agentId}] 💰 Processing payment for session ${session.session_id}`);
    console.log(`[PaymentManager:${this.agentId}] 📦 Product: ${product.name} ($${session.amount})`);
    console.log(`[PaymentManager:${this.agentId}] 🎯 Recipient: ${session.recipient_address}`);

    try {
      // Prepare payment parameters for sendAction
      // We need to convert the merchant address back to a label
      const merchantLabel = await this.getMerchantLabelFromAddress(session.recipient_address);

      const paymentParams = {
        from: this.agentLabel,          // e.g., "Attendee 1"
        to: merchantLabel,              // e.g., "Merchant A"
        amount: session.amount,         // e.g., "3.50"
        memo: session.memo             // e.g., "Zoo Purchase: hotdog"
      };

      console.log(`[PaymentManager:${this.agentId}] 🚀 Executing payment:`, {
        from: paymentParams.from,
        to: paymentParams.to,
        amount: `$${paymentParams.amount}`,
        memo: paymentParams.memo
      });

      // Execute the payment using the existing sendAction
      const sendResult = await sendAction(paymentParams);

      console.log(`[PaymentManager:${this.agentId}] ✅ Payment completed successfully!`);

      const result: PaymentResult = {
        success: true,
        amount: session.amount,
        tx_hash: sendResult.txHash,
        block_number: sendResult.blockNumber,
        gas_used: sendResult.gasUsed,
      };

      console.log(`[PaymentManager:${this.agentId}] 🧾 Payment result:`, result);

      return result;

    } catch (error) {
      console.error(`[PaymentManager:${this.agentId}] ❌ Payment failed:`, error);

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
   * Retries up to 3 times with exponential backoff (2s base).
   * Non-recoverable errors (insufficient funds, unknown accounts) skip retry.
   * All attempts go through the global TransactionQueue to prevent nonce collisions.
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

        // Check for non-recoverable error
        const errLower = (result.error || '').toLowerCase();
        if (NON_RECOVERABLE_PATTERNS.some(p => errLower.includes(p))) {
          console.log(`[PaymentManager:${this.agentId}] Non-recoverable error, skipping retry: ${result.error}`);
          return result;
        }

        if (attempt < maxRetries) {
          const delay = baseDelayMs * Math.pow(2, attempt - 1);
          console.log(`[PaymentManager:${this.agentId}] Payment attempt ${attempt}/${maxRetries} failed, retrying in ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
        } else {
          return result;
        }
      } catch (error) {
        // Circuit breaker open or other thrown error
        const msg = error instanceof Error ? error.message : String(error);

        if (NON_RECOVERABLE_PATTERNS.some(p => msg.toLowerCase().includes(p))) {
          return { success: false, amount: session.amount, error: msg };
        }

        if (attempt < maxRetries) {
          const delay = baseDelayMs * Math.pow(2, attempt - 1);
          console.log(`[PaymentManager:${this.agentId}] Payment attempt ${attempt}/${maxRetries} threw, retrying in ${delay}ms: ${msg}`);
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

    console.log(`[PaymentManager:${this.agentId}] 📋 Purchase record created: ${record.purchase_id}`);
    console.log(`[PaymentManager:${this.agentId}] 📊 Need change: food ${needsBefore.food_need} → ${needsAfter.food_need}`);

    return record;
  }

  /**
   * Get merchant label from address - this maps addresses back to account labels
   * In a production system, this would query the account store
   */
  private async getMerchantLabelFromAddress(address: string): Promise<string> {
    console.log(`[PaymentManager:${this.agentId}] 🔍 Mapping merchant address ${address} to label`);

    const account = accountStore.getByAddress(address);
    if (account) {
      console.log(`[PaymentManager:${this.agentId}] ✓ Resolved to ${account.label}`);
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
      console.log(`[PaymentManager:${this.agentId}] ⚠️  Payment amount ($${sessionAmount}) exceeds budget ($${maxBudget})`);
      return false;
    }

    console.log(`[PaymentManager:${this.agentId}] ✓ Payment amount ($${sessionAmount}) within budget ($${maxBudget})`);
    return true;
  }

  /**
   * Get payment manager status
   */
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

  /**
   * Estimate transaction fee (for budget planning)
   * This is a rough estimate - actual fee depends on network conditions
   */
  estimateTransactionFee(): number {
    // Based on typical Tempo transaction costs
    // This is a rough estimate for budget planning
    return 0.01; // ~$0.01 USD typical fee
  }

  /**
   * Check if agent has sufficient balance for a payment
   * Note: The sendAction will do the actual balance check, but this helps with decision making
   */
  async checkSufficientBalance(amount: string, currentBalance: number): Promise<boolean> {
    const paymentAmount = parseFloat(amount);
    const estimatedFee = this.estimateTransactionFee();
    const totalCost = paymentAmount + estimatedFee;

    const hasSufficientBalance = currentBalance >= totalCost;

    console.log(`[PaymentManager:${this.agentId}] 💰 Balance check: $${currentBalance.toFixed(2)} vs $${totalCost.toFixed(2)} needed`);
    console.log(`[PaymentManager:${this.agentId}] ${hasSufficientBalance ? '✓' : '❌'} Sufficient balance: ${hasSufficientBalance}`);

    return hasSufficientBalance;
  }
}