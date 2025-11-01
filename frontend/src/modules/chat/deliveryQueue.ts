export type DeliveryStatus = "idle" | "pending" | "delivering" | "failed";

interface QueueTask<T> {
  execute: () => Promise<T>;
  onSuccess?: (result: T) => void;
  onFailure?: (error: unknown) => void;
}

interface DeliveryQueueOptions {
  timeoutMs: number;
  maxAttempts: number;
  baseRetryDelayMs: number;
  failureResetMs?: number;
  onStatusChange?: (status: DeliveryStatus) => void;
}

type InternalTask = {
  execute: () => Promise<any>;
  onSuccess?: (result: any) => void;
  onFailure?: (error: unknown) => void;
  attempt: number;
  resolve: (value: any) => void;
  reject: (reason: unknown) => void;
};

export class DeliveryQueue {
  private readonly tasks: InternalTask[] = [];

  private processing = false;

  private readonly timeoutMs: number;

  private readonly maxAttempts: number;

  private readonly baseRetryDelayMs: number;

  private readonly failureResetMs: number;

  private readonly onStatusChange?: (status: DeliveryStatus) => void;

  private lastStatus: DeliveryStatus = "idle";

  private failureResetTimer: ReturnType<typeof setTimeout> | null = null;

  constructor({
    timeoutMs,
    maxAttempts,
    baseRetryDelayMs,
    failureResetMs = 2400,
    onStatusChange,
  }: DeliveryQueueOptions) {
    this.timeoutMs = timeoutMs;
    this.maxAttempts = maxAttempts;
    this.baseRetryDelayMs = baseRetryDelayMs;
    this.failureResetMs = failureResetMs;
    this.onStatusChange = onStatusChange;
  }

  enqueue<T>(task: QueueTask<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const entry: InternalTask = {
        execute: task.execute,
        onSuccess: task.onSuccess as ((result: any) => void) | undefined,
        onFailure: task.onFailure,
        attempt: 0,
        resolve: resolve as (value: any) => void,
        reject,
      };
      this.tasks.push(entry);
      if (this.processing) {
        this.emitStatus("pending");
      }
      void this.process();
    });
  }

  private async process(): Promise<void> {
    if (this.processing) {
      return;
    }
    this.processing = true;
    while (this.tasks.length > 0) {
      const current = this.tasks[0];
      let completed = false;
      while (!completed) {
        current.attempt += 1;
        this.emitStatus("delivering");
        try {
          const result = await this.withTimeout(current.execute());
          current.onSuccess?.(result);
          current.resolve(result);
          this.tasks.shift();
          this.emitStatus(this.tasks.length > 0 ? "pending" : "idle");
          completed = true;
        } catch (error) {
          if (current.attempt >= this.maxAttempts) {
            this.emitStatus("failed");
            current.onFailure?.(error);
            current.reject(error);
            this.tasks.shift();
            completed = true;
          } else {
            this.emitStatus("pending");
            await this.delay(this.retryDelay(current.attempt));
          }
        }
      }
    }
    this.processing = false;
  }

  private emitStatus(status: DeliveryStatus) {
    if (status === this.lastStatus) {
      return;
    }
    if (status !== "failed" && this.failureResetTimer) {
      clearTimeout(this.failureResetTimer);
      this.failureResetTimer = null;
    }
    this.lastStatus = status;
    this.onStatusChange?.(status);
    if (status === "failed") {
      this.scheduleReset();
    }
  }

  private scheduleReset() {
    if (this.failureResetTimer) {
      return;
    }
    this.failureResetTimer = setTimeout(() => {
      this.failureResetTimer = null;
      this.emitStatus(this.tasks.length > 0 ? "pending" : "idle");
    }, this.failureResetMs);
  }

  private withTimeout<T>(promise: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("delivery-timeout"));
      }, this.timeoutMs);
      promise
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private retryDelay(attempt: number): number {
    return this.baseRetryDelayMs * 2 ** (attempt - 1);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
