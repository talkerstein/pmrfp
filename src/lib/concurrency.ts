/** Small helpers that keep database fan-out bounded. */

/** Run `fn` over `items` with at most `limit` calls in flight; results keep input order. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker));
  return out;
}

/** A shared semaphore: every task passed to the returned function waits for one of `limit` slots. */
export function createLimiter(limit: number): <T>(task: () => Promise<T>) => Promise<T> {
  let active = 0;
  const queue: (() => void)[] = [];
  // A finishing task hands its slot straight to the next waiter, so a new
  // caller can never slip in between and push the count over the limit.
  const release = () => {
    const waiter = queue.shift();
    if (waiter) waiter();
    else active--;
  };
  return async <T,>(task: () => Promise<T>): Promise<T> => {
    if (active >= limit) await new Promise<void>((resolve) => queue.push(resolve));
    else active++;
    try {
      return await task();
    } finally {
      release();
    }
  };
}

/** Concurrent callers with the same key share one in-flight promise (per server instance). */
export function createSingleFlight(): <T>(key: string, task: () => Promise<T>) => Promise<T> {
  const inflight = new Map<string, Promise<unknown>>();
  return <T,>(key: string, task: () => Promise<T>): Promise<T> => {
    const running = inflight.get(key) as Promise<T> | undefined;
    if (running) return running;
    const p = task().finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  };
}
