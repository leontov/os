import { afterEach, describe, expect, it, vi } from "vitest";

import { createKolibriStream } from "../streaming";

describe("createKolibriStream", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits chunks sequentially and completes", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const { stream, controls } = createKolibriStream(controller, {
      chunkDelayMs: 5,
      tokensPerChunk: 2,
    });

    const chunks: string[] = [];
    let completed = false;
    stream.onToken((chunk) => {
      chunks.push(chunk);
    });
    stream.onComplete(() => {
      completed = true;
    });

    controls.append("Привет мир!", true);

    vi.runAllTimers();

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.join("")).toBe("Привет мир!");
    expect(completed).toBe(true);
  });

  it("cleans up timers when cancelled", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const { stream, controls } = createKolibriStream(controller, {
      chunkDelayMs: 20,
    });

    let cancelled = false;
    stream.onCancel(() => {
      cancelled = true;
    });

    controls.append("Длинный ответ", true);

    expect(vi.getTimerCount()).toBeGreaterThan(0);
    stream.cancel();
    await stream.done;

    expect(cancelled).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("propagates errors to listeners and the done promise", async () => {
    const controller = new AbortController();
    const { stream, controls } = createKolibriStream(controller);
    const error = new Error("boom");

    const received: unknown[] = [];
    stream.onError((err) => {
      received.push(err);
    });

    controls.fail(error);

    await expect(stream.done).rejects.toBe(error);
    expect(received).toEqual([error]);
  });
});
