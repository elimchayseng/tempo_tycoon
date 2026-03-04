/**
 * StateManager tests — load/save, clearAllStates, atomic write behavior.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { StateManager } from '../agents/state-manager.js';

let tempDir: string;
let manager: StateManager;

beforeEach(async () => {
  tempDir = join(tmpdir(), `state-manager-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  manager = new StateManager(tempDir);
  await manager.initialize();
});

afterEach(async () => {
  try {
    await fs.rm(tempDir, { recursive: true });
  } catch { /* ignore */ }
});

describe('StateManager', () => {
  it('creates state directory on initialize', async () => {
    const stat = await fs.stat(tempDir);
    expect(stat.isDirectory()).toBe(true);
  });

  it('loadState creates new state when file does not exist', async () => {
    const state = await manager.loadState('test_agent', '0x1234');
    expect(state.agent_id).toBe('test_agent');
    expect(state.address).toBe('0x1234');
    expect(state.needs.food_need).toBe(50);
    expect(state.status).toBe('offline');
    expect(state.purchase_count).toBe(0);
    expect(state.total_spent).toBe('0.00');
  });

  it('saveState + loadState roundtrips correctly', async () => {
    const state = await manager.loadState('test_agent', '0x1234');
    state.needs.food_need = 75;
    state.balance = '42.00';
    state.purchase_count = 3;
    await manager.saveState(state);

    // Load again
    const loaded = await manager.loadState('test_agent', '0x1234');
    expect(loaded.needs.food_need).toBe(75);
    expect(loaded.balance).toBe('42.00');
    expect(loaded.purchase_count).toBe(3);
  });

  it('atomic write: no partial files left behind', async () => {
    const state = await manager.loadState('atomic_test', '0xABCD');
    await manager.saveState(state);

    const files = await fs.readdir(tempDir);
    const tmpFiles = files.filter(f => f.endsWith('.tmp'));
    expect(tmpFiles.length).toBe(0);
  });

  it('clearAllStates removes all JSON files', async () => {
    await manager.loadState('agent_a', '0x1');
    await manager.loadState('agent_b', '0x2');

    let files = await fs.readdir(tempDir);
    expect(files.filter(f => f.endsWith('.json')).length).toBe(2);

    await manager.clearAllStates();

    files = await fs.readdir(tempDir);
    expect(files.filter(f => f.endsWith('.json')).length).toBe(0);
  });

  it('recordPurchase updates purchase count and total spent', async () => {
    const state = await manager.loadState('buyer_1', '0xBBBB');

    await manager.recordPurchase('buyer_1', {
      purchase_id: 'p1',
      session_id: 's1',
      sku: 'burger-1',
      name: 'Burger',
      amount: '5.00',
      tx_hash: '0xaaa',
      block_number: '123',
      completed_at: new Date(),
      need_before: { food_need: 20, fun_need: 100 },
      need_after: { food_need: 80, fun_need: 100 },
    });

    const updated = await manager.loadState('buyer_1', '0xBBBB');
    expect(updated.purchase_count).toBe(1);
    expect(updated.total_spent).toBe('5.00');
    expect(updated.needs.food_need).toBe(80);
  });

  it('getAllStates returns all saved states', async () => {
    await manager.loadState('a1', '0x1');
    await manager.loadState('a2', '0x2');

    const all = await manager.getAllStates();
    expect(all.length).toBe(2);
    const ids = all.map(s => s.agent_id).sort();
    expect(ids).toEqual(['a1', 'a2']);
  });
});
