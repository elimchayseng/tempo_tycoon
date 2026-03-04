import { randomBytes } from 'crypto';
import { privateKeyToAccount } from 'viem/accounts';
import { zooWallets } from '../server/zoo-accounts.js';

export interface GeneratedWallet {
  label: string;
  role: string;
  storeKey: string;
  privateKey: `0x${string}`;
  address: `0x${string}`;
}

const WALLET_ROLES = [
  { label: 'Zoo Master', role: 'zooMaster', storeKey: zooWallets.zooMaster },
  { label: 'Merchant A', role: 'merchantA', storeKey: zooWallets.merchantA },
  { label: 'Guest 1', role: 'guest1', storeKey: zooWallets.guest1 },
  { label: 'Guest 2', role: 'guest2', storeKey: zooWallets.guest2 },
  { label: 'Guest 3', role: 'guest3', storeKey: zooWallets.guest3 },
] as const;

export function generateAllWallets(): GeneratedWallet[] {
  return WALLET_ROLES.map(({ label, role, storeKey }) => {
    const privateKey = `0x${randomBytes(32).toString('hex')}` as `0x${string}`;
    const account = privateKeyToAccount(privateKey);
    return {
      label,
      role,
      storeKey,
      privateKey,
      address: account.address,
    };
  });
}
