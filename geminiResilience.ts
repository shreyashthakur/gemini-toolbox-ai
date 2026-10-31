import { GoogleGenAI, GenerateContentResponse } from '@google/genai';

export interface ResilienceStatus {
  message: string;
  attempt?: number;
  model: string;
  isFallback?: boolean;
  delayMs?: number;
}

export interface GenerationResult {
  response: GenerateContentResponse;
  usedModel: string;
  fallbackUsed: boolean;
  retriesAttempted: number;
}

export interface StreamGenerationResult {
  fullText: string;
  functionCalls: any[];
  usedModel: string;
  fallbackUsed: boolean;
  candidateContent?: any;
}

/**
 * Determines whether the error represents a daily quota exhaustion
 * (e.g. Free Tier limit of 20 requests/day exceeded on gemini-3.8-flash).
 * In such cases, exponential backoff within seconds will fail, so we fallback immediately.
 */
export function isDailyQuotaExhausted(error: any): boolean {
  if (!error) return false;
  const msg = (error.message || String(error)).toLowerCase();
  return (
    msg.includes('per day limit exceeded') ||
    msg.includes('generaterequestsperday') ||
    msg.includes('limit exceeded on free tier') ||
    msg.includes('daily limit') ||
    (msg.includes('retry in') && (msg.includes('h') || msg.includes('hour')))
  );
}

/**
 * Determines whether an error is eligible for fallback to secondary model.
 */
export function canFallbackForError(error: any): boolean {
  if (!error) return false;
  const status = error.status || error.code || error.statusCode || error.httpStatus;
  const msg = (error.message || String(error)).toLowerCase();

  // Strict non-fallback: 400, 401, 403, 404, invalid API key
  if (status === 400 || status === 401 || status === 403 || status === 404) {
    return false;
  }
  if (msg.includes('api key not valid') || msg.includes('api_key_invalid') || msg.includes('invalid api key')) {
    return false;
  }
  if (msg.includes('invalid argument') || msg.includes('bad request')) {
    return false;
  }

  return isTransientError(error) || isDailyQuotaExhausted(error) || status === 429 || status === 503;
}

/**
 * Determines whether an error from the Gemini API is transient and safe to retry.
 * Retries: 503 (Unavailable / High Demand), 429 (Rate Limit / Resource Exhausted),
 * 408 (Request Timeout), and transient 5xx server errors.
 * Never retries: 400 (Bad Request), 401/403 (Auth / Invalid API key), 404 (Not Found).
 */
export function isTransientError(error: any): boolean {
  if (!error) return false;

  const status = error.status || error.code || error.statusCode || error.httpStatus;
  const msg = (error.message || String(error)).toLowerCase();

  // Explicit non-transient status codes
  if (status === 400 || status === 401 || status === 403 || status === 404) {
    return false;
  }
  if (msg.includes('api key not valid') || msg.includes('api_key_invalid') || msg.includes('invalid api key')) {
    return false;
  }
  if (msg.includes('invalid argument') || msg.includes('bad request')) {
    return false;
  }
  if (isDailyQuotaExhausted(error)) {
    // Daily quota exhaustion cannot be resolved by short-term retries
    return false;
  }
  if (msg.includes('is no longer available to new users') || msg.includes('not_found')) {
    // Model not found or deprecated
    return true; // allow model fallback to handle deprecated models
  }

  // Transient status codes
  if (status === 503 || status === 429 || status === 408 || status === 500 || status === 502 || status === 504) {
    return true;
  }

  // Textual indicators of transient availability issues
  const transientKeywords = [
    '503',
    'high demand',
    'unavailable',
    'overloaded',
    'rate limit',
    'resource_exhausted',
    'resource has been exhausted',
    'quota',
    'deadline_exceeded',
    'timeout',
    'timed out',
    'econnreset',
    'etimedout',
    'temporarily unavailable',
    'server error',
  ];

  return transientKeywords.some((kw) => msg.includes(kw));
}

export function formatFriendlyErrorMessage(error: any): string {
  if (!error) return 'An unexpected error occurred. Please try again.';
  const msg = error.message || String(error);
  const lower = msg.toLowerCase();

  if (lower.includes('api key not valid') || lower.includes('api_key_invalid') || lower.includes('invalid api key')) {
    return 'Your Gemini API key is invalid. Please check the GEMINI_API_KEY in your .env file.';
  }
  if (lower.includes('gemini_api_key is not configured') || lower.includes('api key should be set')) {
    return 'GEMINI_API_KEY is not configured on the server. Please add your key in the .env file.';
  }
  if (lower.includes('503') || lower.includes('high demand') || lower.includes('unavailable') || lower.includes('overloaded')) {
    return 'The Gemini service is temporarily experiencing high demand. We attempted automatic retries and fallback. Please try again in a few seconds.';
  }
  if (lower.includes('rate limit') || lower.includes('resource_exhausted') || lower.includes('429')) {
    return 'Gemini API rate limit reached. Please wait a moment before sending another request.';
  }
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return 'The request to Gemini timed out. Please try again.';
  }

  // Strip JSON wrapping if error message is a JSON string
  try {
    const parsed = JSON.parse(msg);
    if (parsed?.error?.message) return parsed.error.message;
  } catch {}

  // Avoid exposing raw internal stack traces
  return msg.length > 200 ? `${msg.slice(0, 200)}...` : msg;
}

