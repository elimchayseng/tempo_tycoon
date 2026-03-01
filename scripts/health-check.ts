#!/usr/bin/env tsx

import 'dotenv/config';
import { publicClient, ALPHA_USD } from "../eth_tempo_experiments/server/tempo-client.js";
import { privateKeyToAccount } from "viem/accounts";
import { formatUsdAmount } from "../eth_tempo_experiments/server/tempo-client.js";

interface HealthCheck {
  name: string;
  status: "healthy" | "warning" | "error";
  message: string;
  details?: any;
}

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

async function checkWalletBalance(privateKey: string, name: string): Promise<HealthCheck> {
  try {
    const account = privateKeyToAccount(privateKey as `0x${string}`);

    const balance = await publicClient.readContract({
      address: ALPHA_USD,
      abi: [
        {
          name: "balanceOf",
          type: "function",
          stateMutability: "view",
          inputs: [{ name: "account", type: "address" }],
          outputs: [{ name: "", type: "uint256" }],
        },
      ],
      functionName: "balanceOf",
      args: [account.address],
    }) as bigint;

    const balanceUsd = formatUsdAmount(balance);
    const balanceNum = parseFloat(balanceUsd);

    let status: "healthy" | "warning" | "error" = "healthy";
    if (balanceNum < 1) {
      status = "error";
    } else if (balanceNum < 10) {
      status = "warning";
    }

    return {
      name: `${name} Wallet`,
      status,
      message: `${balanceUsd} AlphaUSD`,
      details: { address: account.address, balance: balanceUsd },
    };
  } catch (error) {
    return {
      name: `${name} Wallet`,
      status: "error",
      message: `Balance check failed: ${error}`,
    };
  }
}

async function checkServerHealth(): Promise<HealthCheck> {
  try {
    const port = process.env.PORT || 4000;
    const response = await fetch(`http://localhost:${port}/api/health`);

    if (response.ok) {
      return {
        name: "Server Health",
        status: "healthy",
        message: "All endpoints responding",
      };
    } else {
      return {
        name: "Server Health",
        status: "error",
        message: `Server returned ${response.status}`,
      };
    }
  } catch (error) {
    return {
      name: "Server Health",
      status: "error",
      message: "Server not responding",
    };
  }
}

function checkEnvironment(): HealthCheck {
  const requiredVars = [
    "ZOO_MASTER_PRIVATE_KEY",
    "MERCHANT_A_PRIVATE_KEY",
    "ATTENDEE_1_PRIVATE_KEY",
    "ATTENDEE_2_PRIVATE_KEY",
    "ATTENDEE_3_PRIVATE_KEY",
    "RPC_URL",
  ];

  const missing = requiredVars.filter(v => !process.env[v]);

  if (missing.length > 0) {
    return {
      name: "Environment",
      status: "error",
      message: `Missing variables: ${missing.join(", ")}`,
    };
  }

  return {
    name: "Environment",
    status: "healthy",
    message: "All required variables set",
  };
}

async function main() {
  console.log("Zoo Tycoon Health Check");
  console.log("=======================\n");

  const checks: HealthCheck[] = [];

  // Environment check
  checks.push(checkEnvironment());

  // Blockchain connectivity
  checks.push(await checkBlockchain());

  // Wallet balances (if environment is OK)
  if (checks[0].status !== "error") {
    checks.push(await checkWalletBalance(process.env.ZOO_MASTER_PRIVATE_KEY!, "Zoo Master"));
    checks.push(await checkWalletBalance(process.env.MERCHANT_A_PRIVATE_KEY!, "Merchant A"));
    checks.push(await checkWalletBalance(process.env.ATTENDEE_1_PRIVATE_KEY!, "Attendee 1"));
    checks.push(await checkWalletBalance(process.env.ATTENDEE_2_PRIVATE_KEY!, "Attendee 2"));
    checks.push(await checkWalletBalance(process.env.ATTENDEE_3_PRIVATE_KEY!, "Attendee 3"));
  }

  // Server health
  checks.push(await checkServerHealth());

  // Print results
  for (const check of checks) {
    const icon = check.status === "healthy" ? "✓" :
                 check.status === "warning" ? "⚠" : "✗";
    console.log(`${icon} ${check.name}: ${check.message}`);
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
