import { describe, expect, it, vi, afterEach } from "vitest";
import { DeliveryQueue, type DeliveryStatus } from "../deliveryQueue";

describe("DeliveryQueue", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("retries failed tasks with exponential backoff and resolves on success", async () => {
    vi.useFakeTimers();
    const statuses: DeliveryStatus[] = [];
    const queue = new DeliveryQueue({
      timeoutMs: 1000,
      maxAttempts: 3,
      baseRetryDelayMs: 100,
      failureResetMs: 50,
      onStatusChange: (status) => {
        statuses.push(status);
      },
    });

    const execute = vi
      .fn<[], Promise<string>>()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce("ok");
    const onSuccess = vi.fn();

    const resultPromise = queue.enqueue({ execute, onSuccess });

    await vi.advanceTimersByTimeAsync(100);
    await expect(resultPromise).resolves.toBe("ok");
    expect(execute).toHaveBeenCalledTimes(2);
    expect(onSuccess).toHaveBeenCalledWith("ok");
    expect(statuses).toEqual(["delivering", "pending", "delivering", "idle"]);
  });

  it("emits failed status after exhausting retries and resets to idle", async () => {
    vi.useFakeTimers();
    const statuses: DeliveryStatus[] = [];
    const queue = new DeliveryQueue({
      timeoutMs: 20,
      maxAttempts: 2,
      baseRetryDelayMs: 10,
      failureResetMs: 15,
      onStatusChange: (status) => {
        statuses.push(status);
      },
    });

    const execute = vi.fn<[], Promise<void>>(() => new Promise(() => undefined));
    const onFailure = vi.fn();

    const resultPromise = queue.enqueue({ execute, onFailure });
    const observedError = resultPromise.catch((error) => error);

    await vi.advanceTimersByTimeAsync(120);
    const failure = await observedError;
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe("delivery-timeout");
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(statuses).toContain("failed");

    await vi.advanceTimersByTimeAsync(15);
    expect(statuses.at(-1)).toBe("idle");
  });
});
