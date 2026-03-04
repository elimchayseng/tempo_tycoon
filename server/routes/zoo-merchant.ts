import { Hono } from "hono";
import { createLogger } from "../../shared/logger.js";
import { config } from "../config.js";
import { getZooAccountByRole } from "../zoo-accounts.js";
import { SessionVerifier } from "../middleware/session-verifier.js";
import { loadZooRegistry, getAgentRunner } from "./zoo-shared.js";
import { isAvailable, decrementStock, getInventorySnapshot, getInventoryItem } from "../../agents/merchant-inventory.js";

const log = createLogger('zoo-merchant');

const SESSION_CLEANUP_INTERVAL_MS = 30_000;

export const zooMerchantRoutes = new Hono();

// In-memory session storage for MVP
interface CheckoutSession {
  session_id: string;
  buyer_address: string;
  merchant_address: string;
  items: Array<{ sku: string; name: string; price: string; quantity: number; satisfaction_value: number }>;
  amount: string;
  currency: string;
  created_at: Date;
  expires_at: Date;
  status: 'pending' | 'completed' | 'expired';
}

const activeSessions = new Map<string, CheckoutSession>();
const sessionVerifier = new SessionVerifier();

// Clean up expired sessions periodically
setInterval(() => {
  const now = new Date();
  for (const [sessionId, session] of activeSessions.entries()) {
    if (now > session.expires_at && session.status === 'pending') {
      session.status = 'expired';
      activeSessions.delete(sessionId);
    }
  }
}, SESSION_CLEANUP_INTERVAL_MS);

