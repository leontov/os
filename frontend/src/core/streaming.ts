import { createTokenSplitter } from "./tokenizer";

export interface StreamOptions {
  chunkDelayMs?: number;
  tokensPerChunk?: number;
}

export interface KolibriStream {
  cancel(): void;
  readonly signal: AbortSignal;
  onToken(listener: (chunk: string) => void): () => void;
  onError(listener: (error: unknown) => void): () => void;
  onComplete(listener: () => void): () => void;
  onCancel(listener: () => void): () => void;
  readonly done: Promise<void>;
}

interface StreamControls {
  append(text: string, finalize: boolean): void;
  fail(error: unknown): void;
}

interface StreamInternals {
  stream: KolibriStream;
  controls: StreamControls;
}

const DEFAULT_DELAY_MS = 32;
const DEFAULT_TOKENS_PER_CHUNK = 3;

class ListenerRegistry<T> {
  private readonly listeners = new Set<(payload: T) => void>();

  add(listener: (payload: T) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispatch(payload: T): void {
    for (const listener of this.listeners) {
      listener(payload);
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}

export function createKolibriStream(
  controller: AbortController,
  options: StreamOptions = {},
): StreamInternals {
  const tokenListeners = new ListenerRegistry<string>();
  const errorListeners = new ListenerRegistry<unknown>();
  const completeListeners = new ListenerRegistry<void>();
  const cancelListeners = new ListenerRegistry<void>();

  const timers = new Set<ReturnType<typeof setTimeout>>();
  const queue: string[] = [];
  const splitter = createTokenSplitter();

  let pendingFinalize = false;
  let processing = false;
  let settled = false;

  let doneResolve: () => void;
  let doneReject: (error: unknown) => void;
  const done = new Promise<void>((resolve, reject) => {
    doneResolve = resolve;
    doneReject = reject;
  });

  const cleanupTimers = () => {
    for (const timer of timers) {
      clearTimeout(timer);
    }
    timers.clear();
  };

  const settleComplete = () => {
    if (settled) {
      return;
    }
    settled = true;
    cleanupTimers();
    tokenListeners.clear();
    completeListeners.dispatch();
    completeListeners.clear();
    cancelListeners.clear();
    errorListeners.clear();
    doneResolve();
  };

  const settleCancel = () => {
    if (settled) {
      return;
    }
    settled = true;
    cleanupTimers();
    queue.length = 0;
    processing = false;
    cancelListeners.dispatch();
    tokenListeners.clear();
    completeListeners.clear();
    cancelListeners.clear();
    errorListeners.clear();
    doneResolve();
  };

  const settleError = (error: unknown) => {
    if (settled) {
      return;
    }
    settled = true;
    cleanupTimers();
    queue.length = 0;
    processing = false;
    errorListeners.dispatch(error);
    tokenListeners.clear();
    completeListeners.clear();
    cancelListeners.clear();
    errorListeners.clear();
    doneReject(error);
  };

  const scheduleNext = (immediate: boolean) => {
    if (settled || controller.signal.aborted) {
      return;
    }
    const delay = immediate ? 0 : options.chunkDelayMs ?? DEFAULT_DELAY_MS;
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (settled || controller.signal.aborted) {
        return;
      }
      dispatchNext();
    }, delay);
    timers.add(timer);
  };

  const dispatchNext = () => {
    if (queue.length === 0) {
      processing = false;
      if (pendingFinalize) {
        settleComplete();
      }
      return;
    }

    const tokensPerChunk = Math.max(1, options.tokensPerChunk ?? DEFAULT_TOKENS_PER_CHUNK);
    const chunkTokens = queue.splice(0, tokensPerChunk);
    tokenListeners.dispatch(chunkTokens.join(""));

    if (queue.length === 0) {
      processing = false;
      if (pendingFinalize) {
        settleComplete();
      }
      return;
    }

    scheduleNext(false);
  };

  const append = (text: string, finalize: boolean) => {
    if (settled) {
      return;
    }
    if (text.length > 0) {
      const tokens = splitter(text);
      if (tokens.length > 0) {
        queue.push(...tokens);
        if (!processing) {
          processing = true;
          scheduleNext(true);
        }
      }
    }

    if (finalize) {
      pendingFinalize = true;
      if (!processing && queue.length === 0) {
        settleComplete();
      }
    }
  };

  const cancel = () => {
    controller.abort();
  };

  controller.signal.addEventListener(
    "abort",
    () => {
      settleCancel();
    },
    { once: true },
  );

  const stream: KolibriStream = {
    cancel,
    signal: controller.signal,
    onToken: (listener) => tokenListeners.add(listener),
    onError: (listener) => errorListeners.add(listener),
    onComplete: (listener) => completeListeners.add(listener),
    onCancel: (listener) => cancelListeners.add(listener),
    done,
  };

  const controls: StreamControls = {
    append,
    fail: settleError,
  };

  return { stream, controls };
}

export function splitIntoTokens(input: string): string[] {
  return createTokenSplitter()(input);
}
