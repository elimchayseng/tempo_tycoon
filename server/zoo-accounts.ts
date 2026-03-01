import { privateKeyToAccount } from "viem/accounts";
import type { ServerAccount } from "../shared/types.js";
import { accountStore } from "./accounts.js";
import { config } from "./config.js";

// Zoo wallet identifiers
export const zooWallets = {
  zooMaster: "zoo_master",
  merchantA: "merchant_a",
  attendee1: "attendee_1",
  attendee2: "attendee_2",
  attendee3: "attendee_3"
} as const;

export type ZooWalletId = keyof typeof zooWallets;
export type ZooWalletLabel = typeof zooWallets[ZooWalletId];

// Initialize zoo accounts in the existing account store
export function initializeZooAccounts(): void {
  // Only initialize if zoo simulation is enabled
  if (!config.zoo.enabled) {
    return;
  }

  // Zoo Master - Protocol facilitator hosting merchant registry
  if (config.wallets.zooMaster) {
    const privateKey = config.wallets.zooMaster as `0x${string}`;
    const account = privateKeyToAccount(privateKey);
    const serverAccount: ServerAccount = {
      label: "Zoo Master",
      address: account.address,
      privateKey,
      balances: {},
    };

    // Add to existing account store using the zoo wallet identifier
    (accountStore as any).accounts.set(zooWallets.zooMaster, serverAccount);
  }

  // Merchant A - Food vendor
  if (config.wallets.merchantA) {
    const privateKey = config.wallets.merchantA as `0x${string}`;
    const account = privateKeyToAccount(privateKey);
    const serverAccount: ServerAccount = {
      label: "Merchant A",
      address: account.address,
      privateKey,
      balances: {},
    };

    (accountStore as any).accounts.set(zooWallets.merchantA, serverAccount);
  }

  // Attendee 1 - Buyer agent
  if (config.wallets.attendee1) {
    const privateKey = config.wallets.attendee1 as `0x${string}`;
    const account = privateKeyToAccount(privateKey);
    const serverAccount: ServerAccount = {
      label: "Attendee 1",
      address: account.address,
      privateKey,
      balances: {},
    };

    (accountStore as any).accounts.set(zooWallets.attendee1, serverAccount);
  }

  // Attendee 2 - Buyer agent
  if (config.wallets.attendee2) {
    const privateKey = config.wallets.attendee2 as `0x${string}`;
    const account = privateKeyToAccount(privateKey);
    const serverAccount: ServerAccount = {
      label: "Attendee 2",
      address: account.address,
      privateKey,
      balances: {},
    };

    (accountStore as any).accounts.set(zooWallets.attendee2, serverAccount);
  }

  // Attendee 3 - Buyer agent
  if (config.wallets.attendee3) {
    const privateKey = config.wallets.attendee3 as `0x${string}`;
    const account = privateKeyToAccount(privateKey);
    const serverAccount: ServerAccount = {
      label: "Attendee 3",
      address: account.address,
      privateKey,
      balances: {},
    };

    (accountStore as any).accounts.set(zooWallets.attendee3, serverAccount);
  }
}

// Helper functions to get zoo accounts
export function getZooAccount(walletId: ZooWalletLabel): ServerAccount | undefined {
  return accountStore.get(walletId);
}

export function getZooAccountByRole(role: ZooWalletId): ServerAccount | undefined {
  return accountStore.get(zooWallets[role]);
}

// Check if zoo accounts are properly initialized
export function areZooAccountsInitialized(): boolean {
  if (!config.zoo.enabled) {
    return true; // Not required when disabled
  }

  const requiredAccounts = Object.values(zooWallets);
  return requiredAccounts.every(label => accountStore.get(label) !== undefined);
}

// Get all zoo accounts for monitoring/debugging
export function getAllZooAccounts(): ServerAccount[] {
  if (!config.zoo.enabled) {
    return [];
  }

  return Object.values(zooWallets)
    .map(label => accountStore.get(label))
    .filter((account): account is ServerAccount => account !== undefined);
}