import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// Mock config before importing middleware
vi.mock('../server/config.js', () => ({
  config: {
    auth: { adminToken: '' },
  },
}));

import { config } from '../server/config.js';
import { requireAdmin } from '../server/middleware/admin-auth.js';

// Helper: build a tiny Hono app with one protected route
function buildApp() {
  const app = new Hono();
  app.post('/protected', requireAdmin, (c) => c.json({ ok: true }));
  app.get('/public', (c) => c.json({ ok: true }));
  return app;
}

function post(app: Hono, path: string, headers: Record<string, string> = {}) {
  return app.request(path, { method: 'POST', headers });
}

describe('requireAdmin middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('when ADMIN_TOKEN is not set (dev mode)', () => {
    beforeEach(() => {
      (config as any).auth.adminToken = '';
    });

    it('passes through without any auth header', async () => {
      const app = buildApp();
      const res = await post(app, '/protected');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    });
  });

  describe('when ADMIN_TOKEN is configured', () => {
    const TEST_TOKEN = 'test-secret-token-abc123';

    beforeEach(() => {
      (config as any).auth.adminToken = TEST_TOKEN;
    });

    it('returns 401 when no Authorization header is sent', async () => {
      const app = buildApp();
      const res = await post(app, '/protected');
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 for malformed Authorization header (no Bearer prefix)', async () => {
      const app = buildApp();
      const res = await post(app, '/protected', {
        Authorization: 'Basic abc123',
      });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.code).toBe('UNAUTHORIZED');
    });

    it('returns 403 for wrong token', async () => {
      const app = buildApp();
      const res = await post(app, '/protected', {
        Authorization: 'Bearer wrong-token',
      });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.code).toBe('FORBIDDEN');
    });

    it('passes through with correct Bearer token', async () => {
      const app = buildApp();
      const res = await post(app, '/protected', {
        Authorization: `Bearer ${TEST_TOKEN}`,
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    });

    it('is case-insensitive for Bearer prefix', async () => {
      const app = buildApp();
      const res = await post(app, '/protected', {
        Authorization: `bearer ${TEST_TOKEN}`,
      });
      expect(res.status).toBe(200);
    });

    it('does not affect unprotected routes', async () => {
      const app = buildApp();
      const res = await app.request('/public', { method: 'GET' });
      expect(res.status).toBe(200);
    });

    it('accepts token even with extra whitespace after Bearer', async () => {
      const app = buildApp();
      const res = await post(app, '/protected', {
        Authorization: `Bearer  ${TEST_TOKEN}`,
      });
      // \s+ in regex is greedy, so extra whitespace is consumed — token still matches
      expect(res.status).toBe(200);
    });

    it('rejects empty Bearer value', async () => {
      const app = buildApp();
      const res = await post(app, '/protected', {
        Authorization: 'Bearer ',
      });
      expect(res.status).toBe(401);
    });
  });
});