/**
 * Executes an async operation with exponential backoff and jitter.
 * Delays: ~1s (attempt 0 failed), ~2s (attempt 1 failed), ~4s (attempt 2 failed).
 */
export async function callWithExponentialBackoff<T>(
  fn: (attempt: number) => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    modelName?: string;
    label?: string;
    onRetry?: (status: ResilienceStatus) => void;
  } = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  let lastError: any = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err: any) {
      lastError = err;

      if (!isTransientError(err) || attempt >= maxRetries) {
        throw err;
      }

      // Calculate exponential backoff delay with random jitter (100ms - 300ms)
      const baseUnit = options.baseDelayMs ?? 1000;
      const baseDelay = baseUnit * Math.pow(2, attempt);
      const jitter = options.baseDelayMs ? Math.floor(Math.random() * 20) : Math.floor(Math.random() * 300) + 100;
      let delayMs = baseDelay + jitter;
      if (options.maxDelayMs && delayMs > options.maxDelayMs) {
        delayMs = options.maxDelayMs;
      }

      const message = `Gemini is experiencing high demand. Retrying in ${(delayMs / 1000).toFixed(1)}s (Attempt ${attempt + 1}/${maxRetries})...`;

      console.warn(`[Gemini Retry] ${options.label || 'API call'}: ${message}`);

      if (options.onRetry) {
        options.onRetry({
          message,
          attempt: attempt + 1,
          model: options.label || 'Gemini',
          delayMs,
        });
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

/**
 * Calls Gemini generateContent with primary model, exponential backoff retries,
 * and automatic fallback to a secondary model if transient 503/high demand persists.
 */
export async function generateContentWithResilience(
  ai: GoogleGenAI,
  params: {
    primaryModel: string;
    fallbackModel?: string;
    contents: any[];
    config: any;
    requestTimeoutMs?: number;
    onStatus?: (status: ResilienceStatus) => void;
  }
): Promise<GenerationResult> {
  const { ai: genAI, primaryModel, fallbackModel, contents, config, onStatus } = { ai, ...params };
  const requestTimeoutMs = params.requestTimeoutMs ?? 60000;
  let retriesAttempted = 0;

  // Build config with official SDK httpOptions timeout (60,000ms) and retryOptions
  const primaryConfig = {
    ...config,
    httpOptions: {
      ...config?.httpOptions,
      timeout: requestTimeoutMs,
      retryOptions: { attempts: 1 }, // Disable SDK internal retries so custom exponential backoff has sole control
    },
  };

  const fallbackConfig = fallbackModel
    ? {
        ...config,
        httpOptions: {
          ...config?.httpOptions,
          timeout: requestTimeoutMs,
          retryOptions: { attempts: 1 },
        },
      }
    : primaryConfig;

  const runWithTimeout = async <R>(op: () => Promise<R>, modelName: string): Promise<R> => {
    let timer: any;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`Request to ${modelName} timed out after ${requestTimeoutMs}ms (high demand or server delay)`));
      }, requestTimeoutMs);
    });
    try {
      return await Promise.race([op(), timeoutPromise]);
    } finally {
      clearTimeout(timer);
    }
  };

  // 1. Attempt Primary Model with Exponential Backoff
  try {
    const response = await callWithExponentialBackoff(
      async (attempt) => {
        retriesAttempted = attempt;
        return await runWithTimeout(
          () => genAI.models.generateContent({
            model: primaryModel,
            contents,
            config: primaryConfig,
          }),
          primaryModel
        );
      },
      {
        maxRetries: 3,
        label: primaryModel,
        onRetry: onStatus,
      }
    );

    return {
      response,
      usedModel: primaryModel,
      fallbackUsed: false,
      retriesAttempted,
    };
  } catch (primaryErr: any) {
    // If error is not eligible for fallback, or no fallback model available, propagate immediately
    if (!canFallbackForError(primaryErr) || !fallbackModel || fallbackModel === primaryModel) {
      throw primaryErr;
    }

    // 2. Primary model failed -> Fallback model
    const fallbackNotice = `Switching to fallback model (${fallbackModel}) due to high demand on ${primaryModel}...`;
    console.warn(`[Gemini Fallback] ${fallbackNotice}`);

    if (onStatus) {
      onStatus({
        message: fallbackNotice,
        model: fallbackModel,
        isFallback: true,
      });
    }

    try {
      const fallbackResponse = await callWithExponentialBackoff(
        async (attempt) => {
          retriesAttempted += attempt;
          return await runWithTimeout(
            () => genAI.models.generateContent({
              model: fallbackModel,
              contents,
              config: fallbackConfig,
            }),
            fallbackModel
          );
        },
        {
          maxRetries: 3,
          label: fallbackModel,
          onRetry: onStatus,
        }
      );

      return {
        response: fallbackResponse,
        usedModel: fallbackModel,
        fallbackUsed: true,
        retriesAttempted,
      };
    } catch (fallbackErr: any) {
      console.error(`[Gemini Fallback Failed] Both ${primaryModel} and ${fallbackModel} failed:`, fallbackErr);
      throw fallbackErr;
    }
  }
}

