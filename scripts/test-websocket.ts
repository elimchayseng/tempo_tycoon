#!/usr/bin/env tsx
/**
 * WebSocket connectivity test — requires a running server (`npm run dev:server`).
 *
 * Connects to ws://localhost:4000/ws, verifies the connection acknowledgment
 * message, then disconnects cleanly.
 *
 * Usage: tsx scripts/test-websocket.ts
 * Exit 0 on success, 1 on failure.
 */

const WS_URL = `ws://localhost:${process.env.PORT || 4000}/ws`;
const TIMEOUT_MS = 5000;

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, name: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(name);
    console.error(`  FAIL: ${name}`);
  }
}

async function run() {
  console.log('=== WebSocket Connectivity Test ===');
  console.log(`Target: ${WS_URL}\n`);

  const WebSocket = (globalThis as any).WebSocket ?? (await import('ws')).default;

  const result = await new Promise<{ connected: boolean; message: any; error?: string }>((resolve) => {
    let resolved = false;
    const done = (r: any) => { if (!resolved) { resolved = true; resolve(r); } };

    const timeout = setTimeout(() => {
      done({ connected: false, message: null, error: 'Connection timed out' });
    }, TIMEOUT_MS);

    try {
      const socket = new WebSocket(WS_URL);

      socket.onopen = () => {
        console.log('[WS] Connected');
      };

      socket.onmessage = (event: any) => {
        clearTimeout(timeout);
        try {
          const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
          console.log('[WS] Received:', JSON.stringify(data));
          socket.close();
          done({ connected: true, message: data });
        } catch (e) {
          socket.close();
          done({ connected: true, message: null, error: `Failed to parse message: ${e}` });
        }
      };

      socket.onerror = (err: any) => {
        clearTimeout(timeout);
        done({ connected: false, message: null, error: `Connection error: ${err.message ?? err}` });
      };

      socket.onclose = () => {
        console.log('[WS] Disconnected');
      };
    } catch (err: any) {
      clearTimeout(timeout);
      done({ connected: false, message: null, error: `Failed to connect: ${err.message}` });
    }
  });

  if (!result.connected) {
    console.error(`\n[FAIL] Could not connect to WebSocket: ${result.error}`);
    console.error('Make sure the server is running: npm run dev:server');
    process.exit(1);
  }

  // Verify connection message
  assert(result.message !== null, 'received a message on connect');
  assert(result.message?.type === 'connection', `message type is "connection" (got "${result.message?.type}")`);
  assert(typeof result.message?.clientCount === 'number', 'message has clientCount (number)');
  assert(typeof result.message?.maxClients === 'number', 'message has maxClients (number)');

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);

  if (failed > 0) {
    console.error('\nFailed tests:');
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log('\n[PASS] WebSocket connectivity test passed!');
  process.exit(0);
}

run().catch((err) => {
  console.error('\n[FAIL] Unexpected error:', err);
  process.exit(1);
});
