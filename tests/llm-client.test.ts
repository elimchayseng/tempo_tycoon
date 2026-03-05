import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LLMClient } from '../agents/llm/llm-client.js';

const defaultConfig = {
  inferenceUrl: 'http://localhost:8080',
  inferenceKey: 'test-key',
  model: 'test-model',
  maxTokensPerResponse: 256,
  maxCallsPerSimulation: 3,
};

const mockResponse = {
  id: 'chatcmpl-1',
  choices: [{ index: 0, message: { role: 'assistant' as const, content: 'hello', tool_calls: [] }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
};

function mockFetch(response: unknown = mockResponse, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(response),
    text: () => Promise.resolve(JSON.stringify(response)),
  });
}

describe('LLMClient', () => {
  let client: LLMClient;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    client = new LLMClient(defaultConfig);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('parses a successful response', async () => {
    globalThis.fetch = mockFetch();
    const result = await client.chat('system', 'hello', []);
    expect(result.choices[0].message.content).toBe('hello');
  });

  it('increments call counter', async () => {
    globalThis.fetch = mockFetch();
    expect(client.getCallCount()).toBe(0);

    await client.chat('system', 'hello', []);
    expect(client.getCallCount()).toBe(1);

    await client.chat('system', 'hello', []);
    expect(client.getCallCount()).toBe(2);
  });

  it('enforces call limit', async () => {
    globalThis.fetch = mockFetch();

    await client.chat('s', 'u', []);
    await client.chat('s', 'u', []);
    await client.chat('s', 'u', []);

    await expect(client.chat('s', 'u', [])).rejects.toThrow(/call limit reached/i);
  });

  it('throws on HTTP error', async () => {
    globalThis.fetch = mockFetch({ error: 'bad request' }, 400);
    await expect(client.chat('s', 'u', [])).rejects.toThrow(/LLM HTTP 400/);
  });

  it('throws on timeout (abort)', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() =>
      new Promise((_, reject) => {
        setTimeout(() => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), 1);
      }),
    );

    await expect(client.chat('s', 'u', [])).rejects.toThrow(/timed out/);
  });

  it('resetCallCount resets the counter', async () => {
    globalThis.fetch = mockFetch();
    await client.chat('s', 'u', []);
    expect(client.getCallCount()).toBe(1);

    client.resetCallCount();
    expect(client.getCallCount()).toBe(0);
  });

  it('sends authorization header', async () => {
    const fetchSpy = mockFetch();
    globalThis.fetch = fetchSpy;

    await client.chat('system', 'hello', []);

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:8080/v1/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
        }),
      }),
    );
  });
});
