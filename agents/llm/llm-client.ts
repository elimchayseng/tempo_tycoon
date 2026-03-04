import { createLogger } from '../../shared/logger.js';

const log = createLogger('LLMClient');

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ToolFunction {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface Tool {
  type: 'function';
  function: ToolFunction;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatCompletionResponse {
  id: string;
  choices: Array<{
    index: number;
    message: {
      role: 'assistant';
      content: string | null;
      tool_calls?: ToolCall[];
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface LLMClientConfig {
  inferenceUrl: string;
  inferenceKey: string;
  model: string;
  maxTokensPerResponse: number;
  maxCallsPerSimulation: number;
}

export class LLMClient {
  private readonly config: LLMClientConfig;
  private callCount = 0;

  constructor(config: LLMClientConfig) {
    this.config = config;
    log.info(`LLM client initialized (model: ${config.model}, max calls: ${config.maxCallsPerSimulation})`);
  }

  get model(): string {
    return this.config.model;
  }

  /**
   * Send a chat completion request to Heroku Managed Inference.
   * Throws on HTTP error, timeout, or safety cap exceeded — caller must handle fallback.
   */
  async chat(
    systemPrompt: string,
    userMessage: string,
    tools: Tool[],
  ): Promise<ChatCompletionResponse> {
    if (this.callCount >= this.config.maxCallsPerSimulation) {
      throw new Error(
        `LLM call limit reached (${this.callCount}/${this.config.maxCallsPerSimulation}). Reset simulation to continue.`,
      );
    }

    const url = `${this.config.inferenceUrl}/v1/chat/completions`;

    const body = {
      model: this.config.model,
      max_tokens: this.config.maxTokensPerResponse,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ] satisfies ChatMessage[],
      tools,
      tool_choice: 'required' as const,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      log.debug(`LLM request #${this.callCount + 1} → ${this.config.model}`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.inferenceKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LLM HTTP ${response.status}: ${errorText}`);
      }

      const data = (await response.json()) as ChatCompletionResponse;

      this.callCount++;

      if (data.usage) {
        log.info(
          `LLM call #${this.callCount}: ${data.usage.prompt_tokens} prompt + ${data.usage.completion_tokens} completion tokens`,
        );
      }

      return data;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('LLM request timed out (10s)');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Reset the per-simulation call counter (called on simulation restart). */
  resetCallCount(): void {
    log.info(`LLM call counter reset (was ${this.callCount})`);
    this.callCount = 0;
  }

  getCallCount(): number {
    return this.callCount;
  }
}
