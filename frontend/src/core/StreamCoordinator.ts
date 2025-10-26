import type { KnowledgeSnippet } from "../types/knowledge";
import type {
  AudioStreamChunk,
  StreamChunk,
  StreamSnapshot,
  StreamTransport,
  SubtitleCue,
  TextStreamChunk,
  VisualStreamChunk,
} from "../types/stream";

interface StreamCoordinatorOptions {
  sseUrl?: string;
  websocketUrl?: string;
  webrtcUrl?: string;
  preferTransport?: StreamTransport[];
  adaptiveWindowMs?: number;
  enableCache?: boolean;
}

export interface StreamRequestPayload {
  prompt: string;
  mode: string;
  conversationId: string;
  messageId: string;
  context: KnowledgeSnippet[];
  attachments?: Array<{ id: string; name: string }>; // simplified descriptor for negotiation
}

interface StreamRequest {
  payload: StreamRequestPayload;
  onError?: (error: unknown) => void;
  fallbackResolver: () => Promise<StreamSnapshot>;
}

interface TextListener {
  (chunk: TextStreamChunk, snapshot: StreamSnapshot): void;
}

interface AudioListener {
  (chunk: AudioStreamChunk, snapshot: StreamSnapshot): void;
}

interface VisualListener {
  (chunk: VisualStreamChunk, snapshot: StreamSnapshot): void;
}

interface CompletionListener {
  (snapshot: StreamSnapshot): void;
}

const DB_NAME = "kolibri-streams";
const DB_VERSION = 1;
const DB_STORE = "streams";

const OPEN_DB_PROMISE: Promise<IDBDatabase | null> | null = typeof indexedDB === "undefined"
  ? null
  : new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(DB_STORE)) {
          const store = database.createObjectStore(DB_STORE, { keyPath: "key" });
          store.createIndex("conversation", "conversationId", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Не удалось открыть IndexedDB"));
    });

const waitForTransaction = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });

const mergeSubtitleCues = (existing: SubtitleCue[], incoming: SubtitleCue[]): SubtitleCue[] => {
  const merged = [...existing];
  incoming.forEach((cue) => {
    const overlapIndex = merged.findIndex((item) => Math.abs(item.start - cue.start) < 0.01);
    if (overlapIndex >= 0) {
      merged[overlapIndex] = { ...merged[overlapIndex], ...cue };
    } else {
      merged.push(cue);
    }
  });
  return merged.sort((a, b) => a.start - b.start);
};

