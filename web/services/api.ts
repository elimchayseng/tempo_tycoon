import type { SendRequest, BatchRequest, HistoryRequest } from '../lib/types.js';

// Configuration for API calls
const API_BASE_URL = '/api';
const DEFAULT_TIMEOUT = 30000; // 30 seconds

// Custom error class for API errors
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Generic API request function with timeout and error handling
async function apiRequest<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      signal: controller.signal,
      ...options,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorDetails: unknown;
      try {
        errorDetails = await response.json();
      } catch {
        errorDetails = await response.text();
      }

      throw new ApiError(
        `Request failed: ${response.status} ${response.statusText}`,
        response.status,
        errorDetails
      );
    }

    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError('Request timeout', 408);
    }

    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError('Network error', 0, error);
  }
}

// API Service class with typed methods
export class ApiService {
  /**
   * Setup accounts - initialize and fund test accounts
   */
  static async setup(): Promise<void> {
    await apiRequest('/setup');
  }

  /**
   * Check balances - refresh account balances
   */
  static async checkBalances(): Promise<void> {
    await apiRequest('/balance');
  }

  /**
   * Send payment with memo
   */
  static async send(request: SendRequest): Promise<void> {
    await apiRequest('/send', {
      body: JSON.stringify(request),
    });
  }

  /**
   * Send sponsored payment (sponsor pays fee)
   */
  static async sendSponsored(request: SendRequest): Promise<void> {
    await apiRequest('/send-sponsored', {
      body: JSON.stringify(request),
    });
  }

  /**
   * Execute batch payment
   */
  static async batch(request: BatchRequest): Promise<void> {
    await apiRequest('/batch', {
      body: JSON.stringify(request),
    });
  }

  /**
   * View transaction history for account
   */
  static async history(request: HistoryRequest): Promise<void> {
    await apiRequest('/history', {
      body: JSON.stringify(request),
    });
  }
}

// Utility function for displaying API errors to users
export function formatApiError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 400 && error.details) {
      // Validation errors
      const details = error.details as { error?: string; details?: Array<{ field: string; message: string }> };
      if (details.details && Array.isArray(details.details)) {
        const fieldErrors = details.details.map(e => `${e.field}: ${e.message}`).join(', ');
        return `Validation failed: ${fieldErrors}`;
      }
    }
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'An unexpected error occurred';
}