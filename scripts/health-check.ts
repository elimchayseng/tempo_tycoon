#!/usr/bin/env tsx

import 'dotenv/config';
import { publicClient } from "../server/tempo-client.js";

interface HealthCheck {
  name: string;
  status: "healthy" | "warning" | "error";
  message: string;
  details?: any;
}

const BASE_URL = `http://localhost:${process.env.PORT || 4000}`;

async function checkBlockchain(): Promise<HealthCheck> {
  try {
    const chainId = await publicClient.getChainId();
    const blockNumber = await publicClient.getBlockNumber();

    if (chainId !== 42431) {
      return {
        name: "Tempo Blockchain",
        status: "error",
        message: `Wrong chain ID: ${chainId} (expected 42431)`,
      };
    }

    return {
      name: "Tempo Blockchain",
      status: "healthy",
      message: `Connected (Chain ID: ${chainId}, Block: ${blockNumber})`,
    };
  } catch (error) {
    return {
      name: "Tempo Blockchain",
      status: "error",
      message: `Connection failed: ${error}`,
    };
  }
}

async function checkServerHealth(): Promise<HealthCheck> {
  try {
    const response = await fetch(`${BASE_URL}/api/health`);

    if (response.ok) {
      const data = await response.json();
      return {
        name: "Server Health",
        status: "healthy",
        message: "Server responding",
        details: data,
      };
    } else {
      return {
        name: "Server Health",
        status: "error",
        message: `Server returned ${response.status}`,
      };
    }
  } catch {
    return {
      name: "Server Health",
      status: "warning",
      message: "Server not responding (not required for blockchain-only checks)",
    };
  }
}

async function checkPreflight(): Promise<HealthCheck> {
  try {
    const response = await fetch(`${BASE_URL}/api/zoo/preflight`, { method: 'POST' });

    if (!response.ok) {
      return {
        name: "Preflight Endpoint",
        status: "error",
        message: `Preflight returned ${response.status}`,
      };
    }

    const data = await response.json();
    const checks = data.checks ?? [];
    const passed = checks.filter((c: any) => c.status === 'pass').length;
    const total = checks.length;

    return {
      name: "Preflight Endpoint",
      status: passed === total ? "healthy" : "warning",
      message: `${passed}/${total} checks passed`,
      details: checks.map((c: any) => `${c.status === 'pass' ? '  +' : '  -'} ${c.name}`).join('\n'),
    };
  } catch {
    return {
      name: "Preflight Endpoint",
      status: "warning",
      message: "Server not reachable (skipped)",
    };
  }
}

async function checkZooRegistry(): Promise<HealthCheck> {
  try {
    const response = await fetch(`${BASE_URL}/api/zoo/registry`);

    if (!response.ok) {
      return {
        name: "Zoo Registry",
        status: "error",
        message: `Registry returned ${response.status}`,
      };
    }

    const data = await response.json();
    const merchantCount = data.merchants?.length ?? 0;

    return {
      name: "Zoo Registry",
      status: merchantCount > 0 ? "healthy" : "warning",
      message: `${merchantCount} merchant(s) registered`,
    };
  } catch {
    return {
      name: "Zoo Registry",
      status: "warning",
      message: "Server not reachable (skipped)",
    };
  }
}

async function checkMerchantCatalog(): Promise<HealthCheck> {
  try {
    const response = await fetch(`${BASE_URL}/api/merchant/food/catalog`);

    if (!response.ok) {
      return {
        name: "Merchant Catalog",
        status: "error",
        message: `Catalog returned ${response.status}`,
      };
    }

    const data = await response.json();
    const productCount = data.products?.length ?? 0;

    return {
      name: "Merchant Catalog",
      status: productCount > 0 ? "healthy" : "warning",
      message: `${productCount} product(s) available`,
    };
  } catch {
    return {
      name: "Merchant Catalog",
      status: "warning",
      message: "Server not reachable (skipped)",
    };
  }
}

async function checkWebSocket(): Promise<HealthCheck> {
  try {
    const ws = await new Promise<any>((resolve, reject) => {
      const WebSocket = (globalThis as any).WebSocket ?? require('ws');
      const socket = new WebSocket(`ws://localhost:${process.env.PORT || 4000}/ws`);
      const timeout = setTimeout(() => { socket.close(); reject(new Error('timeout')); }, 5000);

      socket.onmessage = (event: any) => {
        clearTimeout(timeout);
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        socket.close();
        resolve(data);
      };
      socket.onerror = (err: any) => { clearTimeout(timeout); reject(err); };
    });

    if (ws.type === 'connection') {
      return {
        name: "WebSocket",
        status: "healthy",
        message: `Connected (clients: ${ws.clientCount}/${ws.maxClients})`,
      };
    }

    return {
      name: "WebSocket",
      status: "warning",
      message: `Connected but unexpected message type: ${ws.type}`,
    };
  } catch {
    return {
      name: "WebSocket",
      status: "warning",
      message: "WebSocket not reachable (server may not be running)",
    };
  }
}

async function main() {
  console.log("Zoo Tycoon Health Check");
  console.log("=======================\n");

  const checks: HealthCheck[] = [];

  // Blockchain connectivity (always works, no server needed)
  checks.push(await checkBlockchain());

  // Server-dependent checks
  checks.push(await checkServerHealth());
  checks.push(await checkPreflight());
  checks.push(await checkZooRegistry());
  checks.push(await checkMerchantCatalog());
  checks.push(await checkWebSocket());

  // Print results
  for (const check of checks) {
    const icon = check.status === "healthy" ? "\u2713" :
                 check.status === "warning" ? "\u26A0" : "\u2717";
    console.log(`${icon} ${check.name}: ${check.message}`);
    if (check.details && typeof check.details === 'string') {
      console.log(check.details);
    }
  }

  // Overall status
  const hasErrors = checks.some(c => c.status === "error");
  const hasWarnings = checks.some(c => c.status === "warning");

  console.log();
  if (hasErrors) {
    console.log("System Status: ERROR");
    console.log("Ready for simulation: NO");
    process.exit(1);
  } else if (hasWarnings) {
    console.log("System Status: WARNING");
    console.log("Ready for simulation: CAUTION");
  } else {
    console.log("System Status: HEALTHY");
    console.log("Ready for simulation: YES");
  }
}

main().catch(console.error);
