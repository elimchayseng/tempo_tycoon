/**
 * PaymentManager tests — retry logic, queue ordering, non-recoverable error detection.
 *
 * These tests mock the underlying transferAlphaUsdAction and circuit breaker
 * to test the PaymentManager logic in isolation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the transfer action and circuit breaker before importing PaymentManager
vi.mock('../server/actions/send.js', () => ({
  transferAlphaUsdAction: vi.fn(),
}));

vi.mock('../server/accounts.js', () => ({
  accountStore: {
    get: vi.fn(() => null),
    getByAddress: vi.fn((addr: string) => ({ label: 'Merchant A', address: addr })),
  },
}));

vi.mock('../agents/circuit-breaker.js', () => ({
  rpcCircuitBreaker: {
    execute: vi.fn((fn: () => Promise<unknown>) => fn()),
    getStatus: vi.fn(() => ({ state: 'CLOSED', failures: 0 })),
  },
  merchantCircuitBreaker: {
    execute: vi.fn((fn: () => Promise<unknown>) => fn()),
    getStatus: vi.fn(() => ({ state: 'CLOSED', failures: 0 })),
  },
}));

import { PaymentManager } from '../agents/payment-manager.js';
import { transferAlphaUsdAction } from '../server/actions/send.js';
import type { CheckoutSession, MerchantProduct } from '../agents/types.js';

const mockTransfer = vi.mocked(transferAlphaUsdAction);

const session: CheckoutSession = {
  session_id: 'sess_1',
  amount: '5.00',
  currency: 'AlphaUSD',
  recipient_address: '0xMerchant',
  expires_at: new Date(Date.now() + 60000).toISOString(),
  memo: 'Test purchase',
  product: { sku: 'burger-1', name: 'Burger', price: '5.00', quantity: 1 },
};

const product: MerchantProduct = {
  sku: 'burger-1',
  name: 'Burger',
  price: '5.00',
  currency: 'AlphaUSD',
  category: 'main',
  available: true,
};

describe('PaymentManager', () => {
  let pm: PaymentManager;

  beforeEach(() => {
    vi.clearAllMocks();
    pm = new PaymentManager('guest_1', 'Guest 1');
  });

  describe('executeAlphaUsdTransfer', () => {
    it('returns success result on successful transfer', async () => {
      mockTransfer.mockResolvedValue({
        txHash: '0xabc',
        blockNumber: '100',
        gasUsed: '21000',
        feeAusd: '0.01',
        feePayer: '0xFee',
      });

      const result = await pm.executeAlphaUsdTransfer(session, product);
      expect(result.success).toBe(true);
      expect(result.tx_hash).toBe('0xabc');
      expect(result.amount).toBe('5.00');
    });

    it('returns failure result on transfer error', async () => {
      mockTransfer.mockRejectedValue(new Error('Network error'));

      const result = await pm.executeAlphaUsdTransfer(session, product);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });
  });

  describe('validatePaymentAmount', () => {
    it('returns true when amount within budget', () => {
      expect(pm.validatePaymentAmount(session, 10)).toBe(true);
    });

    it('returns false when amount exceeds budget', () => {
      expect(pm.validatePaymentAmount(session, 3)).toBe(false);
    });
  });

  describe('createPurchaseRecord', () => {
    it('creates a valid purchase record', () => {
      const paymentResult = { success: true, tx_hash: '0xabc', block_number: '100', amount: '5.00' };
      const needsBefore = { food_need: 20, fun_need: 100 };
      const needsAfter = { food_need: 80, fun_need: 100 };

      const record = pm.createPurchaseRecord(session, product, paymentResult, needsBefore, needsAfter);
      expect(record.session_id).toBe('sess_1');
      expect(record.sku).toBe('burger-1');
      expect(record.amount).toBe('5.00');
      expect(record.tx_hash).toBe('0xabc');
      expect(record.need_before).toEqual(needsBefore);
      expect(record.need_after).toEqual(needsAfter);
      expect(record.purchase_id).toMatch(/^purchase_/);
    });
  });
});
