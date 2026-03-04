# Security

This document describes the security posture of the Tempo Zoo API server. The simulation runs on a public testnet with no real funds, but we still treat API hardening seriously — both as good practice and because LLM inference calls have real cost.

## Threat Model

| Concern | Mitigation |
|---------|------------|
| Unauthorized simulation control | Bearer-token admin auth on all mutating endpoints |
| LLM spend abuse (inference costs) | Per-IP rate limiting on endpoints that trigger LLM calls |
| Cross-origin abuse | CORS restricted to allowed origins in production |
| Token extraction from JS bundle | Rate limiting as defense-in-depth (see below) |

### Note on the Admin Token

The `ADMIN_TOKEN` is delivered to the frontend via the Vite build (`VITE_ADMIN_TOKEN`), which means it is visible in the JS bundle to anyone with devtools. This is acceptable for a testnet demo — the token prevents casual misuse, not determined attackers. Rate limiting is the real backstop against cost abuse.

## Authentication

All state-mutating endpoints require a `Bearer` token in the `Authorization` header:

```
Authorization: Bearer <ADMIN_TOKEN>
```

- **Middleware:** `server/middleware/admin-auth.ts`
- **Behavior in development:** If `ADMIN_TOKEN` is not set, auth is bypassed (pass-through) so local development is frictionless.
- **Behavior in production:** `ADMIN_TOKEN` must be set or the server refuses to start.

### Protected Endpoints

| Method | Endpoint | Why |
|--------|----------|-----|
| POST | `/api/zoo/preflight` | Initializes wallets, makes LLM test call |
| POST | `/api/zoo/agents/start` | Starts simulation (continuous LLM + blockchain spend) |
| POST | `/api/zoo/agents/stop` | Stops simulation |
| POST | `/api/zoo/agents/:id/purchase` | Triggers on-chain transaction |

Read-only endpoints (`GET /status`, `GET /registry`, `GET /health`, etc.) are unauthenticated — they expose no sensitive data and have no side effects.

## Rate Limiting

Per-IP sliding-window rate limiting protects endpoints that incur real cost (LLM inference, blockchain transactions).

- **Middleware:** `server/middleware/rate-limit.ts`
- **Algorithm:** In-memory sliding window keyed by client IP (`x-forwarded-for` → `x-real-ip` → `"unknown"`)
- **No external dependencies:** No Redis or database required — fits the project's in-memory-only architecture.
- **Stale entry cleanup:** Runs every 60 seconds to prevent memory growth.

### Limits

| Endpoint | Limit | Window | Rationale |
|----------|-------|--------|-----------|
| `POST /agents/start` | 10 | 1 min | Each start initializes wallets + LLM agents |
| `POST /agents/stop` | 10 | 1 min | Simulation control |
| `POST /agents/:id/purchase` | 30 | 1 min | More generous — agents trigger these during simulation |
| `POST /preflight` | 10 | 1 min | Runs blockchain checks + live LLM test call |

### 429 Response

When rate limited, the server returns:

```json
{
  "error": "Too many requests",
  "code": "RATE_LIMITED"
}
```

With a `Retry-After` header (seconds until the client can retry).

### Development Mode

Rate limiting is **skipped entirely** when `NODE_ENV=development` so it never interferes with local testing or rapid iteration.

## CORS

In production, CORS is restricted to explicitly allowed origins. In development, all origins are permitted for convenience.

## Test Coverage

Security middleware is covered by automated tests:

| Test File | What It Covers |
|-----------|---------------|
| `tests/admin-auth.test.ts` | Token validation, missing header, invalid format, wrong token, dev-mode bypass |
| `tests/rate-limit.test.ts` | Requests within limit, 429 on exceeded limit, Retry-After header, window expiry reset, dev-mode bypass |

Run the security tests:

```bash
npx vitest run tests/admin-auth.test.ts tests/rate-limit.test.ts
```

## Production Checklist

- [ ] `ADMIN_TOKEN` is set to a strong, unique value (not committed to source)
- [ ] `NODE_ENV=production` is set (enables auth enforcement + rate limiting)
- [ ] CORS origins are configured for the production domain
- [ ] Railway's reverse proxy provides `x-forwarded-for` for accurate IP-based rate limiting
