import { createMiddleware } from "hono/factory";

interface RequestRecord {
  timestamps: number[];
}

/**
 * In-memory sliding-window rate limiter.
 * Returns Hono middleware that limits requests per IP.
 * Skipped entirely when NODE_ENV=development.
 */
export function createRateLimit(maxRequests: number, windowMs: number) {
  const store = new Map<string, RequestRecord>();

  // Periodic cleanup of stale entries every 60s
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of store) {
      record.timestamps = record.timestamps.filter((t) => now - t < windowMs);
      if (record.timestamps.length === 0) {
        store.delete(key);
      }
    }
  }, 60_000);

  // Allow cleanup timer to not keep the process alive
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }

  return createMiddleware(async (c, next) => {
    // Skip rate limiting in development (no Railway env = local dev)
    const isDev = process.env.NODE_ENV === "development" ||
                  (!process.env.NODE_ENV && !process.env.RAILWAY_ENVIRONMENT_NAME);
    if (isDev) {
      await next();
      return;
    }

    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
      c.req.header("x-real-ip") ||
      "unknown";

    const now = Date.now();
    let record = store.get(ip);

    if (!record) {
      record = { timestamps: [] };
      store.set(ip, record);
    }

    // Slide the window — keep only timestamps within the window
    record.timestamps = record.timestamps.filter((t) => now - t < windowMs);

    if (record.timestamps.length >= maxRequests) {
      const oldestInWindow = record.timestamps[0];
      const retryAfter = Math.ceil((oldestInWindow + windowMs - now) / 1000);

      return c.json(
        { error: "Too many requests", code: "RATE_LIMITED" },
        429,
        { "Retry-After": String(retryAfter) }
      );
    }

    record.timestamps.push(now);
    await next();
  });
}
