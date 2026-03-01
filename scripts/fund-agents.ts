#!/usr/bin/env tsx

import 'dotenv/config';
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

async function getBalance(address: `0x${string}`): Promise<bigint> {
  return await publicClient.readContract({
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
    args: [address],
  }) as bigint;
}

async function checkBalance(privateKey: string, walletName: string): Promise<void> {
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const balance = await getBalance(account.address);
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
      console.error(`Missing environment variable: ${key}`);
      process.exit(1);
    }
  }

  const zooMasterKey = process.env.ZOO_MASTER_PRIVATE_KEY!;
  const zooMasterAccount = privateKeyToAccount(zooMasterKey as `0x${string}`);

  // Check Zoo Master balance first
  console.log("Initial balances:");
  await checkBalance(zooMasterKey, "Zoo Master");
  console.log();

  // If zoo master balance is insufficient, request faucet funds
  const totalNeeded = parseUsdAmount("250.0"); // 100 + 50*3
  const initialBalance = await getBalance(zooMasterAccount.address);

  if (initialBalance < totalNeeded) {
    console.log(`Zoo Master balance insufficient ($${formatUsdAmount(initialBalance)}). Requesting faucet funds...`);

    try {
      const hashes = await Actions.faucet.fund(publicClient, {
        account: zooMasterAccount,
      });
      console.log(`Faucet submitted ${hashes.length} transaction(s). Waiting for balance...`);

      // Poll balance until it increases (up to 30s)
      const deadline = Date.now() + 30_000;
      let funded = false;
      while (Date.now() < deadline) {
        const bal = await getBalance(zooMasterAccount.address);
        if (bal > initialBalance) {
          funded = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 2_000));
      }

      if (!funded) {
        console.error("Faucet transactions submitted but balance did not increase within 30s.");
        console.error("You may need to wait and retry, or manually fund via https://faucet.moderato.tempo.xyz");
        process.exit(1);
      }
    } catch (error) {
      console.error(`✗ Faucet request failed: ${error}`);
      console.error("You may need to manually fund via https://faucet.moderato.tempo.xyz");
      process.exit(1);
    }

    // Re-check balance
    const newBalance = await getBalance(zooMasterAccount.address);
    console.log(`Zoo Master balance after faucet: ${formatUsdAmount(newBalance)} AlphaUSD\n`);
  }

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

  console.log("\nFunding complete! All agents are ready for simulation.");
}

main().catch(console.error);
