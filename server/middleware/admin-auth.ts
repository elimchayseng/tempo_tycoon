import { createMiddleware } from "hono/factory";
import { config } from "../config.js";

export const requireAdmin = createMiddleware(async (c, next) => {
  const token = config.auth.adminToken;

  // If no token configured (dev), pass through
  if (!token) {
    await next();
    return;
  }

  const authHeader = c.req.header("Authorization");
  if (!authHeader) {
    return c.json({ error: "Authorization header required", code: "UNAUTHORIZED" }, 401);
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return c.json({ error: "Invalid authorization format, expected: Bearer <token>", code: "UNAUTHORIZED" }, 401);
  }

  if (match[1] !== token) {
    return c.json({ error: "Invalid admin token", code: "FORBIDDEN" }, 403);
  }

  await next();
});
