import type { ChatAttachment } from "../types/chat";

interface AttachmentResponse {
  id: string;
  name: string;
  contentType: string;
  size: number;
  text: string;
}

function ensureArrayBuffer(input: FileList | File[]): File[] {
  return Array.from(input as Iterable<File>);
}

function buildFormData(files: File[]): FormData {
  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file);
  }
  return formData;
}

function parseErrorPayload(payload: unknown, fallback: string): string {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  if (payload && typeof payload === "object") {
    const detail = Reflect.get(payload, "detail");
    if (typeof detail === "string" && detail.trim()) {
      return detail;
    }
  }

  return fallback;
}

export async function uploadAttachments(files: FileList | File[]): Promise<ChatAttachment[]> {
  const fileArray = ensureArrayBuffer(files);
  if (!fileArray.length) {
    return [];
  }

  const response = await fetch("/api/attachments", {
    method: "POST",
    body: buildFormData(fileArray),
  });

  const raw = await response.text();
  let parsed: unknown = null;

  if (raw) {
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch (error) {
      if (response.ok) {
        throw new Error("Некорректный ответ от сервера вложений.");
      }
      throw new Error(parseErrorPayload(raw, "Не удалось обработать вложения."));
    }
  }

  if (!response.ok) {
    throw new Error(parseErrorPayload(parsed, "Не удалось обработать вложения."));
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Некорректный ответ от сервера вложений.");
  }

  return parsed.map((item) => {
    const payload = item as AttachmentResponse;
    return {
      id: payload.id,
      name: payload.name,
      contentType: payload.contentType,
      size: payload.size,
      text: payload.text,
    } satisfies ChatAttachment;
  });
}
