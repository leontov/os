export type ChatRole = "user" | "assistant";

export type FeedbackRating = "up" | "down";

export interface ChatFeedback {
  rating: FeedbackRating;
  comment?: string;
  submittedAt: string;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: string;
  conversationId: string;
  feedback?: ChatFeedback;
}
