export interface StreamChatOptions {
  prompt: string;
  mode: string;
  signal?: AbortSignal;
  onToken: (token: string) => void;
  onComplete?: () => void;
}

const STREAM_ENDPOINT = "/api/chat/stream";

interface ParsedEvent {
  readonly type: string;
  readonly data: string;
}

function parseEvent(rawEvent: string): ParsedEvent | null {
  if (!rawEvent.trim()) {
    return null;
  }

  let eventType = "message";
  const dataLines: string[] = [];

  for (const line of rawEvent.split("\n")) {
    const trimmed = line.trimEnd();
    if (!trimmed) {
      continue;
    }
    if (trimmed.startsWith("event:")) {
      eventType = trimmed.slice(6).trim() || "message";
      continue;
    }
    if (trimmed.startsWith("data:")) {
      dataLines.push(trimmed.slice(5).trimStart());
      continue;
    }
  }

  return { type: eventType, data: dataLines.join("\n") };
}

export async function streamChatCompletion(options: StreamChatOptions): Promise<void> {
  const response = await fetch(STREAM_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt: options.prompt, mode: options.mode }),
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error(`Сервер вернул статус ${response.status}`);
  }

  if (!response.body) {
    throw new Error("Потоковый ответ недоступен");
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let doneReceived = false;

  try {
    let streamClosed = false;
    while (!streamClosed) {
      const { value, done } = await reader.read();
      if (done) {
        streamClosed = true;
        continue;
      }
      if (value) {
        buffer += value;
      }

      let boundaryIndex = buffer.indexOf("\n\n");
      while (boundaryIndex !== -1) {
        const rawEvent = buffer.slice(0, boundaryIndex);
        buffer = buffer.slice(boundaryIndex + 2);
        boundaryIndex = buffer.indexOf("\n\n");

        const parsed = parseEvent(rawEvent);
        if (!parsed) {
          continue;
        }

        if (parsed.type === "done") {
          doneReceived = true;
          options.onComplete?.();
          return;
        }

        if (parsed.type === "error") {
          throw new Error(parsed.data || "Сервер сообщил об ошибке");
        }

        if (parsed.data) {
          options.onToken(parsed.data);
        }
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Игнорируем ошибки отмены, поток уже завершён.
    }
  }

  if (!doneReceived) {
    options.onComplete?.();
  }
}
