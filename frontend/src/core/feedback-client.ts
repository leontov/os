import type { FeedbackRating } from "../types/chat";

const STORAGE_KEY = "kolibri.chat.feedback";

export interface FeedbackSubmission {
  conversationId: string;
  messageId: string;
  rating: FeedbackRating;
  comment?: string;
  response: string;
  submittedAt: string;
}

const loadStoredFeedback = (): FeedbackSubmission[] => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as FeedbackSubmission[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((entry) => Boolean(entry?.messageId && entry?.rating));
  } catch (error) {
    console.warn("Не удалось прочитать сохранённые отзывы", error);
    return [];
  }
};

const persistStoredFeedback = (entries: FeedbackSubmission[]) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch (error) {
    console.warn("Не удалось сохранить отзывы", error);
  }
};

export const submitFeedback = async (record: FeedbackSubmission): Promise<void> => {
  const existing = loadStoredFeedback();
  const next = existing.filter((entry) => entry.messageId !== record.messageId);
  next.push(record);
  persistStoredFeedback(next);

  try {
    await fetch("/api/feedback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(record),
      keepalive: true,
    });
  } catch (error) {
    console.warn("Не удалось отправить отзыв на сервер", error);
  }
};

export const getStoredFeedback = (): FeedbackSubmission[] => loadStoredFeedback();
