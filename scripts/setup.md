# Setup Scripts and Utilities

This directory contains utility scripts for setting up and managing the Zoo Tycoon ACP simulation.

## Scripts Overview

### `setup-wallets.ts`
Generates new private keys for all zoo simulation wallets.

**Usage:**
```bash
npm run setup:wallets
```

**What it does:**
- Generates 5 new Ethereum private keys
- Displays wallet addresses for funding
- Provides template for environment variables
- Creates secure random keys using Node.js crypto

**Output:**
```
Zoo Wallet Setup
================

Generated 5 new wallets for Zoo Tycoon simulation:

ZOO_MASTER_PRIVATE_KEY=0x1234567890abcdef...
  Address: 0x742d35Cc6634C0532925a3b8d31B0da4e10a8Aef

MERCHANT_A_PRIVATE_KEY=0xabcdef1234567890...
  Address: 0x8ba1f109551bD432803012645Hac136c30b0C0Da

ATTENDEE_1_PRIVATE_KEY=0x567890abcdef1234...
  Address: 0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE

ATTENDEE_2_PRIVATE_KEY=0xcdef1234567890ab...
  Address: 0x1aE0EA34a72D944a8C7603FfB3eC30a6669E454C

ATTENDEE_3_PRIVATE_KEY=0x234567890abcdef1...
  Address: 0x0a098Eda01Ce92ff4A4CCb7A4fFFb5A43EBC70DC

IMPORTANT:
- Copy these private keys to your .env file or Railway environment variables
- Keep private keys secure and never commit them to git
- Fund these wallets with AlphaUSD on Tempo testnet before starting simulation
```

### `fund-agents.ts`
Distributes AlphaUSD tokens from Zoo Master to all other wallets.

**Prerequisites:**
- Zoo Master wallet must be funded with sufficient AlphaUSD
- All private keys must be set in environment variables

**Usage:**
```bash
npm run fund:agents
```

**What it does:**
- Transfers 100 AlphaUSD from Zoo Master to Merchant A
- Transfers 50 AlphaUSD from Zoo Master to each Attendee
- Verifies all transactions on Tempo blockchain
- Displays final balance for each wallet

**Configuration:**
```typescript
const FUNDING_AMOUNTS = {
  MERCHANT_A: "100.0",    // AlphaUSD for merchant operations
  ATTENDEE_1: "50.0",     // AlphaUSD for purchases
  ATTENDEE_2: "50.0",     // AlphaUSD for purchases
  ATTENDEE_3: "50.0",     // AlphaUSD for purchases
};
```

### `health-check.ts`
Comprehensive system health verification.

**Usage:**
```bash
npm run health:check
```

**What it checks:**
- Tempo blockchain connectivity
- AlphaUSD contract accessibility
- All zoo wallet balances
- Server endpoint availability
- Environment variable validation

**Sample Output:**
```
Zoo Tycoon Health Check
=======================

✓ Tempo Blockchain: Connected (Chain ID: 42431)
✓ AlphaUSD Contract: Accessible
✓ Zoo Master Wallet: 450.50 AlphaUSD
✓ Merchant A Wallet: 100.00 AlphaUSD
✓ Attendee 1 Wallet: 45.30 AlphaUSD
✓ Attendee 2 Wallet: 38.75 AlphaUSD
✓ Attendee 3 Wallet: 41.20 AlphaUSD
✓ Server Health: All endpoints responding
✓ Environment: All required variables set

System Status: HEALTHY
Ready for simulation: YES
```

## Implementation Templates

### setup-wallets.ts
```typescript
#!/usr/bin/env tsx

import { randomBytes } from "crypto";
import { privateKeyToAccount } from "viem/accounts";

interface WalletInfo {
  name: string;
  privateKey: string;
  address: string;
}

function generateWallet(name: string): WalletInfo {
  const privateKey = "0x" + randomBytes(32).toString("hex");
  const account = privateKeyToAccount(privateKey as `0x${string}`);

  return {
    name,
    privateKey,
    address: account.address,
  };
}

function main() {
  console.log("Zoo Wallet Setup");
  console.log("================\n");

  const wallets = [
    generateWallet("ZOO_MASTER"),
    generateWallet("MERCHANT_A"),
    generateWallet("ATTENDEE_1"),
    generateWallet("ATTENDEE_2"),
    generateWallet("ATTENDEE_3"),
  ];

  console.log("Generated 5 new wallets for Zoo Tycoon simulation:\n");

  for (const wallet of wallets) {
    console.log(`${wallet.name}_PRIVATE_KEY=${wallet.privateKey}`);
    console.log(`  Address: ${wallet.address}\n`);
  }

  console.log("IMPORTANT:");
  console.log("- Copy these private keys to your .env file or Railway environment variables");
  console.log("- Keep private keys secure and never commit them to git");
  console.log("- Fund these wallets with AlphaUSD on Tempo testnet before starting simulation");
}

main();
```