// GET /food/catalog - Returns available products with current pricing
zooMerchantRoutes.get("/food/catalog", async (c) => {
  try {
    if (!config.zoo.enabled) {
      return c.json({ error: "Zoo simulation is disabled", code: "ZOO_DISABLED" }, 404);
    }

    const registry = loadZooRegistry();
    const merchant = registry.merchants?.find((m: { category: string }) => m.category === 'food');

    if (!merchant) {
      return c.json({ error: "Food merchant not found", code: "MERCHANT_NOT_FOUND" }, 404);
    }

    // Use live inventory if available, otherwise fall back to static menu
    const liveInventory = getInventorySnapshot();
    const liveStockMap = new Map(liveInventory.map(i => [i.sku, i]));

    const catalog = {
      merchant_id: merchant.id,
      merchant_name: merchant.name,
      category: merchant.category,
      description: merchant.description,
      products: merchant.menu.map((item: { sku: string; name: string; description?: string; price: string; category: string; satisfaction_value?: number; available: boolean }) => {
        const live = liveStockMap.get(item.sku);
        return {
          sku: item.sku,
          name: item.name,
          description: item.description,
          price: live?.price ?? item.price,
          currency: "AlphaUSD",
          category: item.category,
          satisfaction_value: live?.satisfaction_value ?? item.satisfaction_value ?? 40,
          available: live ? live.available : item.available,
          stock: live?.stock,
          max_stock: live?.max_stock,
        };
      }),
      operating_hours: merchant.operating_hours,
      updated_at: new Date().toISOString()
    };

    return c.json(catalog);
  } catch (error) {
    log.error('Catalog endpoint error:', error);
    return c.json({
      error: "Failed to load catalog",
      code: "CATALOG_ERROR",
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// POST /food/checkout/create - Creates a purchase session with payment details
// Accepts either { items: [{sku, quantity}], buyer_address } (cart) or legacy { sku, quantity, buyer_address }
zooMerchantRoutes.post("/food/checkout/create", async (c) => {
  try {
    if (!config.zoo.enabled) {
      return c.json({ error: "Zoo simulation is disabled", code: "ZOO_DISABLED" }, 404);
    }

    const body = await c.req.json();
    const { buyer_address } = body;

    if (!buyer_address) {
      return c.json({
        error: "Missing required fields",
        code: "VALIDATION_ERROR",
        details: "buyer_address is required"
      }, 400);
    }

    // Normalize to items array (support legacy single-item format)
    let requestedItems: Array<{ sku: string; quantity: number }>;
    if (body.items && Array.isArray(body.items)) {
      requestedItems = body.items;
    } else if (body.sku) {
      requestedItems = [{ sku: body.sku, quantity: body.quantity ?? 1 }];
    } else {
      return c.json({
        error: "Missing required fields",
        code: "VALIDATION_ERROR",
        details: "items array or sku is required"
      }, 400);
    }

    if (requestedItems.length === 0 || requestedItems.length > 3) {
      return c.json({
        error: "Invalid cart size",
        code: "VALIDATION_ERROR",
        details: "Cart must contain 1-3 items"
      }, 400);
    }

    const registry = loadZooRegistry();
    const merchant = registry.merchants?.find((m: { category: string }) => m.category === 'food');

    if (!merchant) {
      return c.json({ error: "Food merchant not found", code: "MERCHANT_NOT_FOUND" }, 404);
    }

    // Validate ALL items exist and are available
    const resolvedItems: Array<{ sku: string; name: string; price: string; quantity: number; satisfaction_value: number }> = [];
    let totalAmount = 0;

    for (const reqItem of requestedItems) {
      if (!reqItem.sku || typeof reqItem.quantity !== 'number' || reqItem.quantity <= 0) {
        return c.json({
          error: "Invalid item",
          code: "VALIDATION_ERROR",
          details: `Invalid sku or quantity for item: ${reqItem.sku}`
        }, 400);
      }

      const product = merchant.menu.find((item: { sku: string }) => item.sku === reqItem.sku);
      if (!product) {
        return c.json({ error: `Product not found: ${reqItem.sku}`, code: "PRODUCT_NOT_FOUND" }, 404);
      }

      if (!product.available || !isAvailable(reqItem.sku)) {
        return c.json({ error: `Product not available: ${reqItem.sku}`, code: "PRODUCT_UNAVAILABLE" }, 400);
      }

      // Use live inventory price (may have been adjusted by merchant brain)
      const liveItem = getInventoryItem(reqItem.sku);
      const currentPrice = liveItem?.price ?? product.price;

      const unitPrice = parseFloat(currentPrice);
      totalAmount += unitPrice * reqItem.quantity;

      resolvedItems.push({
        sku: product.sku,
        name: product.name,
        price: currentPrice,
        quantity: reqItem.quantity,
        satisfaction_value: liveItem?.satisfaction_value ?? product.satisfaction_value ?? 40,
      });
    }

    const sessionId = `sess_${crypto.randomUUID()}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + config.zoo.sessionTimeoutMinutes * 60 * 1000);

    const merchantAccount = getZooAccountByRole('merchantA');
    if (!merchantAccount) {
      return c.json({ error: "Merchant account not found", code: "MERCHANT_ACCOUNT_MISSING" }, 500);
    }

    const session: CheckoutSession = {
      session_id: sessionId,
      buyer_address: buyer_address.toLowerCase(),
      merchant_address: merchantAccount.address,
      items: resolvedItems,
      amount: totalAmount.toFixed(2),
      currency: "AlphaUSD",
      created_at: now,
      expires_at: expiresAt,
      status: 'pending'
    };

    activeSessions.set(sessionId, session);

    const itemNames = resolvedItems.map(i => i.name).join(' + ');
    const response = {
      session_id: sessionId,
      amount: totalAmount.toFixed(2),
      currency: "AlphaUSD",
      recipient_address: merchantAccount.address,
      expires_at: expiresAt.toISOString(),
      memo: `Zoo Purchase: ${itemNames}`,
      items: resolvedItems,
    };

    log.info(`Created checkout session ${sessionId} for [${itemNames}] (${totalAmount.toFixed(2)} AlphaUSD)`);

    return c.json(response);
  } catch (error) {
    log.error('Checkout create error:', error);
    return c.json({
      error: "Failed to create checkout session",
      code: "CHECKOUT_CREATE_FAILED",
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// POST /food/checkout/complete - Verifies payment and completes the purchase
zooMerchantRoutes.post("/food/checkout/complete", async (c) => {
  try {
    if (!config.zoo.enabled) {
      return c.json({ error: "Zoo simulation is disabled", code: "ZOO_DISABLED" }, 404);
    }

    const body = await c.req.json();
    const { session_id, tx_hash } = body;

    if (!session_id || !tx_hash) {
      return c.json({
        error: "Missing required fields",
        code: "VALIDATION_ERROR",
        details: "session_id and tx_hash are required"
      }, 400);
    }

    if (!sessionVerifier.isValidTransactionHash(tx_hash)) {
      return c.json({
        error: "Invalid transaction hash",
        code: "VALIDATION_ERROR",
        details: "tx_hash must be a valid Ethereum transaction hash"
      }, 400);
    }

    const session = activeSessions.get(session_id);
    if (!session) {
      return c.json({
        error: "Session not found",
        code: "SESSION_NOT_FOUND",
        details: "Invalid or expired session_id"
      }, 404);
    }

    if (session.status === 'completed') {
      return c.json({
        error: "Session already completed",
        code: "SESSION_ALREADY_COMPLETED",
        details: "This session has already been processed"
      }, 400);
    }

    if (new Date() > session.expires_at) {
      session.status = 'expired';
      activeSessions.delete(session_id);
      return c.json({
        error: "Session expired",
        code: "SESSION_EXPIRED",
        details: "Session has expired, please create a new checkout session"
      }, 400);
    }

    log.info(`Verifying payment for session ${session_id}: ${tx_hash}`);

    const verificationResult = await sessionVerifier.verifyTransaction(
      tx_hash,
      session.buyer_address,
      session.merchant_address,
      session.amount
    );

    if (!verificationResult.verified) {
      log.warn(`Payment verification failed for session ${session_id}: ${verificationResult.error}`);
      return c.json({
        success: false,
        verified: false,
        error: "Payment verification failed",
        code: "VERIFICATION_FAILED",
        details: verificationResult.error
      }, 400);
    }

    session.status = 'completed';
    activeSessions.delete(session_id);

    // Decrement inventory stock for all items in the cart
    for (const item of session.items) {
      for (let q = 0; q < item.quantity; q++) {
        decrementStock(item.sku);
      }
    }

    // Record sale on the merchant agent
    const runner = getAgentRunner();
    const merchantAgent = runner?.getMerchantAgent?.();
    if (merchantAgent) {
      merchantAgent.recordSale(session.items[0].sku, session.amount);
    }

    const purchaseId = `purchase_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    log.info(`Payment verified and purchase completed: ${purchaseId}`);
    log.debug(`Transaction: ${verificationResult.transaction?.hash} (block #${verificationResult.transaction?.blockNumber})`);

    const response = {
      success: true,
      verified: true,
      purchase_id: purchaseId,
      session_id: session_id,
      items: session.items.map(i => ({ sku: i.sku, quantity: i.quantity })),
      payment: {
        amount: session.amount,
        currency: session.currency,
        tx_hash: tx_hash,
        block_number: verificationResult.transaction?.blockNumber?.toString(),
        gas_used: verificationResult.transaction?.gasUsed?.toString()
      },
      completed_at: new Date().toISOString()
    };

    return c.json(response);

  } catch (error) {
    log.error('Checkout complete error:', error);
    return c.json({
      error: "Failed to complete checkout",
      code: "CHECKOUT_COMPLETE_FAILED",
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});
