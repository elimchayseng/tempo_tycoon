import type {
  ZooRegistry,
  MerchantCatalog,
  CheckoutSession,
  CheckoutResult,
  MerchantProduct
} from './types.js';

export class ACPClient {
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;

  constructor(baseUrl: string = 'http://localhost:4002', maxRetries: number = 3, retryDelayMs: number = 1000) {
    this.baseUrl = baseUrl;
    this.maxRetries = maxRetries;
    this.retryDelayMs = retryDelayMs;

    console.log(`[ACPClient] 🌐 ACP Client initialized: ${this.baseUrl}`);
  }

  /**
   * Fetch the zoo registry to discover available merchants
   */
  async fetchZooRegistry(): Promise<ZooRegistry> {
    const url = `${this.baseUrl}/api/zoo/registry`;

    console.log(`[ACPClient] 🗺️  Fetching zoo registry from ${url}`);

    try {
      const registry = await this.makeRequest<ZooRegistry>('GET', url);

      console.log(`[ACPClient] ✓ Registry loaded: ${registry.merchants.length} merchants available`);
      console.log(`[ACPClient] 📍 Available merchants:`, registry.merchants.map(m => `${m.name} (${m.category})`));

      return registry;

    } catch (error) {
      console.error(`[ACPClient] ❌ Failed to fetch zoo registry:`, error);
      throw new Error(`Failed to fetch zoo registry: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get merchant catalog for a specific category (e.g., 'food')
   */
  async getMerchantCatalog(category: string): Promise<MerchantCatalog> {
    const url = `${this.baseUrl}/api/merchant/${category}/catalog`;

    console.log(`[ACPClient] 🛒 Fetching ${category} catalog from ${url}`);

    try {
      const catalog = await this.makeRequest<MerchantCatalog>('GET', url);

      const availableProducts = catalog.products.filter(p => p.available);
      console.log(`[ACPClient] ✓ Catalog loaded: ${availableProducts.length}/${catalog.products.length} products available`);
      console.log(`[ACPClient] 🍕 Available products:`, availableProducts.map(p => `${p.name} ($${p.price})`));

      return catalog;

    } catch (error) {
      console.error(`[ACPClient] ❌ Failed to fetch ${category} catalog:`, error);
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

    console.log(`[ACPClient] 🛍️  Creating checkout session for ${sku} (qty: ${quantity})`);
    console.log(`[ACPClient] 📤 Request:`, requestBody);

    try {
      const session = await this.makeRequest<CheckoutSession>('POST', url, requestBody);

      console.log(`[ACPClient] ✓ Checkout session created: ${session.session_id}`);
      console.log(`[ACPClient] 💰 Payment required: $${session.amount} → ${session.recipient_address}`);
      console.log(`[ACPClient] ⏰ Session expires at: ${session.expires_at}`);

      return session;

    } catch (error) {
      console.error(`[ACPClient] ❌ Failed to create checkout session for ${sku}:`, error);
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

    console.log(`[ACPClient] 🔄 Completing checkout session ${sessionId}`);
    console.log(`[ACPClient] 🧾 Transaction hash: ${txHash}`);

    try {
      const result = await this.makeRequest<CheckoutResult>('POST', url, requestBody);

      if (result.success && result.verified) {
        console.log(`[ACPClient] ✅ Checkout completed successfully!`);
        console.log(`[ACPClient] 📦 Purchase ID: ${result.purchase_id}`);
        console.log(`[ACPClient] 💳 Payment verified: $${result.payment?.amount} (block #${result.payment?.block_number})`);
      } else {
        console.log(`[ACPClient] ❌ Checkout verification failed:`, result.error || 'Unknown error');
      }

      return result;

    } catch (error) {
      console.error(`[ACPClient] ❌ Failed to complete checkout:`, error);

      // Return a failed result instead of throwing, so agents can handle gracefully
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

    // Filter by category if specified
    if (category) {
      availableProducts = availableProducts.filter(p => p.category === category);
    }

    if (availableProducts.length === 0) {
      console.log(`[ACPClient] ⚠️  No available products found${category ? ` in category '${category}'` : ''}`);
      return null;
    }

    // Select random product
    const randomIndex = Math.floor(Math.random() * availableProducts.length);
    const selectedProduct = availableProducts[randomIndex];

    console.log(`[ACPClient] 🎲 Selected random product: ${selectedProduct.name} ($${selectedProduct.price})`);
    return selectedProduct;
  }

  /**
   * Full ACP purchase flow: discover, catalog, create session
   * Returns checkout session ready for payment
   */
  async initiatePurchase(
    agentAddress: string,
    preferredCategory?: string
  ): Promise<{ session: CheckoutSession; product: MerchantProduct; merchantCategory: string } | null> {
    try {
      console.log(`[ACPClient] 🚀 Initiating ACP purchase flow for ${agentAddress}`);

      // Step 1: Discover merchants via registry
      const registry = await this.fetchZooRegistry();

      // For now, only support food merchants
      const foodMerchants = registry.merchants.filter(m => m.category === 'food');
      if (foodMerchants.length === 0) {
        console.log(`[ACPClient] ❌ No food merchants found in registry`);
        return null;
      }

      // Step 2: Get merchant catalog
      const catalog = await this.getMerchantCatalog('food');

      // Step 3: Select product
      const product = this.findRandomProduct(catalog, preferredCategory);
      if (!product) {
        console.log(`[ACPClient] ❌ No available products found for purchase`);
        return null;
      }

      // Step 4: Create checkout session
      const session = await this.createCheckoutSession('food', product.sku, 1, agentAddress);

      console.log(`[ACPClient] 🎯 Purchase flow initiated successfully`);
      console.log(`[ACPClient] 📋 Summary: ${product.name} ($${product.price}) → Session ${session.session_id}`);

      return {
        session,
        product,
        merchantCategory: 'food'
      };

    } catch (error) {
      console.error(`[ACPClient] ❌ Purchase initiation failed:`, error);
      return null;
    }
  }

  /**
   * Generic HTTP request method with retry logic
   */
  private async makeRequest<T>(
    method: 'GET' | 'POST',
    url: string,
    body?: any
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`[ACPClient] 📡 ${method} ${url}${attempt > 1 ? ` (attempt ${attempt}/${this.maxRetries})` : ''}`);

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

        console.log(`[ACPClient] ✓ Request successful (${response.status})`);
        return data as T;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`[ACPClient] ⚠️  Attempt ${attempt}/${this.maxRetries} failed:`, lastError.message);

        if (attempt < this.maxRetries) {
          const delayMs = this.retryDelayMs * Math.pow(2, attempt - 1); // Exponential backoff
          console.log(`[ACPClient] ⏳ Retrying in ${delayMs}ms...`);
          await this.delay(delayMs);
        }
      }
    }

    throw lastError || new Error('Request failed after all retries');
  }

  /**
   * Utility method for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Health check for the ACP endpoints
   */
  async healthCheck(): Promise<{ registry: boolean; catalog: boolean; merchant_server: string }> {
    console.log(`[ACPClient] 🏥 Running ACP health check...`);

    const health = {
      registry: false,
      catalog: false,
      merchant_server: this.baseUrl
    };

    try {
      // Check registry endpoint
      await this.makeRequest('GET', `${this.baseUrl}/api/zoo/registry`);
      health.registry = true;
      console.log(`[ACPClient] ✓ Registry endpoint healthy`);
    } catch (error) {
      console.log(`[ACPClient] ❌ Registry endpoint failed:`, error instanceof Error ? error.message : String(error));
    }

    try {
      // Check catalog endpoint
      await this.makeRequest('GET', `${this.baseUrl}/api/merchant/food/catalog`);
      health.catalog = true;
      console.log(`[ACPClient] ✓ Catalog endpoint healthy`);
    } catch (error) {
      console.log(`[ACPClient] ❌ Catalog endpoint failed:`, error instanceof Error ? error.message : String(error));
    }

    const healthyEndpoints = Object.values(health).filter(v => typeof v === 'boolean' && v).length;
    console.log(`[ACPClient] 📊 Health check complete: ${healthyEndpoints}/2 endpoints healthy`);

    return health;
  }
}