### fund-agents.ts
```typescript
#!/usr/bin/env tsx

import { config } from "../eth_tempo_experiments/server/config.js";
import { createTempoWalletClient, publicClient, ALPHA_USD } from "../eth_tempo_experiments/server/tempo-client.js";
import { Actions } from "viem/tempo";
import { privateKeyToAccount } from "viem/accounts";
import { parseUsdAmount, formatUsdAmount } from "../eth_tempo_experiments/server/tempo-client.js";

const FUNDING_AMOUNTS = {
  MERCHANT_A: "100.0",
  ATTENDEE_1: "50.0",
  ATTENDEE_2: "50.0",
  ATTENDEE_3: "50.0",
};

async function fundWallet(
  fromPrivateKey: string,
  toPrivateKey: string,
  amount: string,
  walletName: string
): Promise<void> {
  console.log(`Funding ${walletName} with ${amount} AlphaUSD...`);

  const fromAccount = privateKeyToAccount(fromPrivateKey as `0x${string}`);
  const toAccount = privateKeyToAccount(toPrivateKey as `0x${string}`);
  const walletClient = createTempoWalletClient(fromAccount);

  try {
    const result = await Actions.token.transferSync(walletClient, {
      token: ALPHA_USD,
      to: toAccount.address,
      amount: parseUsdAmount(amount),
      memo: `0x${Buffer.from(`Zoo funding: ${walletName}`).toString('hex')}` as `0x${string}`,
      feePayer: fromAccount,
    });

    console.log(`✓ ${walletName}: ${result.receipt.transactionHash}`);
  } catch (error) {
    console.error(`✗ ${walletName}: ${error}`);
  }
}

async function checkBalance(privateKey: string, walletName: string): Promise<void> {
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

  console.log(`${walletName}: ${formatUsdAmount(balance)} AlphaUSD`);
}

async function main() {
  console.log("Zoo Agent Funding");
  console.log("=================\n");

  // Validate environment
  const requiredKeys = [
    "ZOO_MASTER_PRIVATE_KEY",
    "MERCHANT_A_PRIVATE_KEY",
    "ATTENDEE_1_PRIVATE_KEY",
    "ATTENDEE_2_PRIVATE_KEY",
    "ATTENDEE_3_PRIVATE_KEY",
  ];

  for (const key of requiredKeys) {
    if (!process.env[key]) {
      console.error(`❌ Missing environment variable: ${key}`);
      process.exit(1);
    }
  }

  const zooMasterKey = process.env.ZOO_MASTER_PRIVATE_KEY!;

  // Check Zoo Master balance first
  console.log("Initial balances:");
  await checkBalance(zooMasterKey, "Zoo Master");
  console.log();

  // Fund all wallets
  await fundWallet(zooMasterKey, process.env.MERCHANT_A_PRIVATE_KEY!, FUNDING_AMOUNTS.MERCHANT_A, "Merchant A");
  await fundWallet(zooMasterKey, process.env.ATTENDEE_1_PRIVATE_KEY!, FUNDING_AMOUNTS.ATTENDEE_1, "Attendee 1");
  await fundWallet(zooMasterKey, process.env.ATTENDEE_2_PRIVATE_KEY!, FUNDING_AMOUNTS.ATTENDEE_2, "Attendee 2");
  await fundWallet(zooMasterKey, process.env.ATTENDEE_3_PRIVATE_KEY!, FUNDING_AMOUNTS.ATTENDEE_3, "Attendee 3");

  console.log("\nFinal balances:");
  await checkBalance(zooMasterKey, "Zoo Master");
  await checkBalance(process.env.MERCHANT_A_PRIVATE_KEY!, "Merchant A");
  await checkBalance(process.env.ATTENDEE_1_PRIVATE_KEY!, "Attendee 1");
  await checkBalance(process.env.ATTENDEE_2_PRIVATE_KEY!, "Attendee 2");
  await checkBalance(process.env.ATTENDEE_3_PRIVATE_KEY!, "Attendee 3");

  console.log("\n✅ Funding complete! All agents are ready for simulation.");
}

main().catch(console.error);
```

### health-check.ts
```typescript
#!/usr/bin/env tsx

import { publicClient, CHAIN_CONFIG, ALPHA_USD } from "../eth_tempo_experiments/server/tempo-client.js";
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
```

## Usage Instructions

### Initial Setup
1. **Generate wallets**: `npm run setup:wallets`
2. **Set environment variables**: Copy private keys to `.env` or Railway
3. **Fund Zoo Master**: Get AlphaUSD from Tempo testnet faucet
4. **Distribute funds**: `npm run fund:agents`
5. **Verify setup**: `npm run health:check`

### Ongoing Maintenance
- **Check health**: Run health check before starting simulation
- **Monitor balances**: Health check shows low balance warnings
- **Rotate keys**: Generate new wallets periodically for security

### Development Workflow
```bash
# Setup new environment
npm run setup:wallets
# Copy keys to .env file
npm run fund:agents
npm run health:check

# Start simulation
npm run dev

# Monitor during development
npm run health:check  # Run periodically to check system state
```

These scripts provide the essential utilities for managing the Zoo Tycoon ACP simulation infrastructure.