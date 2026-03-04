import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Hono } from "hono";
import { createRateLimit } from "../server/middleware/rate-limit.js";

function buildApp(maxRequests: number, windowMs: number) {
  const app = new Hono();
  const limiter = createRateLimit(maxRequests, windowMs);
  app.post("/test", limiter, (c) => c.json({ ok: true }));
  return app;
}

describe("rate-limit middleware", () => {
  const originalEnv = process.env.NODE_ENV;
  const originalRailway = process.env.RAILWAY_ENVIRONMENT_NAME;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    if (originalRailway === undefined) {
      delete process.env.RAILWAY_ENVIRONMENT_NAME;
    } else {
      process.env.RAILWAY_ENVIRONMENT_NAME = originalRailway;
    }
  });

  it("allows requests within the limit", async () => {
    process.env.NODE_ENV = "production";
    const app = buildApp(3, 60_000);

    for (let i = 0; i < 3; i++) {
      const res = await app.request("/test", {
        method: "POST",
        headers: { "x-forwarded-for": "1.2.3.4" },
      });
      expect(res.status).toBe(200);
    }
  });

  it("returns 429 when limit is exceeded", async () => {
    process.env.NODE_ENV = "production";
    const app = buildApp(2, 60_000);

    // Use up the limit
    for (let i = 0; i < 2; i++) {
      await app.request("/test", {
        method: "POST",
        headers: { "x-forwarded-for": "5.6.7.8" },
      });
    }

    const res = await app.request("/test", {
      method: "POST",
      headers: { "x-forwarded-for": "5.6.7.8" },
    });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.code).toBe("RATE_LIMITED");
  });

  it("includes Retry-After header on 429 responses", async () => {
    process.env.NODE_ENV = "production";
    const app = buildApp(1, 60_000);

    await app.request("/test", {
      method: "POST",
      headers: { "x-forwarded-for": "9.9.9.9" },
    });

    const res = await app.request("/test", {
      method: "POST",
      headers: { "x-forwarded-for": "9.9.9.9" },
    });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("resets after the window expires", async () => {
    process.env.NODE_ENV = "production";
    vi.useFakeTimers();

    const app = buildApp(1, 5_000);

    const res1 = await app.request("/test", {
      method: "POST",
      headers: { "x-forwarded-for": "10.0.0.1" },
    });
    expect(res1.status).toBe(200);

    const res2 = await app.request("/test", {
      method: "POST",
      headers: { "x-forwarded-for": "10.0.0.1" },
    });
    expect(res2.status).toBe(429);

    // Advance past the window
    vi.advanceTimersByTime(6_000);

    const res3 = await app.request("/test", {
      method: "POST",
      headers: { "x-forwarded-for": "10.0.0.1" },
    });
    expect(res3.status).toBe(200);

    vi.useRealTimers();
  });

  it("skips rate limiting in development mode", async () => {
    process.env.NODE_ENV = "development";
    const app = buildApp(1, 60_000);

    // Should allow unlimited requests in dev
    for (let i = 0; i < 10; i++) {
      const res = await app.request("/test", {
        method: "POST",
        headers: { "x-forwarded-for": "11.11.11.11" },
      });
      expect(res.status).toBe(200);
    }
  });

  it("enforces rate limiting on Railway (RAILWAY_ENVIRONMENT_NAME set, no NODE_ENV)", async () => {
    delete process.env.NODE_ENV;
    process.env.RAILWAY_ENVIRONMENT_NAME = "production";
    const app = buildApp(2, 60_000);

    for (let i = 0; i < 2; i++) {
      const res = await app.request("/test", {
        method: "POST",
        headers: { "x-forwarded-for": "12.12.12.12" },
      });
      expect(res.status).toBe(200);
    }

    const res = await app.request("/test", {
      method: "POST",
      headers: { "x-forwarded-for": "12.12.12.12" },
    });
    expect(res.status).toBe(429);
  });

  it("skips rate limiting when no NODE_ENV and no RAILWAY_ENVIRONMENT_NAME", async () => {
    delete process.env.NODE_ENV;
    delete process.env.RAILWAY_ENVIRONMENT_NAME;
    const app = buildApp(1, 60_000);

    for (let i = 0; i < 5; i++) {
      const res = await app.request("/test", {
        method: "POST",
        headers: { "x-forwarded-for": "13.13.13.13" },
      });
      expect(res.status).toBe(200);
    }
  });
});