const computeHighlights = (text: string): string[] => {
  const words = text
    .toLowerCase()
    .replace(/[.,!?;:()"«»]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 5);

  const frequency = new Map<string, number>();
  words.forEach((word) => {
    frequency.set(word, (frequency.get(word) ?? 0) + 1);
  });

  const scored = Array.from(frequency.entries())
    .map(([phrase, score]) => ({ phrase, score: score * phrase.length }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((entry) => entry.phrase);

  return scored;
};

const bufferConcat = (buffers: ArrayBuffer[]): ArrayBuffer => {
  const total = buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  buffers.forEach((buffer) => {
    merged.set(new Uint8Array(buffer), offset);
    offset += buffer.byteLength;
  });
  return merged.buffer;
};

const buildInitialSnapshot = (): StreamSnapshot => ({
  text: "",
  subtitles: [],
  emojis: [],
  highlights: [],
  audio: null,
  transport: "fallback",
  createdAt: Date.now(),
});

class StreamSession {
  private readonly textListeners = new Set<TextListener>();
  private readonly audioListeners = new Set<AudioListener>();
  private readonly visualListeners = new Set<VisualListener>();
  private readonly completionListeners = new Set<CompletionListener>();
  private readonly teardownCallbacks: Array<() => void> = [];

  private snapshot: StreamSnapshot = buildInitialSnapshot();
  private playbackRate = 1;
  private textBuffer = "";
  private audioBuffers: ArrayBuffer[] = [];
  private audioMime: string | null = null;
  private audioSpectrum: number[] = [];
  private audioWaveform: number[] = [];
  private activeTransport: StreamTransport = "fallback";
  private isCompleted = false;

  constructor(
    private readonly options: {
      adaptiveWindowMs: number;
      cache: boolean;
      conversationId: string;
      messageId: string;
      databasePromise: Promise<IDBDatabase | null> | null;
    },
  ) {}

  onText(listener: TextListener): () => void {
    this.textListeners.add(listener);
    return () => this.textListeners.delete(listener);
  }

  onAudio(listener: AudioListener): () => void {
    this.audioListeners.add(listener);
    return () => this.audioListeners.delete(listener);
  }

  onVisual(listener: VisualListener): () => void {
    this.visualListeners.add(listener);
    return () => this.visualListeners.delete(listener);
  }

  onComplete(listener: CompletionListener): () => void {
    this.completionListeners.add(listener);
    return () => this.completionListeners.delete(listener);
  }

  registerTeardown(callback: () => void): void {
    this.teardownCallbacks.push(callback);
  }

  setTransport(transport: StreamTransport): void {
    this.activeTransport = transport;
  }

  handleChunk(chunk: StreamChunk): void {
    if (this.isCompleted) {
      return;
    }

    switch (chunk.type) {
      case "text":
        this.handleTextChunk(chunk);
        break;
      case "audio":
        this.handleAudioChunk(chunk);
        break;
      case "visual":
        this.handleVisualChunk(chunk);
        break;
      default:
        break;
    }
  }

  private handleTextChunk(chunk: TextStreamChunk): void {
    const nextText = this.textBuffer + chunk.text;
    this.textBuffer = nextText;

    this.snapshot = {
      ...this.snapshot,
      text: nextText,
      subtitles: chunk.subtitles ? mergeSubtitleCues(this.snapshot.subtitles, chunk.subtitles) : this.snapshot.subtitles,
      emojis: chunk.emojis ? [...this.snapshot.emojis, ...chunk.emojis] : this.snapshot.emojis,
      highlights: chunk.highlights ?? computeHighlights(nextText),
      transport: chunk.transport,
    };

    this.playbackRate = Math.max(0.5, Math.min(3, 0.7 * this.playbackRate + 0.3 * Math.max(0.5, chunk.text.length / 32)));

    const delay = this.options.adaptiveWindowMs / this.playbackRate;
    window.setTimeout(() => {
      this.textListeners.forEach((listener) => listener(chunk, this.snapshot));
    }, delay);

    if (chunk.done) {
      void this.complete();
    }
  }

  private handleAudioChunk(chunk: AudioStreamChunk): void {
    if (chunk.data.byteLength) {
      this.audioBuffers.push(chunk.data);
    }
    if (chunk.mimeType) {
      this.audioMime = chunk.mimeType;
    }
    if (chunk.spectrum) {
      this.audioSpectrum = chunk.spectrum;
    }
    if (chunk.waveform) {
      this.audioWaveform = chunk.waveform;
    }

    this.snapshot = {
      ...this.snapshot,
      audio:
        this.audioBuffers.length === 0
          ? null
          : {
              mimeType: this.audioMime ?? "audio/webm",
              buffer: bufferConcat(this.audioBuffers),
              spectrum: this.audioSpectrum,
              waveform: this.audioWaveform,
            },
      transport: chunk.transport,
    };

    this.audioListeners.forEach((listener) => listener(chunk, this.snapshot));
    if (chunk.isFinal) {
      void this.complete();
    }
  }

  private handleVisualChunk(chunk: VisualStreamChunk): void {
    this.snapshot = {
      ...this.snapshot,
      avatar: chunk.descriptor,
      transport: chunk.transport,
    };
    this.visualListeners.forEach((listener) => listener(chunk, this.snapshot));
  }

  async complete(): Promise<void> {
    if (this.isCompleted) {
      return;
    }
    this.isCompleted = true;
    const finalSnapshot: StreamSnapshot = {
      ...this.snapshot,
      text: this.textBuffer,
      highlights: computeHighlights(this.textBuffer),
      createdAt: Date.now(),
      transport: this.activeTransport,
    };
    this.snapshot = finalSnapshot;

    if (this.options.cache && OPEN_DB_PROMISE && this.options.databasePromise) {
      try {
        const db = await this.options.databasePromise;
        if (db) {
          const transaction = db.transaction(DB_STORE, "readwrite");
          const store = transaction.objectStore(DB_STORE);
          store.put({
            key: `${this.options.conversationId}:${this.options.messageId}`,
            conversationId: this.options.conversationId,
            messageId: this.options.messageId,
            snapshot: finalSnapshot,
          });
          await waitForTransaction(transaction);
        }
      } catch (error) {
        console.warn("Не удалось сохранить поток в IndexedDB", error);
      }
    }

    this.completionListeners.forEach((listener) => listener(finalSnapshot));
  }

  async dispose(): Promise<void> {
    this.teardownCallbacks.splice(0).forEach((callback) => {
      try {
        callback();
      } catch (error) {
        console.error("Stream teardown failed", error);
      }
    });
  }

  getSnapshot(): StreamSnapshot {
    return this.snapshot;
  }
}

const decodeChunkPayload = (eventData: string): StreamChunk | null => {
  try {
    const parsed = JSON.parse(eventData) as StreamChunk;
    if (!parsed || typeof parsed !== "object" || typeof (parsed as { type?: unknown }).type !== "string") {
      return null;
    }
    return parsed;
  } catch (error) {
    console.warn("Не удалось распарсить chunk", error);
    return null;
  }
};

const emitSnapshotAsChunks = async (session: StreamSession, snapshot: StreamSnapshot): Promise<void> => {
  const sentences = snapshot.text.split(/(?<=[.!?])\s+/).filter(Boolean);
  let cumulative = "";
  for (const sentence of sentences) {
    cumulative += (cumulative ? " " : "") + sentence;
    const chunk: TextStreamChunk = {
      type: "text",
      text: sentence,
      timestamp: Date.now(),
      transport: "fallback",
      highlights: computeHighlights(cumulative),
    };
    session.handleChunk(chunk);
    await new Promise((resolve) => setTimeout(resolve, 80));
  }

  if (snapshot.audio) {
    const audioChunk: AudioStreamChunk = {
      type: "audio",
      data: snapshot.audio.buffer,
      mimeType: snapshot.audio.mimeType,
      spectrum: snapshot.audio.spectrum,
      waveform: snapshot.audio.waveform,
      timestamp: Date.now(),
      transport: "fallback",
      isFinal: true,
    };
    session.handleChunk(audioChunk);
  }

  if (snapshot.avatar) {
    const visualChunk: VisualStreamChunk = {
      type: "visual",
      descriptor: snapshot.avatar,
      timestamp: Date.now(),
      transport: "fallback",
    };
    session.handleChunk(visualChunk);
  }

  await session.complete();
};

export class StreamCoordinator {
  private readonly preferTransport: StreamTransport[];
  private readonly adaptiveWindowMs: number;
  private readonly enableCache: boolean;
  private readonly databasePromise: Promise<IDBDatabase | null> | null;

  constructor(private readonly options: StreamCoordinatorOptions = {}) {
    this.preferTransport = options.preferTransport ?? ["sse", "websocket", "webrtc", "fallback"];
    this.adaptiveWindowMs = options.adaptiveWindowMs ?? 160;
    this.enableCache = options.enableCache ?? true;
    this.databasePromise = this.enableCache ? OPEN_DB_PROMISE : null;
  }

  startStream(request: StreamRequest): StreamSession {
    const session = new StreamSession({
      adaptiveWindowMs: this.adaptiveWindowMs,
      cache: this.enableCache,
      conversationId: request.payload.conversationId,
      messageId: request.payload.messageId,
      databasePromise: this.databasePromise,
    });

    void this.executeTransports(session, request);
    return session;
  }

  private async executeTransports(session: StreamSession, request: StreamRequest): Promise<void> {
    const errors: unknown[] = [];
    for (const transport of this.preferTransport) {
      try {
        switch (transport) {
          case "sse":
            if (!this.options.sseUrl || typeof EventSource === "undefined") {
              throw new Error("SSE transport is not available");
            }
            await this.connectViaSse(session, request);
            session.setTransport("sse");
            return;
          case "websocket":
            if (!this.options.websocketUrl || typeof WebSocket === "undefined") {
              throw new Error("WebSocket transport is not available");
            }
            await this.connectViaWebSocket(session, request);
            session.setTransport("websocket");
            return;
          case "webrtc":
            if (!this.options.webrtcUrl || typeof RTCPeerConnection === "undefined") {
              throw new Error("WebRTC transport is not available");
            }
            await this.connectViaWebRtc(session, request);
            session.setTransport("webrtc");
            return;
          case "fallback":
          default:
            await this.connectViaFallback(session, request);
            session.setTransport("fallback");
            return;
        }
      } catch (error) {
        errors.push(error);
        continue;
      }
    }

    if (request.onError) {
      request.onError(errors[errors.length - 1]);
    } else {
      console.error("Streaming transports exhausted", errors);
    }
    await session.complete();
  }

  private async connectViaSse(session: StreamSession, request: StreamRequest): Promise<void> {
    const controller = new AbortController();
    session.registerTeardown(() => controller.abort());

    const handshakeResponse = await fetch(this.options.sseUrl!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request.payload),
      signal: controller.signal,
    });
    if (!handshakeResponse.ok) {
      throw new Error(`SSE handshake failed with status ${handshakeResponse.status}`);
    }
    const { streamUrl } = (await handshakeResponse.json()) as { streamUrl: string };
    if (!streamUrl) {
      throw new Error("SSE handshake did not return streamUrl");
    }

    await new Promise<void>((resolve, reject) => {
      const source = new EventSource(streamUrl);
      const close = () => source.close();
      session.registerTeardown(close);

      source.onmessage = (event) => {
        const chunk = decodeChunkPayload(event.data);
        if (chunk) {
          session.handleChunk(chunk);
        }
      };
      source.onerror = (event) => {
        close();
        reject(event);
      };
      source.onopen = () => {
        // No-op: connection established
      };
      session.onComplete(() => {
        close();
        resolve();
      });
    });
  }

  private async connectViaWebSocket(session: StreamSession, request: StreamRequest): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(this.options.websocketUrl!);
      const teardown = () => {
        try {
          socket.close();
        } catch (error) {
          console.warn("WebSocket teardown error", error);
        }
      };
      session.registerTeardown(teardown);

      socket.onopen = () => {
        socket.send(JSON.stringify(request.payload));
      };
      socket.onmessage = (event) => {
        if (typeof event.data === "string") {
          const chunk = decodeChunkPayload(event.data);
          if (chunk) {
            session.handleChunk(chunk);
          }
        }
      };
      socket.onerror = (event) => {
        teardown();
        reject(event);
      };
      socket.onclose = () => {
        resolve();
      };
      session.onComplete(() => {
        teardown();
        resolve();
      });
    });
  }

  private async connectViaWebRtc(session: StreamSession, request: StreamRequest): Promise<void> {
    const peer = new RTCPeerConnection();
    const channel = peer.createDataChannel("kolibri-stream");
    session.registerTeardown(() => {
      try {
        channel.close();
      } catch (error) {
        console.warn("WebRTC data channel close failed", error);
      }
      try {
        peer.close();
      } catch (error) {
        console.warn("WebRTC peer close failed", error);
      }
    });

    channel.onmessage = (event) => {
      if (typeof event.data === "string") {
        const chunk = decodeChunkPayload(event.data);
        if (chunk) {
          session.handleChunk(chunk);
        }
      }
    };
    channel.onerror = (event) => {
      console.error("WebRTC data channel error", event);
    };

    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);

    const response = await fetch(this.options.webrtcUrl!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offer: offer.sdp, ...request.payload }),
    });
    if (!response.ok) {
      throw new Error(`WebRTC negotiation failed with status ${response.status}`);
    }
    const { answer } = (await response.json()) as { answer: string };
    if (!answer) {
      throw new Error("WebRTC negotiation did not return answer");
    }
    await peer.setRemoteDescription({ type: "answer", sdp: answer });

    await new Promise<void>((resolve) => {
      session.onComplete(() => resolve());
    });
  }

  private async connectViaFallback(session: StreamSession, request: StreamRequest): Promise<void> {
    const snapshot = await request.fallbackResolver();
    await emitSnapshotAsChunks(session, snapshot);
  }

  async replayAudio(
    conversationId: string,
    messageId: string,
    listener: (chunk: AudioStreamChunk, snapshot: StreamSnapshot) => void,
  ): Promise<StreamSnapshot | null> {
    if (!this.enableCache || !OPEN_DB_PROMISE || !this.databasePromise) {
      return null;
    }
    try {
      const db = await this.databasePromise;
      if (!db) {
        return null;
      }
      const transaction = db.transaction(DB_STORE, "readonly");
      const store = transaction.objectStore(DB_STORE);
      const request = store.get(`${conversationId}:${messageId}`);
      const snapshot: StreamSnapshot | undefined = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result?.snapshot as StreamSnapshot | undefined);
        request.onerror = () => reject(request.error ?? new Error("IndexedDB read failed"));
      });
      await waitForTransaction(transaction);
      if (snapshot?.audio) {
        const chunk: AudioStreamChunk = {
          type: "audio",
          data: snapshot.audio.buffer,
          mimeType: snapshot.audio.mimeType,
          spectrum: snapshot.audio.spectrum,
          waveform: snapshot.audio.waveform,
          timestamp: Date.now(),
          transport: snapshot.transport,
          isFinal: true,
        };
        listener(chunk, snapshot);
        return snapshot;
      }
      return snapshot ?? null;
    } catch (error) {
      console.warn("Не удалось воспроизвести аудио из кеша", error);
      return null;
    }
  }

  async getCachedSnapshot(conversationId: string, messageId: string): Promise<StreamSnapshot | null> {
    if (!this.enableCache || !OPEN_DB_PROMISE || !this.databasePromise) {
      return null;
    }
    try {
      const db = await this.databasePromise;
      if (!db) {
        return null;
      }
      const transaction = db.transaction(DB_STORE, "readonly");
      const store = transaction.objectStore(DB_STORE);
      const request = store.get(`${conversationId}:${messageId}`);
      const result = await new Promise<StreamSnapshot | null>((resolve, reject) => {
        request.onsuccess = () => resolve((request.result?.snapshot as StreamSnapshot | undefined) ?? null);
        request.onerror = () => reject(request.error ?? new Error("IndexedDB read failed"));
      });
      await waitForTransaction(transaction);
      return result;
    } catch (error) {
      console.warn("Не удалось получить снапшот из кеша", error);
      return null;
    }
  }
}

