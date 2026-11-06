import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import type { AgentState, PurchaseRecord } from './types.js';

/**
 * Storage backend for per-agent JSON state blobs.
 *  - FileStateBackend: JSON files on disk (Node host, tests)
 *  - MemoryStateBackend: in-memory map (Cloudflare Durable Object host — no
 *    filesystem; agent state is per-simulation and wiped on every preflight
 *    anyway, so durability across restarts is not needed)
 */
export interface StateBackend {
  readonly location: string;
  init(): Promise<void>;
  /** Returns the stored JSON, or null if the agent has no state. */
  read(agentId: string): Promise<string | null>;
  write(agentId: string, data: string): Promise<void>;
  list(): Promise<string[]>;
  remove(agentId: string): Promise<void>;
}

export class FileStateBackend implements StateBackend {
  constructor(readonly location: string) {}

  async init(): Promise<void> {
    await fs.mkdir(this.location, { recursive: true });
  }

  private path(agentId: string): string {
    return join(this.location, `${agentId}.json`);
  }

  async read(agentId: string): Promise<string | null> {
    try {
      return await fs.readFile(this.path(agentId), 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async write(agentId: string, data: string): Promise<void> {
    // Atomic write: write to unique temp file then rename
    const file = this.path(agentId);
    const tempFile = `${file}.${Math.random().toString(16).slice(2, 10)}.tmp`;
    await fs.writeFile(tempFile, data, 'utf-8');
    await fs.rename(tempFile, file);
  }

  async list(): Promise<string[]> {
    const files = await fs.readdir(this.location);
    return files
      .filter(file => file.endsWith('.json'))
      .map(file => file.slice(0, -'.json'.length));
  }

  async remove(agentId: string): Promise<void> {
    await fs.unlink(this.path(agentId));
  }
}

export class MemoryStateBackend implements StateBackend {
  readonly location = 'memory';
  private readonly store = new Map<string, string>();

  async init(): Promise<void> {}
  async read(agentId: string): Promise<string | null> {
    return this.store.get(agentId) ?? null;
  }
  async write(agentId: string, data: string): Promise<void> {
    this.store.set(agentId, data);
  }
  async list(): Promise<string[]> {
    return Array.from(this.store.keys());
  }
  async remove(agentId: string): Promise<void> {
    this.store.delete(agentId);
  }
}

/** Singleton instance — use getStateManager() to access */
let _instance: StateManager | null = null;
let _defaultBackend: (() => StateBackend) | null = null;

/**
 * Override the backend used by getStateManager(). Hosts without a
 * filesystem (Cloudflare) call this with MemoryStateBackend at startup.
 */
export function setDefaultStateBackend(factory: () => StateBackend): void {
  _defaultBackend = factory;
  _instance = null;
}

/** Get (or create) the singleton StateManager instance */
export function getStateManager(): StateManager {
  if (!_instance) {
    _instance = new StateManager(_defaultBackend ? _defaultBackend() : undefined);
  }
  return _instance;
}

export class StateManager {
  private readonly backend: StateBackend;
  private readonly registered: Set<string> = new Set();

  constructor(stateDirectoryOrBackend?: string | StateBackend) {
    if (stateDirectoryOrBackend && typeof stateDirectoryOrBackend !== 'string') {
      this.backend = stateDirectoryOrBackend;
    } else {
      // Default to agent-states directory next to the agents folder
      this.backend = new FileStateBackend(
        stateDirectoryOrBackend || join(dirname(new URL(import.meta.url).pathname), '..', 'agent-states')
      );
    }
    console.log(`[StateManager] 💾 State storage: ${this.backend.location}`);
  }

  /**
   * Initialize state management - create directory if needed
   */
  async initialize(): Promise<void> {
    try {
      await this.backend.init();
      console.log(`[StateManager] ✓ State storage ready: ${this.backend.location}`);
    } catch (error) {
      console.error(`[StateManager] ❌ Failed to initialize state storage:`, error);
      throw new Error(`Failed to initialize state directory: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private parse(data: string): AgentState {
    const state = JSON.parse(data);
    // Convert date strings back to Date objects
    return {
      ...state,
      last_purchase_time: state.last_purchase_time ? new Date(state.last_purchase_time) : null,
      last_funding_time: state.last_funding_time ? new Date(state.last_funding_time) : null,
      created_at: new Date(state.created_at),
      updated_at: new Date(state.updated_at)
    };
  }

  private requireRegistered(agentId: string): void {
    if (!this.registered.has(agentId)) {
      throw new Error(`No state file registered for agent ${agentId}`);
    }
  }

  /**
   * Load agent state, or create new state if none exists
   */
  async loadState(agentId: string, agentAddress: string): Promise<AgentState> {
    this.registered.add(agentId);

    let data: string | null;
    try {
      data = await this.backend.read(agentId);
    } catch (error) {
      console.error(`[StateManager] ❌ Failed to load state for ${agentId}:`, error);
      throw new Error(`Failed to load agent state: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (data !== null) {
      const parsedState = this.parse(data);
      console.log(`[StateManager] 📄 Loaded existing state for ${agentId}`);
      console.log(`[StateManager] ${agentId} state: needs=${parsedState.needs.food_need}, balance=$${parsedState.balance}, purchases=${parsedState.purchase_count}`);
      return parsedState;
    }

    console.log(`[StateManager] 🆕 Creating new state for ${agentId}`);

    const newState: AgentState = {
      agent_id: agentId,
      address: agentAddress,
      needs: {
        food_need: 50, // Start at 50% so agents purchase sooner
        fun_need: 100   // Future feature
      },
      balance: "0.00",
      status: 'offline',
      last_purchase_time: null,
      last_funding_time: null,
      purchase_count: 0,
      total_spent: "0.00",
      cycle_count: 0,
      created_at: new Date(),
      updated_at: new Date()
    };

    // Save the new state immediately
    await this.saveState(newState);
    return newState;
  }

  /**
   * Save agent state (atomic for the file backend)
   */
  async saveState(state: AgentState): Promise<void> {
    this.requireRegistered(state.agent_id);

    try {
      const stateToSave = {
        ...state,
        updated_at: new Date()
      };
      await this.backend.write(state.agent_id, JSON.stringify(stateToSave, null, 2));
      console.log(`[StateManager] 💾 Saved state for ${state.agent_id}: needs=${state.needs.food_need}, balance=$${state.balance}, cycles=${state.cycle_count}`);
    } catch (error) {
      console.error(`[StateManager] ❌ Failed to save state for ${state.agent_id}:`, error);
      throw new Error(`Failed to save agent state: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async readCurrent(agentId: string): Promise<any> {
    const data = await this.backend.read(agentId);
    if (data === null) {
      throw new Error(`No stored state for agent ${agentId}`);
    }
    return JSON.parse(data);
  }

  /**
   * Update specific fields in agent state and save
   */
  async updateState(agentId: string, updates: Partial<AgentState>): Promise<void> {
    this.requireRegistered(agentId);

    try {
      const currentState = await this.readCurrent(agentId);

      const updatedState: AgentState = {
        ...currentState,
        ...updates,
        updated_at: new Date(),
        // Preserve date objects
        last_purchase_time: updates.last_purchase_time || (currentState.last_purchase_time ? new Date(currentState.last_purchase_time) : null),
        last_funding_time: updates.last_funding_time || (currentState.last_funding_time ? new Date(currentState.last_funding_time) : null),
        created_at: new Date(currentState.created_at)
      };

      await this.saveState(updatedState);
    } catch (error) {
      console.error(`[StateManager] ❌ Failed to update state for ${agentId}:`, error);
      throw new Error(`Failed to update agent state: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Record a purchase in the agent's state
   */
  async recordPurchase(agentId: string, purchaseRecord: PurchaseRecord): Promise<void> {
    try {
      this.requireRegistered(agentId);
      const currentState = await this.readCurrent(agentId);

      const updates: Partial<AgentState> = {
        last_purchase_time: purchaseRecord.completed_at,
        purchase_count: currentState.purchase_count + 1,
        needs: purchaseRecord.need_after,
        total_spent: (parseFloat(currentState.total_spent) + parseFloat(purchaseRecord.amount)).toFixed(2)
      };

      await this.updateState(agentId, updates);

      const itemNames = purchaseRecord.items.map(i => i.name).join(' + ');
      console.log(`[StateManager] 🛍️  Recorded purchase for ${agentId}: ${itemNames} ($${purchaseRecord.amount})`);
      console.log(`[StateManager] ${agentId} totals: ${updates.purchase_count} purchases, $${updates.total_spent} spent`);
    } catch (error) {
      console.error(`[StateManager] ❌ Failed to record purchase for ${agentId}:`, error);
      throw new Error(`Failed to record purchase: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get all agent states (for dashboard/monitoring)
   */
  async getAllStates(): Promise<AgentState[]> {
    try {
      const ids = await this.backend.list();
      const states: AgentState[] = [];

      for (const id of ids) {
        try {
          const data = await this.backend.read(id);
          if (data !== null) states.push(this.parse(data));
        } catch (error) {
          console.error(`[StateManager] ⚠️  Failed to load state for ${id}:`, error);
        }
      }

      return states;
    } catch (error) {
      console.error(`[StateManager] ❌ Failed to get all states:`, error);
      return [];
    }
  }

  /**
   * Clear all stored states (for testing/reset)
   */
  async clearAllStates(): Promise<void> {
    try {
      const ids = await this.backend.list();
      for (const id of ids) {
        await this.backend.remove(id);
      }
      console.log(`[StateManager] 🗑️  Cleared ${ids.length} state files`);
    } catch (error) {
      console.error(`[StateManager] ❌ Failed to clear states:`, error);
      throw new Error(`Failed to clear state files: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get basic stats about state management
   */
  async getStats() {
    try {
      const ids = await this.backend.list();
      return {
        state_directory: this.backend.location,
        total_agents: ids.length,
        state_files: ids.map(id => `${id}.json`),
        last_updated: new Date().toISOString()
      };
    } catch (error) {
      return {
        state_directory: this.backend.location,
        total_agents: 0,
        state_files: [],
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}