/**
 * Calls Gemini generateContentStream with real-time token streaming,
 * immediate token emission via onChunk, and automatic fallback.
 */
export async function generateContentStreamWithResilience(
  ai: GoogleGenAI,
  params: {
    primaryModel: string;
    fallbackModel?: string;
    contents: any[];
    config: any;
    requestTimeoutMs?: number;
    onStatus?: (status: ResilienceStatus) => void;
    onChunk?: (text: string) => void;
  }
): Promise<StreamGenerationResult> {
  const { ai: genAI, primaryModel, fallbackModel, contents, config, onStatus, onChunk } = { ai, ...params };
  const requestTimeoutMs = params.requestTimeoutMs ?? 60000;

  const primaryConfig = {
    ...config,
    httpOptions: {
      ...config?.httpOptions,
      timeout: requestTimeoutMs,
      retryOptions: { attempts: 1 },
    },
  };

  const fallbackConfig = fallbackModel
    ? {
        ...config,
        httpOptions: {
          ...config?.httpOptions,
          timeout: requestTimeoutMs,
          retryOptions: { attempts: 1 },
        },
      }
    : primaryConfig;

  const consumeStream = async (modelToUse: string, configToUse: any): Promise<StreamGenerationResult> => {
    let timer: any;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`Request to ${modelToUse} timed out after ${requestTimeoutMs}ms`));
      }, requestTimeoutMs);
    });

    const streamPromise = (async () => {
      const stream = await genAI.models.generateContentStream({
        model: modelToUse,
        contents,
        config: configToUse,
      });

      let fullText = '';
      const functionCalls: any[] = [];
      const accumulatedParts: any[] = [];

      for await (const chunk of stream) {
        const parts = chunk.candidates?.[0]?.content?.parts;
        if (parts && Array.isArray(parts)) {
          for (const part of parts) {
            if (part.functionCall) {
              accumulatedParts.push(part);
            }
          }
        }
        if (chunk.functionCalls && chunk.functionCalls.length > 0) {
          functionCalls.push(...chunk.functionCalls);
        }

        const textParts = parts
          ?.filter((p: any) => typeof p.text === 'string' && p.text.length > 0)
          ?.map((p: any) => p.text)
          ?.join('');

        const textChunk = textParts || '';
        if (textChunk) {
          fullText += textChunk;
          accumulatedParts.push({ text: textChunk });
          if (onChunk) {
            onChunk(textChunk);
          }
        }
      }

      return {
        fullText,
        functionCalls,
        usedModel: modelToUse,
        fallbackUsed: modelToUse === fallbackModel,
        candidateContent: accumulatedParts.length > 0 ? { role: 'model', parts: accumulatedParts } : null,
      };
    })();

    try {
      return await Promise.race([streamPromise, timeoutPromise]);
    } finally {
      clearTimeout(timer);
    }
  };

  // 1. Attempt Primary Model with backoff
  try {
    return await callWithExponentialBackoff(
      () => consumeStream(primaryModel, primaryConfig),
      {
        maxRetries: 2,
        label: primaryModel,
        onRetry: onStatus,
      }
    );
  } catch (primaryErr: any) {
    if (!canFallbackForError(primaryErr) || !fallbackModel || fallbackModel === primaryModel) {
      throw primaryErr;
    }

    const fallbackNotice = `Switching to fallback model (${fallbackModel}) due to high demand on ${primaryModel}...`;
    console.warn(`[Gemini Fallback] ${fallbackNotice}`);

    if (onStatus) {
      onStatus({
        message: fallbackNotice,
        model: fallbackModel,
        isFallback: true,
      });
    }

    // 2. Attempt Fallback Model with backoff
    try {
      return await callWithExponentialBackoff(
        () => consumeStream(fallbackModel, fallbackConfig),
        {
          maxRetries: 3,
          label: fallbackModel,
          onRetry: onStatus,
        }
      );
    } catch (fallbackErr: any) {
      console.error(`[Gemini Fallback Failed] Both ${primaryModel} and ${fallbackModel} failed:`, fallbackErr);
      throw fallbackErr;
    }
  }
}
