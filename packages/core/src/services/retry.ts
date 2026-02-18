export interface RetryInfo {
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  error: unknown;
}

export interface RetryOptions {
  attempts?: number;
  minDelayMs?: number;
  maxDelayMs?: number;
  jitter?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  retryAfterMs?: (error: unknown) => number | undefined;
  onRetry?: (info: RetryInfo) => void;
}

const DEFAULT_RETRY_OPTIONS: Required<Pick<RetryOptions, "attempts" | "minDelayMs" | "maxDelayMs" | "jitter">> = {
  attempts: 3,
  minDelayMs: 400,
  maxDelayMs: 15_000,
  jitter: 0.1,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveOptions(options: RetryOptions | undefined) {
  const attempts = Math.max(1, Math.floor(options?.attempts ?? DEFAULT_RETRY_OPTIONS.attempts));
  const minDelayMs = Math.max(0, Math.floor(options?.minDelayMs ?? DEFAULT_RETRY_OPTIONS.minDelayMs));
  const maxDelayMs = Math.max(
    minDelayMs,
    Math.floor(options?.maxDelayMs ?? DEFAULT_RETRY_OPTIONS.maxDelayMs),
  );
  const jitter = Math.min(1, Math.max(0, options?.jitter ?? DEFAULT_RETRY_OPTIONS.jitter));
  return {
    attempts,
    minDelayMs,
    maxDelayMs,
    jitter,
    shouldRetry: options?.shouldRetry ?? (() => true),
    retryAfterMs: options?.retryAfterMs,
    onRetry: options?.onRetry,
  };
}

function withJitter(delayMs: number, jitter: number): number {
  if (jitter <= 0) return delayMs;
  const offset = (Math.random() * 2 - 1) * jitter;
  return Math.max(0, Math.round(delayMs * (1 + offset)));
}

export function parseRetryAfterHeaderMs(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return Math.floor(raw);
  }
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }

  const asSeconds = Number(trimmed);
  if (Number.isFinite(asSeconds) && asSeconds > 0) {
    return Math.floor(asSeconds * 1000);
  }

  const parsedDate = Date.parse(trimmed);
  if (!Number.isFinite(parsedDate)) {
    return undefined;
  }
  const waitMs = parsedDate - Date.now();
  return waitMs > 0 ? Math.floor(waitMs) : undefined;
}

function getHeaderValue(headers: unknown, key: string): string | undefined {
  if (!headers || typeof headers !== "object") {
    return undefined;
  }

  const maybeHeaders = headers as { get?: (name: string) => string | null | undefined };
  if (typeof maybeHeaders.get === "function") {
    const value = maybeHeaders.get(key);
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  const record = headers as Record<string, unknown>;
  for (const entry of Object.keys(record)) {
    if (entry.toLowerCase() !== key.toLowerCase()) {
      continue;
    }
    const value = record[entry];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
    if (Array.isArray(value) && typeof value[0] === "string") {
      return value[0];
    }
  }
  return undefined;
}

export function getErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }
  const value = (error as { status?: unknown }).status;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function getErrorRetryAfterMs(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }
  const headers = (error as { headers?: unknown }).headers;
  if (headers) {
    const retryAfterHeader = getHeaderValue(headers, "retry-after");
    const fromHeader = parseRetryAfterHeaderMs(retryAfterHeader);
    if (typeof fromHeader === "number") {
      return fromHeader;
    }
  }

  const retryAfter = (error as { retryAfter?: unknown }).retryAfter;
  const asMs = parseRetryAfterHeaderMs(retryAfter);
  if (typeof asMs === "number") {
    return asMs;
  }
  return undefined;
}

export function isLikelyTransientError(error: unknown): boolean {
  const status = getErrorStatus(error);
  if (status === 408 || status === 425 || status === 429) {
    return true;
  }
  if (typeof status === "number" && status >= 500) {
    return true;
  }

  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  const lower = message.toLowerCase();
  if (!lower) {
    return false;
  }
  return (
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    lower.includes("temporar") ||
    lower.includes("ecconnreset") ||
    lower.includes("econnreset") ||
    lower.includes("eai_again") ||
    lower.includes("enotfound") ||
    lower.includes("network")
  );
}

export async function retryAsync<T>(
  operation: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const resolved = resolveOptions(options);
  let lastError: unknown;

  for (let attempt = 1; attempt <= resolved.attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= resolved.attempts || !resolved.shouldRetry(error, attempt)) {
        break;
      }

      const retryAfterMs = resolved.retryAfterMs?.(error);
      const baseDelayMs =
        typeof retryAfterMs === "number" && Number.isFinite(retryAfterMs) && retryAfterMs > 0
          ? retryAfterMs
          : resolved.minDelayMs * 2 ** (attempt - 1);
      const clampedDelayMs = Math.min(Math.max(baseDelayMs, resolved.minDelayMs), resolved.maxDelayMs);
      const delayMs = withJitter(clampedDelayMs, resolved.jitter);

      resolved.onRetry?.({
        attempt,
        maxAttempts: resolved.attempts,
        delayMs,
        error,
      });
      await sleep(delayMs);
    }
  }

  throw lastError ?? new Error("Retry failed without a captured error");
}
