import { Hono } from "hono";
import { createLogger } from "../../shared/logger.js";
import { config } from "../config.js";
import { getZooAccountByRole } from "../zoo-accounts.js";
import { SessionVerifier } from "../middleware/session-verifier.js";
import { loadZooRegistry } from "./zoo-shared.js";

const log = createLogger('zoo-merchant');

const SESSION_CLEANUP_INTERVAL_MS = 30_000;
const SESSION_EXPIRY_FORMAT = 'minutes'; // config.zoo.sessionTimeoutMinutes

export const zooMerchantRoutes = new Hono();

// In-memory session storage for MVP
interface CheckoutSession {
  session_id: string;
  buyer_address: string;
  merchant_address: string;
  sku: string;
  quantity: number;
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

    const catalog = {
      merchant_id: merchant.id,
      merchant_name: merchant.name,
      category: merchant.category,
      description: merchant.description,
      products: merchant.menu.map((item: { sku: string; name: string; description?: string; price: string; category: string; available: boolean }) => ({
        sku: item.sku,
        name: item.name,
        description: item.description,
        price: item.price,
        currency: "AlphaUSD",
        category: item.category,
        available: item.available
      })),
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
zooMerchantRoutes.post("/food/checkout/create", async (c) => {
  try {
    if (!config.zoo.enabled) {
      return c.json({ error: "Zoo simulation is disabled", code: "ZOO_DISABLED" }, 404);
    }

    const body = await c.req.json();
    const { sku, quantity = 1, buyer_address } = body;

    if (!sku || !buyer_address) {
      return c.json({
        error: "Missing required fields",
        code: "VALIDATION_ERROR",
        details: "sku and buyer_address are required"
      }, 400);
    }

    if (typeof quantity !== 'number' || quantity <= 0) {
      return c.json({
        error: "Invalid quantity",
        code: "VALIDATION_ERROR",
        details: "quantity must be a positive number"
      }, 400);
    }

    const registry = loadZooRegistry();
    const merchant = registry.merchants?.find((m: { category: string }) => m.category === 'food');

    if (!merchant) {
      return c.json({ error: "Food merchant not found", code: "MERCHANT_NOT_FOUND" }, 404);
    }

    const product = merchant.menu.find((item: { sku: string }) => item.sku === sku);
    if (!product) {
      return c.json({ error: "Product not found", code: "PRODUCT_NOT_FOUND" }, 404);
    }

    if (!product.available) {
      return c.json({ error: "Product not available", code: "PRODUCT_UNAVAILABLE" }, 400);
    }

    const unitPrice = parseFloat(product.price);
    const totalAmount = (unitPrice * quantity).toFixed(2);

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
      sku,
      quantity,
      amount: totalAmount,
      currency: "AlphaUSD",
      created_at: now,
      expires_at: expiresAt,
      status: 'pending'
    };

    activeSessions.set(sessionId, session);

    const response = {
      session_id: sessionId,
      amount: totalAmount,
      currency: "AlphaUSD",
      recipient_address: merchantAccount.address,
      expires_at: expiresAt.toISOString(),
      memo: `Zoo Purchase: ${product.name}`,
      product: {
        sku: product.sku,
        name: product.name,
        price: product.price,
        quantity
      }
    };

    log.info(`Created checkout session ${sessionId} for ${sku} (${totalAmount} AlphaUSD)`);

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

    const purchaseId = `purchase_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    log.info(`Payment verified and purchase completed: ${purchaseId}`);
    log.debug(`Transaction: ${verificationResult.transaction?.hash} (block #${verificationResult.transaction?.blockNumber})`);

    const response = {
      success: true,
      verified: true,
      purchase_id: purchaseId,
      session_id: session_id,
      product: {
        sku: session.sku,
        quantity: session.quantity
      },
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
