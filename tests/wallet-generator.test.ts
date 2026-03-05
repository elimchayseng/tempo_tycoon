import { describe, it, expect } from 'vitest';
import { generateAllWallets } from '../agents/wallet-generator.js';

describe('generateAllWallets', () => {
  it('returns 5 wallets', () => {
    const wallets = generateAllWallets();
    expect(wallets).toHaveLength(5);
  });

  it('generates unique private keys', () => {
    const wallets = generateAllWallets();
    const keys = wallets.map(w => w.privateKey);
    expect(new Set(keys).size).toBe(5);
  });

  it('generates unique addresses', () => {
    const wallets = generateAllWallets();
    const addresses = wallets.map(w => w.address);
    expect(new Set(addresses).size).toBe(5);
  });

  it('private keys are valid hex format', () => {
    const wallets = generateAllWallets();
    for (const wallet of wallets) {
      expect(wallet.privateKey).toMatch(/^0x[0-9a-f]{64}$/);
    }
  });

  it('addresses are valid hex format', () => {
    const wallets = generateAllWallets();
    for (const wallet of wallets) {
      expect(wallet.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    }
  });

  it('has correct roles and labels', () => {
    const wallets = generateAllWallets();
    const roles = wallets.map(w => w.role);
    expect(roles).toEqual(['zooMaster', 'merchantA', 'guest1', 'guest2', 'guest3']);

    const labels = wallets.map(w => w.label);
    expect(labels).toEqual(['Zoo Master', 'Merchant A', 'Guest 1', 'Guest 2', 'Guest 3']);
  });
});
