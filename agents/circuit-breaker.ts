import { createLogger } from '../shared/logger.js';

const log = createLogger('CircuitBreaker');

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  name: string;
  failureThreshold?: number;
  resetTimeoutMs?: number;
  halfOpenMaxAttempts?: number;
}

export interface CircuitBreakerStatus {
  name: string;
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime: number | null;
  nextRetryTime: number | null;
}

export class CircuitBreaker {
  private readonly name: string;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly halfOpenMaxAttempts: number;

  private state: CircuitState = 'CLOSED';
  private failures = 0;
  private halfOpenSuccesses = 0;
  private lastFailureTime: number | null = null;

  constructor(options: CircuitBreakerOptions) {
    this.name = options.name;
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 30000;
    this.halfOpenMaxAttempts = options.halfOpenMaxAttempts ?? 2;

    log.info(`[${this.name}] Initialized (threshold=${this.failureThreshold}, reset=${this.resetTimeoutMs}ms)`);
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (this.shouldAttemptReset()) {
        this.transitionTo('HALF_OPEN');
      } else {
        const retryIn = this.lastFailureTime! + this.resetTimeoutMs - Date.now();
        throw new Error(`[CircuitBreaker:${this.name}] OPEN — retry in ${Math.round(retryIn / 1000)}s`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.halfOpenSuccesses++;
      log.debug(`[${this.name}] HALF_OPEN success ${this.halfOpenSuccesses}/${this.halfOpenMaxAttempts}`);
      if (this.halfOpenSuccesses >= this.halfOpenMaxAttempts) {
        this.transitionTo('CLOSED');
      }
    } else {
      this.failures = 0;
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      log.warn(`[${this.name}] HALF_OPEN failure — reopening`);
      this.transitionTo('OPEN');
    } else if (this.failures >= this.failureThreshold) {
      log.warn(`[${this.name}] Failure threshold reached (${this.failures}/${this.failureThreshold}) — opening`);
      this.transitionTo('OPEN');
    }
  }

  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) return true;
    return Date.now() - this.lastFailureTime >= this.resetTimeoutMs;
  }

  private transitionTo(newState: CircuitState): void {
    const prev = this.state;
    this.state = newState;

    if (newState === 'CLOSED') {
      this.failures = 0;
      this.halfOpenSuccesses = 0;
    } else if (newState === 'HALF_OPEN') {
      this.halfOpenSuccesses = 0;
    }

    log.info(`[${this.name}] ${prev} -> ${newState}`);
  }

  getStatus(): CircuitBreakerStatus {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      successes: this.halfOpenSuccesses,
      lastFailureTime: this.lastFailureTime,
      nextRetryTime: this.state === 'OPEN' && this.lastFailureTime
        ? this.lastFailureTime + this.resetTimeoutMs
        : null,
    };
  }

  reset(): void {
    log.info(`[${this.name}] Manual reset`);
    this.state = 'CLOSED';
    this.failures = 0;
    this.halfOpenSuccesses = 0;
    this.lastFailureTime = null;
  }
}

// Shared instances
export const rpcCircuitBreaker = new CircuitBreaker({
  name: 'rpc',
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  halfOpenMaxAttempts: 2,
});

export const merchantCircuitBreaker = new CircuitBreaker({
  name: 'merchant',
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  halfOpenMaxAttempts: 2,
});
