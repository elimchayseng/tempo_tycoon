import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CircuitBreaker } from '../agents/circuit-breaker.js';

describe('CircuitBreaker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  function createBreaker() {
    return new CircuitBreaker({
      name: 'test',
      failureThreshold: 3,
      resetTimeoutMs: 5000,
      halfOpenMaxAttempts: 2,
    });
  }

  it('starts in CLOSED state', () => {
    const cb = createBreaker();
    expect(cb.getStatus().state).toBe('CLOSED');
  });

  it('transitions CLOSED → OPEN after failure threshold', async () => {
    const cb = createBreaker();
    const fail = () => Promise.reject(new Error('fail'));

    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(fail)).rejects.toThrow('fail');
    }

    expect(cb.getStatus().state).toBe('OPEN');
  });

  it('throws when OPEN and timeout has not elapsed', async () => {
    const cb = createBreaker();
    const fail = () => Promise.reject(new Error('fail'));

    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(fail)).rejects.toThrow();
    }

    await expect(cb.execute(() => Promise.resolve('ok'))).rejects.toThrow(/OPEN/);
  });

  it('transitions OPEN → HALF_OPEN after timeout', async () => {
    const cb = createBreaker();
    const fail = () => Promise.reject(new Error('fail'));

    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(fail)).rejects.toThrow();
    }

    vi.advanceTimersByTime(5001);

    const result = await cb.execute(() => Promise.resolve('recovered'));
    expect(result).toBe('recovered');
    expect(cb.getStatus().state).toBe('HALF_OPEN');
  });

  it('transitions HALF_OPEN → CLOSED after enough successes', async () => {
    const cb = createBreaker();
    const fail = () => Promise.reject(new Error('fail'));

    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(fail)).rejects.toThrow();
    }

    vi.advanceTimersByTime(5001);

    await cb.execute(() => Promise.resolve('ok'));
    await cb.execute(() => Promise.resolve('ok'));

    expect(cb.getStatus().state).toBe('CLOSED');
  });

  it('transitions HALF_OPEN → OPEN on failure', async () => {
    const cb = createBreaker();
    const fail = () => Promise.reject(new Error('fail'));

    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(fail)).rejects.toThrow();
    }

    vi.advanceTimersByTime(5001);

    // First call transitions to HALF_OPEN
    await cb.execute(() => Promise.resolve('ok'));
    expect(cb.getStatus().state).toBe('HALF_OPEN');

    // Failure in HALF_OPEN reopens
    await expect(cb.execute(fail)).rejects.toThrow();
    expect(cb.getStatus().state).toBe('OPEN');
  });

  it('reset() returns to CLOSED', async () => {
    const cb = createBreaker();
    const fail = () => Promise.reject(new Error('fail'));

    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(fail)).rejects.toThrow();
    }
    expect(cb.getStatus().state).toBe('OPEN');

    cb.reset();
    expect(cb.getStatus().state).toBe('CLOSED');
    expect(cb.getStatus().failures).toBe(0);
  });

  it('getStatus() returns correct shape', () => {
    const cb = createBreaker();
    const status = cb.getStatus();

    expect(status).toEqual({
      name: 'test',
      state: 'CLOSED',
      failures: 0,
      successes: 0,
      lastFailureTime: null,
      nextRetryTime: null,
    });
  });
});
