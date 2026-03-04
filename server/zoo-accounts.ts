import type { ServerAccount } from "../shared/types.js";
import { accountStore } from "./accounts.js";
import { config } from "./config.js";
import type { GeneratedWallet } from "../agents/wallet-generator.js";

// Zoo wallet identifiers
export const zooWallets = {
  zooMaster: "zoo_master",
  merchantA: "merchant_a",
  guest1: "guest_1",
  guest2: "guest_2",
  guest3: "guest_3"
} as const;

export type ZooWalletId = keyof typeof zooWallets;
export type ZooWalletLabel = typeof zooWallets[ZooWalletId];

/**
 * Reset zoo accounts with freshly generated wallets.
 * Clears any existing zoo entries and inserts new ones.
 */
export function resetZooAccounts(wallets: GeneratedWallet[]): void {
  // Clear existing zoo entries first
  clearZooAccounts();

  for (const wallet of wallets) {
    const serverAccount: ServerAccount = {
      label: wallet.label,
      address: wallet.address,
      privateKey: wallet.privateKey,
      balances: {},
    };
    (accountStore as any).accounts.set(wallet.storeKey, serverAccount);
  }
}

/**
 * Remove all zoo entries from the account store.
 */
export function clearZooAccounts(): void {
  for (const storeKey of Object.values(zooWallets)) {
    accountStore.remove(storeKey);
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
