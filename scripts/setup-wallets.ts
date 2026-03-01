#!/usr/bin/env tsx

import 'dotenv/config';
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
