const DEFAULT_RETRIES = 2;
const DEFAULT_BASE_DELAY_MS = 200;
const DEFAULT_MAX_DELAY_MS = 3_000;
const DEFAULT_TIMEOUT_MS = 3_500;

export type RetryOptions = {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  timeoutMs?: number;
  shouldRetry?: (err: unknown) => boolean;
  onRetry?: (err: unknown, attempt: number) => void;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === "string") {
    return err;
  }
  return "";
}

function hasErrorCode(err: unknown, code: string): boolean {
  if (!err || typeof err !== "object") {
    return false;
  }
  const value = (err as { code?: unknown }).code;
  return typeof value === "string" && value.toUpperCase() === code.toUpperCase();
}

function normalizeStatus(err: unknown): number | null {
  if (!err || typeof err !== "object") {
    return null;
  }

  const directStatus = (err as { status?: unknown }).status;
  if (typeof directStatus === "number") {
    return directStatus;
  }

  const nestedStatus = (err as { response?: { status?: unknown } }).response?.status;
  if (typeof nestedStatus === "number") {
    return nestedStatus;
  }

  return null;
}

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") {
    return false;
  }

  const errorLike = err as { name?: unknown };
  return typeof errorLike.name === "string" && errorLike.name === "AbortError";
}

function isKnownNonRetryableError(err: unknown): boolean {
  const message = extractErrorMessage(err).toLowerCase();
  const code = !err || typeof err !== "object" ? "" : String((err as { code?: unknown }).code ?? "").toUpperCase();
  const status = normalizeStatus(err);

  if (status === 400 || status === 401 || status === 403 || status === 409 || status === 422) {
    return true;
  }

  if (code === "23505") {
    return true;
  }

  return (
    message.includes("validation") ||
    message.includes("invalid") ||
    message.includes("constraint") ||
    message.includes("duplicate key") ||
    message.includes("unique violation") ||
    message.includes("unauthorized") ||
    message.includes("forbidden") ||
    message.includes("auth")
  );
}

export async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

export function getBackoffDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number
): number {
  const expDelay = baseDelayMs * 2 ** attempt;
  const jitterMultiplier = 1 + (0.2 + Math.random() * 0.1);
  const jitteredDelay = Math.floor(expDelay * jitterMultiplier);
  return Math.min(jitteredDelay, maxDelayMs);
}

export function defaultShouldRetry(err: unknown): boolean {
  if (isKnownNonRetryableError(err)) {
    return false;
  }

  if (isAbortError(err)) {
    return true;
  }

  if (hasErrorCode(err, "ECONNRESET") || hasErrorCode(err, "ETIMEDOUT")) {
    return true;
  }

  const status = normalizeStatus(err);
  if (status === 502 || status === 503) {
    return true;
  }

  const message = extractErrorMessage(err).toLowerCase();
  return (
    message.includes("failed to fetch") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("connection")
  );
}

export async function withRetryAndTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const retries = options.retries ?? DEFAULT_RETRIES;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const shouldRetry = options.shouldRetry ?? defaultShouldRetry;
  const onRetry = options.onRetry;

  let attempt = 0;

  while (attempt <= retries) {
    try {
      return await withTimeout(fn, timeoutMs);
    } catch (err) {
      const isLastAttempt = attempt >= retries;
      if (isLastAttempt || !shouldRetry(err)) {
        throw err;
      }

      const nextAttempt = attempt + 1;
      onRetry?.(err, nextAttempt);

      const delay = getBackoffDelay(attempt, baseDelayMs, maxDelayMs);
      await sleep(delay);

      attempt = nextAttempt;
    }
  }

  throw new Error("Retry loop terminated unexpectedly");
}
