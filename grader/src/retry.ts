export interface BackoffOptions {
  retries?: number;
  baseMs?: number;
  maxMs?: number;
  isRetryable?: (err: unknown) => boolean;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  onRetry?: (attempt: number, delayMs: number, err: unknown) => void;
}

export function isThrottling(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === "ThrottlingException" || e?.$metadata?.httpStatusCode === 429;
}

// Exponential backoff with FULL jitter: wait a random time in [0, min(max, base * 2^attempt)].
export async function withBackoff<T>(fn: () => Promise<T>, o: BackoffOptions = {}): Promise<T> {
  const { retries = 5, baseMs = 200, maxMs = 5000 } = o;
  const isRetryable = o.isRetryable ?? isThrottling;
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const random = o.random ?? Math.random;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= retries || !isRetryable(err)) throw err;
      const delay = Math.floor(random() * Math.min(maxMs, baseMs * 2 ** attempt));
      o.onRetry?.(attempt + 1, delay, err);
      await sleep(delay);
    }
  }
}
