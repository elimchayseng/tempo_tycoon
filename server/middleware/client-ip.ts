import type { Context } from "hono";

/**
 * Best-effort client IP. Cloudflare sets cf-connecting-ip; other reverse
 * proxies (and local tooling) set x-forwarded-for.
 */
export function getClientIp(c: Context): string {
  return (
    c.req.header("cf-connecting-ip") ||
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "unknown"
  );
}