export const buildFallbackSnapshot = async (
  answer: string,
  options: {
    transport?: StreamTransport;
    avatarUrl?: string;
  } = {},
): Promise<StreamSnapshot> => {
  const sentences = answer.split(/(?<=[.!?])\s+/).filter(Boolean);
  const subtitles: SubtitleCue[] = [];
  let cursor = 0;
  sentences.forEach((sentence) => {
    const duration = Math.max(1.6, sentence.length / 18);
    const cue: SubtitleCue = {
      start: cursor,
      end: cursor + duration,
      text: sentence,
      emphasis: sentence.includes("!") ? "strong" : "soft",
    };
    subtitles.push(cue);
    cursor += duration + 0.4;
  });

  const snapshot: StreamSnapshot = {
    text: answer,
    subtitles,
    emojis: [],
    highlights: computeHighlights(answer),
    audio: null,
    avatar: options.avatarUrl
      ? {
          type: "lottie",
          src: options.avatarUrl,
          loop: true,
        }
      : undefined,
    transport: options.transport ?? "fallback",
    createdAt: Date.now(),
  };

  return snapshot;
};

export interface StreamBootstrapPayload {
  prompt: string;
  mode: string;
  context: KnowledgeSnippet[];
  attachments?: Array<{ id: string; name: string }>;
}

export const createFallbackResolver = (
  payload: StreamBootstrapPayload,
  kernel: (prompt: string, mode: string, context: KnowledgeSnippet[]) => Promise<string>,
): (() => Promise<StreamSnapshot>) => {
  return async () => {
    const answer = await kernel(payload.prompt, payload.mode, payload.context);
    return buildFallbackSnapshot(answer, { transport: "fallback" });
  };
};

export type StreamCoordinatorFactory = (options?: StreamCoordinatorOptions) => StreamCoordinator;

export const createStreamCoordinator: StreamCoordinatorFactory = (options) => new StreamCoordinator(options);

export default StreamCoordinator;
