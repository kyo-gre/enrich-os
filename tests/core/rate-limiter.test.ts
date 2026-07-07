import { describe, expect, it } from "vitest";
import { PlatformRateLimiter } from "../../core/profiles/fetcher/rate-limiter";

describe("PlatformRateLimiter", () => {
  it("spaces out tasks scheduled under the same key", async () => {
    const limiter = new PlatformRateLimiter(
      { instagram: { minIntervalMs: 50 } },
      { minIntervalMs: 50 },
    );
    const starts: number[] = [];

    await Promise.all(
      [1, 2, 3].map(() =>
        limiter.schedule("instagram", async () => {
          starts.push(Date.now());
        }),
      ),
    );

    expect(starts).toHaveLength(3);
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(45);
    expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(45);
  });

  it("does not block one key on another", async () => {
    const limiter = new PlatformRateLimiter(
      { instagram: { minIntervalMs: 200 } },
      { minIntervalMs: 200 },
    );

    const igStart = Date.now();
    await limiter.schedule("instagram", async () => {});

    const genericStart = Date.now();
    await limiter.schedule("generic", async () => {});
    const genericElapsed = Date.now() - genericStart;

    expect(genericElapsed).toBeLessThan(100);
    expect(Date.now() - igStart).toBeGreaterThanOrEqual(0);
  });

  it("keeps the queue alive after a task throws", async () => {
    const limiter = new PlatformRateLimiter({}, { minIntervalMs: 1 });

    await expect(
      limiter.schedule("instagram", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    const result = await limiter.schedule("instagram", async () => "ok");
    expect(result).toBe("ok");
  });
});
