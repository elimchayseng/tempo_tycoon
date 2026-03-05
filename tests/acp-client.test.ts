import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ACPClient } from '../agents/acp-client.js';

// Mock the circuit breaker to pass through
vi.mock('../agents/circuit-breaker.js', () => ({
  merchantCircuitBreaker: {
    execute: <T>(fn: () => Promise<T>) => fn(),
  },
}));

const mockRegistry = {
  zoo_info: { name: 'Zoo', facilitator_address: '0x1', chain_id: 42431, currency: 'AlphaUSD', polling_interval_ms: 10000 },
  merchants: [{ id: 'food-vendor', name: 'Food Vendor', category: 'food', endpoint: '/api/merchant/food', wallet_address: '0x2', menu: [] }],
};

const mockCatalog = {
  merchant_id: 'food-vendor',
  merchant_name: 'Food Vendor',
  category: 'food',
  products: [
    { sku: 'burger', name: 'Burger', price: '5.00', currency: 'AlphaUSD', category: 'meal', satisfaction_value: 30, available: true },
    { sku: 'salad', name: 'Salad', price: '3.00', currency: 'AlphaUSD', category: 'meal', satisfaction_value: 20, available: true },
    { sku: 'sold-out', name: 'Sold Out', price: '1.00', currency: 'AlphaUSD', category: 'meal', satisfaction_value: 10, available: false },
  ],
  updated_at: '2025-01-01T00:00:00Z',
};

const mockSession = {
  session_id: 'sess-123',
  amount: '5.00',
  currency: 'AlphaUSD',
  recipient_address: '0x2',
  expires_at: '2025-01-01T01:00:00Z',
  memo: 'Zoo purchase',
  items: [{ sku: 'burger', name: 'Burger', price: '5.00', quantity: 1, satisfaction_value: 30 }],
};

const mockCheckoutResult = {
  success: true,
  verified: true,
  purchase_id: 'purchase-456',
  session_id: 'sess-123',
};

function mockFetch(response: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(response),
    text: () => Promise.resolve(JSON.stringify(response)),
  });
}

describe('ACPClient', () => {
  let client: ACPClient;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    client = new ACPClient('http://localhost:4000', 1, 10); // 1 retry, 10ms delay for fast tests
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('fetchZooRegistry returns registry data', async () => {
    globalThis.fetch = mockFetch(mockRegistry);
    const result = await client.fetchZooRegistry();
    expect(result.merchants).toHaveLength(1);
    expect(result.merchants[0].category).toBe('food');
  });

  it('getMerchantCatalog caches results', async () => {
    const fetchSpy = mockFetch(mockCatalog);
    globalThis.fetch = fetchSpy;

    await client.getMerchantCatalog('food');
    await client.getMerchantCatalog('food');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('createCheckoutSession sends correct body', async () => {
    const fetchSpy = mockFetch(mockSession);
    globalThis.fetch = fetchSpy;

    const result = await client.createCheckoutSession('food', 'burger', 1, '0xBuyer');
    expect(result.session_id).toBe('sess-123');
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:4000/api/merchant/food/checkout/create',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('completeCheckout returns result', async () => {
    globalThis.fetch = mockFetch(mockCheckoutResult);
    const result = await client.completeCheckout('food', 'sess-123', '0xTxHash');
    expect(result.success).toBe(true);
    expect(result.purchase_id).toBe('purchase-456');
  });

  it('completeCheckout returns error on failure', async () => {
    globalThis.fetch = mockFetch({ error: 'bad' }, 500);
    const result = await client.completeCheckout('food', 'sess-123', '0xTxHash');
    expect(result.success).toBe(false);
  });

  it('findRandomProduct filters unavailable products', () => {
    const product = client.findRandomProduct(mockCatalog);
    expect(product).not.toBeNull();
    expect(product!.available).toBe(true);
    expect(product!.sku).not.toBe('sold-out');
  });

  it('findRandomProduct filters by category', () => {
    const product = client.findRandomProduct(mockCatalog, 'meal');
    expect(product).not.toBeNull();
    expect(product!.category).toBe('meal');
  });

  it('findRandomProduct returns null when none available', () => {
    const emptyCatalog = { ...mockCatalog, products: [{ ...mockCatalog.products[2] }] };
    const product = client.findRandomProduct(emptyCatalog);
    expect(product).toBeNull();
  });

  it('retries on failure then throws', async () => {
    const fetchSpy = mockFetch({ error: 'fail' }, 500);
    globalThis.fetch = fetchSpy;

    await expect(client.fetchZooRegistry()).rejects.toThrow();
  });

  it('respects abort signal', async () => {
    const controller = new AbortController();
    controller.abort();

    globalThis.fetch = mockFetch(mockRegistry);

    await expect(client.fetchZooRegistry(controller.signal)).rejects.toThrow();
  });
});
