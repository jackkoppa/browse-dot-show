/**
 * Retry an async call that fails now and then (e.g. an AWS call that stalls until it times
 * out), waiting `delaysMs[n]` before retry n+1. The last error is rethrown.
 */
export async function withRetries<T>(
  fn: (attempt: number) => Promise<T>,
  {
    delaysMs = [2_000, 10_000],
    onRetry,
    sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)),
  }: {
    delaysMs?: number[];
    onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
    sleep?: (ms: number) => Promise<void>;
  } = {}
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      const delayMs = delaysMs[attempt - 1];
      if (delayMs === undefined) throw error;
      onRetry?.(error, attempt, delayMs);
      await sleep(delayMs);
    }
  }
}
