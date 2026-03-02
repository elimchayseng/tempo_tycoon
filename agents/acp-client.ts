import { createLogger } from '../shared/logger.js';
import { merchantCircuitBreaker } from './circuit-breaker.js';
import type {
  ZooRegistry,
  MerchantCatalog,
  CheckoutSession,
  CheckoutResult,
  MerchantProduct
} from './types.js';

const log = createLogger('ACPClient');

const CACHE_TTL_MS = 60_000; // 60s cache TTL

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export class ACPClient {
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;

  private registryCache: CacheEntry<ZooRegistry> | null = null;
  private catalogCache: Map<string, CacheEntry<MerchantCatalog>> = new Map();

  constructor(baseUrl: string = 'http://localhost:4000', maxRetries: number = 3, retryDelayMs: number = 1000) {
    this.baseUrl = baseUrl;
    this.maxRetries = maxRetries;
    this.retryDelayMs = retryDelayMs;

    log.info(`ACP Client initialized: ${this.baseUrl}`);
  }

  /**
   * Fetch the zoo registry to discover available merchants
   */
  async fetchZooRegistry(): Promise<ZooRegistry> {
    if (this.registryCache && Date.now() < this.registryCache.expiresAt) {
      log.debug('Cache hit: zoo registry');
      return this.registryCache.data;
    }
    log.debug('Cache miss: zoo registry');

    const url = `${this.baseUrl}/api/zoo/registry`;

    try {
      const registry = await merchantCircuitBreaker.execute(() =>
        this.makeRequest<ZooRegistry>('GET', url)
      );

      this.registryCache = { data: registry, expiresAt: Date.now() + CACHE_TTL_MS };
      log.info(`Registry loaded: ${registry.merchants.length} merchants available`);
      return registry;

    } catch (error) {
      log.error('Failed to fetch zoo registry:', error);
      throw new Error(`Failed to fetch zoo registry: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get merchant catalog for a specific category (e.g., 'food')
   */
  async getMerchantCatalog(category: string): Promise<MerchantCatalog> {
    const cached = this.catalogCache.get(category);
    if (cached && Date.now() < cached.expiresAt) {
      log.debug(`Cache hit: ${category} catalog`);
      return cached.data;
    }
    log.debug(`Cache miss: ${category} catalog`);

    const url = `${this.baseUrl}/api/merchant/${category}/catalog`;

    try {
      const catalog = await merchantCircuitBreaker.execute(() =>
        this.makeRequest<MerchantCatalog>('GET', url)
      );

      this.catalogCache.set(category, { data: catalog, expiresAt: Date.now() + CACHE_TTL_MS });
      const availableProducts = catalog.products.filter(p => p.available);
      log.info(`Catalog loaded: ${availableProducts.length}/${catalog.products.length} products available`);
      return catalog;

    } catch (error) {
      log.error(`Failed to fetch ${category} catalog:`, error);
      throw new Error(`Failed to fetch merchant catalog: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create a checkout session for a product
   */
  async createCheckoutSession(
    category: string,
    sku: string,
    quantity: number,
    buyerAddress: string
  ): Promise<CheckoutSession> {
    const url = `${this.baseUrl}/api/merchant/${category}/checkout/create`;

    const requestBody = {
      sku,
      quantity,
      buyer_address: buyerAddress
    };

    log.info(`Creating checkout session for ${sku} (qty: ${quantity})`);
    log.debug('Request:', requestBody);

    try {
      const session = await this.makeRequest<CheckoutSession>('POST', url, requestBody);

      log.info(`Checkout session created: ${session.session_id}`);
      log.debug(`Payment required: $${session.amount} -> ${session.recipient_address}`);

      return session;

    } catch (error) {
      log.error(`Failed to create checkout session for ${sku}:`, error);
      throw new Error(`Failed to create checkout session: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Complete checkout session with transaction hash
   */
  async completeCheckout(
    category: string,
    sessionId: string,
    txHash: string
  ): Promise<CheckoutResult> {
    const url = `${this.baseUrl}/api/merchant/${category}/checkout/complete`;

    const requestBody = {
      session_id: sessionId,
      tx_hash: txHash
    };

    log.info(`Completing checkout session ${sessionId}`);
    log.debug(`Transaction hash: ${txHash}`);

    try {
      const result = await this.makeRequest<CheckoutResult>('POST', url, requestBody);

      if (result.success && result.verified) {
        log.info(`Checkout completed successfully! Purchase ID: ${result.purchase_id}`);
      } else {
        log.warn(`Checkout verification failed: ${result.error || 'Unknown error'}`);
      }

      return result;

    } catch (error) {
      log.error('Failed to complete checkout:', error);

      return {
        success: false,
        verified: false,
        error: `Checkout completion failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Find a random available product from a catalog
   */
  findRandomProduct(catalog: MerchantCatalog, category?: string): MerchantProduct | null {
    let availableProducts = catalog.products.filter(p => p.available);

    if (category) {
      availableProducts = availableProducts.filter(p => p.category === category);
    }

    if (availableProducts.length === 0) {
      log.warn(`No available products found${category ? ` in category '${category}'` : ''}`);
      return null;
    }

    const randomIndex = Math.floor(Math.random() * availableProducts.length);
    const selectedProduct = availableProducts[randomIndex];

    log.debug(`Selected random product: ${selectedProduct.name} ($${selectedProduct.price})`);
    return selectedProduct;
  }

  /**
   * Full ACP purchase flow: discover, catalog, create session
   */
  async initiatePurchase(
    agentAddress: string,
    preferredCategory?: string
  ): Promise<{ session: CheckoutSession; product: MerchantProduct; merchantCategory: string } | null> {
    try {
      log.info(`Initiating ACP purchase flow for ${agentAddress}`);

      const registry = await this.fetchZooRegistry();

      const foodMerchants = registry.merchants.filter(m => m.category === 'food');
      if (foodMerchants.length === 0) {
        log.warn('No food merchants found in registry');
        return null;
      }

      const catalog = await this.getMerchantCatalog('food');

      const product = this.findRandomProduct(catalog, preferredCategory);
      if (!product) {
        log.warn('No available products found for purchase');
        return null;
      }

      const session = await this.createCheckoutSession('food', product.sku, 1, agentAddress);

      log.info(`Purchase flow initiated: ${product.name} ($${product.price}) -> Session ${session.session_id}`);

      return {
        session,
        product,
        merchantCategory: 'food'
      };

    } catch (error) {
      log.error('Purchase initiation failed:', error);
      return null;
    }
  }

  /**
   * Generic HTTP request method with retry logic
   */
  private async makeRequest<T>(
    method: 'GET' | 'POST',
    url: string,
    body?: unknown
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        log.debug(`${method} ${url}${attempt > 1 ? ` (attempt ${attempt}/${this.maxRetries})` : ''}`);

        const requestOptions: RequestInit = {
          method,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'ZooAgent/1.0 (ACP Client)'
          }
        };

        if (body && method === 'POST') {
          requestOptions.body = JSON.stringify(body);
        }

        const response = await fetch(url, requestOptions);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();

        log.debug(`Request successful (${response.status})`);
        return data as T;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        log.warn(`Attempt ${attempt}/${this.maxRetries} failed: ${lastError.message}`);

        if (attempt < this.maxRetries) {
          const delayMs = this.retryDelayMs * Math.pow(2, attempt - 1);
          log.debug(`Retrying in ${delayMs}ms...`);
          await this.delay(delayMs);
        }
      }
    }

    throw lastError || new Error('Request failed after all retries');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Health check for the ACP endpoints
   */
  async healthCheck(): Promise<{ registry: boolean; catalog: boolean; merchant_server: string }> {
    log.info('Running ACP health check...');

    const health = {
      registry: false,
      catalog: false,
      merchant_server: this.baseUrl
    };

    try {
      await this.makeRequest('GET', `${this.baseUrl}/api/zoo/registry`);
      health.registry = true;
      log.info('Registry endpoint healthy');
    } catch (error) {
      log.warn('Registry endpoint failed:', error instanceof Error ? error.message : String(error));
    }

    try {
      await this.makeRequest('GET', `${this.baseUrl}/api/merchant/food/catalog`);
      health.catalog = true;
      log.info('Catalog endpoint healthy');
    } catch (error) {
      log.warn('Catalog endpoint failed:', error instanceof Error ? error.message : String(error));
    }

    const healthyEndpoints = Object.values(health).filter(v => typeof v === 'boolean' && v).length;
    log.info(`Health check complete: ${healthyEndpoints}/2 endpoints healthy`);

    return health;
  }
}
