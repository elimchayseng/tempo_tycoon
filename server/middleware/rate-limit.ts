import { createMiddleware } from "hono/factory";
import { getClientIp } from "./client-ip.js";

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

  // Stale entries are swept lazily (at most once per 60s) on incoming
  // requests rather than via setInterval, which Workers forbid at module load.
  let lastSweep = 0;
  function sweep(now: number) {
    if (now - lastSweep < 60_000) return;
    lastSweep = now;
    for (const [key, record] of store) {
      record.timestamps = record.timestamps.filter((t) => now - t < windowMs);
      if (record.timestamps.length === 0) {
        store.delete(key);
      }
    }
  }

  return createMiddleware(async (c, next) => {
    // Skip rate limiting in local development (NODE_ENV unset or "development").
    // The Cloudflare deployment sets NODE_ENV=production in wrangler.jsonc.
    const isDev = !process.env.NODE_ENV || process.env.NODE_ENV === "development";
    if (isDev) {
      await next();
      return;
    }

    const ip = getClientIp(c);

    const now = Date.now();
    sweep(now);
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
