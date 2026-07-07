export interface RateLimiterOptions {
  /** Minimum spacing between task starts for a given platform key. */
  minIntervalMs: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sequential, per-key rate limiter. Tasks scheduled under the same key run
 * one at a time with at least `minIntervalMs` between start times; different
 * keys (platforms) never block each other.
 */
export class PlatformRateLimiter {
  private readonly chains = new Map<string, Promise<unknown>>();
  private readonly nextAvailableAt = new Map<string, number>();

  constructor(
    private readonly perKeyOptions: Partial<Record<string, RateLimiterOptions>> = {},
    private readonly defaultOptions: RateLimiterOptions = { minIntervalMs: 1000 },
  ) {}

  schedule<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.chains.get(key) ?? Promise.resolve();
    const run = previous.then(() => this.runThrottled(key, task));
    // Swallow rejections in the chain itself so one failed task doesn't
    // permanently wedge the queue for that platform; callers still see errors.
    this.chains.set(key, run.catch(() => undefined));
    return run;
  }

  private async runThrottled<T>(key: string, task: () => Promise<T>): Promise<T> {
    const { minIntervalMs } = this.perKeyOptions[key] ?? this.defaultOptions;
    const now = Date.now();
    const nextAt = this.nextAvailableAt.get(key) ?? 0;
    const waitMs = Math.max(0, nextAt - now);
    if (waitMs > 0) await sleep(waitMs);
    this.nextAvailableAt.set(key, Date.now() + minIntervalMs);
    return task();
  }
}
