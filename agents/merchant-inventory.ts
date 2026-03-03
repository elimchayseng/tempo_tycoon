import { createLogger } from '../shared/logger.js';

const log = createLogger('MerchantInventory');

export interface InventoryItem {
  sku: string;
  name: string;
  price: string;
  cost_basis: string;
  category: string;
  stock: number;
  max_stock: number;
  restock_threshold: number;
}

// Module-level singleton — safe because Node modules are singletons, single-threaded
const inventory: Map<string, InventoryItem> = new Map();

export function initializeInventory(menuItems: Array<{ sku: string; name: string; price: string; category: string }>): void {
  inventory.clear();

  for (const item of menuItems) {
    const price = parseFloat(item.price);
    const costBasis = Math.max(0, price - 1.0);

    const inventoryItem: InventoryItem = {
      sku: item.sku,
      name: item.name,
      price: item.price,
      cost_basis: costBasis.toFixed(2),
      category: item.category,
      stock: 5,
      max_stock: 5,
      restock_threshold: 1,
    };

    inventory.set(item.sku, inventoryItem);
    log.debug(`Initialized ${item.name}: stock=${inventoryItem.stock}, cost_basis=$${inventoryItem.cost_basis}`);
  }

  log.info(`Inventory initialized with ${inventory.size} items`);
}

export function decrementStock(sku: string): boolean {
  const item = inventory.get(sku);
  if (!item || item.stock <= 0) {
    log.warn(`Cannot decrement stock for ${sku}: ${item ? `stock=${item.stock}` : 'not found'}`);
    return false;
  }

  item.stock -= 1;
  log.info(`${item.name} stock decremented: ${item.stock + 1} → ${item.stock}`);
  return true;
}

export function isAvailable(sku: string): boolean {
  const item = inventory.get(sku);
  return item !== undefined && item.stock > 0;
}

export function getSkusNeedingRestock(): InventoryItem[] {
  const needsRestock: InventoryItem[] = [];

  for (const item of inventory.values()) {
    if (item.stock <= item.restock_threshold) {
      needsRestock.push(item);
    }
  }

  return needsRestock;
}

export function restockItem(sku: string): number {
  const item = inventory.get(sku);
  if (!item) {
    log.warn(`Cannot restock ${sku}: not found`);
    return 0;
  }

  const previousStock = item.stock;
  item.stock = item.max_stock;
  const unitsAdded = item.max_stock - previousStock;

  log.info(`${item.name} restocked: ${previousStock} → ${item.stock} (+${unitsAdded})`);
  return unitsAdded;
}

export function getInventoryItem(sku: string): InventoryItem | undefined {
  return inventory.get(sku);
}

export function getInventorySnapshot(): Array<{
  sku: string;
  name: string;
  price: string;
  stock: number;
  max_stock: number;
  available: boolean;
}> {
  return Array.from(inventory.values()).map(item => ({
    sku: item.sku,
    name: item.name,
    price: item.price,
    stock: item.stock,
    max_stock: item.max_stock,
    available: item.stock > 0,
  }));
}
