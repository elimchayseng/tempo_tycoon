/**
 * Tests for merchant inventory price mutation (updatePrice, base_price).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  initializeInventory,
  updatePrice,
  getInventoryItem,
  getInventorySnapshot,
} from '../agents/merchant-inventory.js';

const MENU_ITEMS = [
  { sku: 'burger-1', name: 'Burger', price: '5.00', category: 'main', satisfaction_value: 70 },
  { sku: 'soda-1', name: 'Soda', price: '2.50', category: 'beverage', satisfaction_value: 30 },
];

describe('Merchant Inventory Price Mutations', () => {
  beforeEach(() => {
    initializeInventory(MENU_ITEMS);
  });

  it('updatePrice changes price and returns old price', () => {
    const oldPrice = updatePrice('burger-1', '6.00');
    expect(oldPrice).toBe('5.00');

    const item = getInventoryItem('burger-1');
    expect(item?.price).toBe('6.00');
  });

  it('updatePrice for unknown SKU returns null', () => {
    const result = updatePrice('nonexistent', '10.00');
    expect(result).toBeNull();
  });

  it('base_price remains unchanged after updatePrice', () => {
    updatePrice('burger-1', '7.50');
    const item = getInventoryItem('burger-1');
    expect(item?.base_price).toBe('5.00');
    expect(item?.price).toBe('7.50');
  });

  it('getInventorySnapshot includes base_price', () => {
    updatePrice('soda-1', '3.00');
    const snapshot = getInventorySnapshot();
    const soda = snapshot.find(i => i.sku === 'soda-1');
    expect(soda?.base_price).toBe('2.50');
    expect(soda?.price).toBe('3.00');
  });

  it('cost_basis is not affected by updatePrice', () => {
    const itemBefore = getInventoryItem('burger-1');
    const costBefore = itemBefore?.cost_basis;

    updatePrice('burger-1', '8.00');

    const itemAfter = getInventoryItem('burger-1');
    expect(itemAfter?.cost_basis).toBe(costBefore);
  });
});
