import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { randomBytes } from 'crypto';
import type { AgentState, PurchaseRecord } from './types.js';

/** Singleton instance — use getStateManager() to access */
let _instance: StateManager | null = null;

/** Get (or create) the singleton StateManager instance */
export function getStateManager(): StateManager {
  if (!_instance) {
    _instance = new StateManager();
  }
  return _instance;
}

export class StateManager {
  private readonly stateDir: string;
  private readonly stateFiles: Map<string, string> = new Map();

  constructor(stateDirectory?: string) {
    // Default to agent-states directory next to the agents folder
    this.stateDir = stateDirectory || join(dirname(new URL(import.meta.url).pathname), '..', 'agent-states');
    console.log(`[StateManager] 💾 State directory: ${this.stateDir}`);
  }

  /**
   * Initialize state management - create directory if needed
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.stateDir, { recursive: true });
      console.log(`[StateManager] ✓ State directory ready: ${this.stateDir}`);
    } catch (error) {
      console.error(`[StateManager] ❌ Failed to create state directory:`, error);
      throw new Error(`Failed to initialize state directory: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Load agent state from file, or create new state if file doesn't exist
   */
  async loadState(agentId: string, agentAddress: string): Promise<AgentState> {
    const stateFile = this.getStateFilePath(agentId);
    this.stateFiles.set(agentId, stateFile);

    try {
      const data = await fs.readFile(stateFile, 'utf-8');
      const state = JSON.parse(data);

      // Convert date strings back to Date objects
      const parsedState: AgentState = {
        ...state,
        last_purchase_time: state.last_purchase_time ? new Date(state.last_purchase_time) : null,
        last_funding_time: state.last_funding_time ? new Date(state.last_funding_time) : null,
        created_at: new Date(state.created_at),
        updated_at: new Date(state.updated_at)
      };

      console.log(`[StateManager] 📄 Loaded existing state for ${agentId}`);
      console.log(`[StateManager] ${agentId} state: needs=${parsedState.needs.food_need}, balance=$${parsedState.balance}, purchases=${parsedState.purchase_count}`);

      return parsedState;

    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // File doesn't exist, create new state
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

      } else {
        console.error(`[StateManager] ❌ Failed to load state for ${agentId}:`, error);
        throw new Error(`Failed to load agent state: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /**
   * Save agent state to file with atomic write
   */
  async saveState(state: AgentState): Promise<void> {
    const stateFile = this.stateFiles.get(state.agent_id);
    if (!stateFile) {
      throw new Error(`No state file registered for agent ${state.agent_id}`);
    }

    try {
      // Update timestamp
      const stateToSave = {
        ...state,
        updated_at: new Date()
      };

      // Convert to JSON with pretty printing for readability
      const data = JSON.stringify(stateToSave, null, 2);

      // Atomic write: write to unique temp file then rename
      const tempFile = `${stateFile}.${randomBytes(4).toString('hex')}.tmp`;
      await fs.writeFile(tempFile, data, 'utf-8');
      await fs.rename(tempFile, stateFile);

      console.log(`[StateManager] 💾 Saved state for ${state.agent_id}: needs=${state.needs.food_need}, balance=$${state.balance}, cycles=${state.cycle_count}`);

    } catch (error) {
      console.error(`[StateManager] ❌ Failed to save state for ${state.agent_id}:`, error);
      throw new Error(`Failed to save agent state: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Update specific fields in agent state and save
   */
  async updateState(agentId: string, updates: Partial<AgentState>): Promise<void> {
    const stateFile = this.stateFiles.get(agentId);
    if (!stateFile) {
      throw new Error(`No state file registered for agent ${agentId}`);
    }

    try {
      // Load current state
      const data = await fs.readFile(stateFile, 'utf-8');
      const currentState = JSON.parse(data);

      // Apply updates
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
      // Load current state to get updated values
      const stateFile = this.stateFiles.get(agentId);
      if (!stateFile) {
        throw new Error(`No state file registered for agent ${agentId}`);
      }

      const data = await fs.readFile(stateFile, 'utf-8');
      const currentState = JSON.parse(data);

      // Update purchase-related fields
      const updates: Partial<AgentState> = {
        last_purchase_time: purchaseRecord.completed_at,
        purchase_count: currentState.purchase_count + 1,
        needs: purchaseRecord.need_after,
        // Add the purchase amount to total spent
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
      const files = await fs.readdir(this.stateDir);
      const stateFiles = files.filter(file => file.endsWith('.json') && !file.endsWith('.tmp'));

      const states: AgentState[] = [];

      for (const file of stateFiles) {
        try {
          const filePath = join(this.stateDir, file);
          const data = await fs.readFile(filePath, 'utf-8');
          const state = JSON.parse(data);

          // Convert date strings back to Date objects
          const parsedState: AgentState = {
            ...state,
            last_purchase_time: state.last_purchase_time ? new Date(state.last_purchase_time) : null,
            last_funding_time: state.last_funding_time ? new Date(state.last_funding_time) : null,
            created_at: new Date(state.created_at),
            updated_at: new Date(state.updated_at)
          };

          states.push(parsedState);
        } catch (error) {
          console.error(`[StateManager] ⚠️  Failed to load state file ${file}:`, error);
        }
      }

      return states;

    } catch (error) {
      console.error(`[StateManager] ❌ Failed to get all states:`, error);
      return [];
    }
  }

  /**
   * Clear all state files (for testing/reset)
   */
  async clearAllStates(): Promise<void> {
    try {
      const files = await fs.readdir(this.stateDir);
      const stateFiles = files.filter(file => file.endsWith('.json'));

      for (const file of stateFiles) {
        await fs.unlink(join(this.stateDir, file));
      }

      console.log(`[StateManager] 🗑️  Cleared ${stateFiles.length} state files`);

    } catch (error) {
      console.error(`[StateManager] ❌ Failed to clear states:`, error);
      throw new Error(`Failed to clear state files: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get state file path for an agent
   */
  private getStateFilePath(agentId: string): string {
    return join(this.stateDir, `${agentId}.json`);
  }

  /**
   * Get basic stats about state management
   */
  async getStats() {
    try {
      const files = await fs.readdir(this.stateDir);
      const stateFiles = files.filter(file => file.endsWith('.json') && !file.endsWith('.tmp'));

      return {
        state_directory: this.stateDir,
        total_agents: stateFiles.length,
        state_files: stateFiles,
        last_updated: new Date().toISOString()
      };

    } catch (error) {
      return {
        state_directory: this.stateDir,
        total_agents: 0,
        state_files: [],
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}