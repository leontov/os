import { useEffect, useMemo, useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import type { ChatMessage as ChatMessageModel, FeedbackRating } from "../types/chat";

interface ChatMessageProps {
  message: ChatMessageModel;
  onFeedbackSubmit?: (rating: FeedbackRating, comment?: string) => void;
}

const formatFeedbackLabel = (rating: FeedbackRating) =>
  rating === "up" ? "Ответ помог" : "Ответ не помог";

const ChatMessage = ({ message, onFeedbackSubmit }: ChatMessageProps) => {
  const isUser = message.role === "user";
  const [rating, setRating] = useState<FeedbackRating | null>(message.feedback?.rating ?? null);
  const [comment, setComment] = useState(message.feedback?.comment ?? "");
  const [isEditing, setIsEditing] = useState(!message.feedback);

  useEffect(() => {
    setRating(message.feedback?.rating ?? null);
    setComment(message.feedback?.comment ?? "");
    setIsEditing(!message.feedback);
  }, [message.feedback]);

  const timestamp = useMemo(() => {
    if (!message.feedback?.submittedAt) {
      return null;
    }
    try {
      return new Date(message.feedback.submittedAt).toLocaleString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
      });
    } catch (error) {
      void error;
      return message.feedback.submittedAt;
    }
  }, [message.feedback?.submittedAt]);

  const handleRating = (nextRating: FeedbackRating) => {
    setRating(nextRating);
    setIsEditing(true);
  };

  const handleSubmit = () => {
    if (!rating) {
      return;
    }
    onFeedbackSubmit?.(rating, comment.trim() ? comment.trim() : undefined);
    setIsEditing(false);
  };

  return (
    <div className="flex items-start gap-3">
      <div
        className={`flex h-9 w-9 items-center justify-center rounded-full ${
          isUser ? "bg-primary/20 text-primary" : "bg-accent-coral/10 text-accent-coral"
        }`}
      >
        {isUser ? "Я" : "К"}
      </div>
      <div className="w-full rounded-2xl bg-white/80 p-4 shadow-card">
        <p className="whitespace-pre-line text-sm leading-relaxed text-text-dark">{message.content}</p>
        <p className="mt-2 text-xs text-text-light">{message.timestamp}</p>

        {onFeedbackSubmit && !isUser && (
          <div className="mt-4 border-t border-surface/60 pt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-text-light">Оцените ответ</p>

            <div className="mt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={() => handleRating("up")}
                className={`flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition-colors ${
                  rating === "up"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-surface text-text-light hover:border-primary/40 hover:text-primary"
                }`}
              >
                <ThumbsUp className="h-4 w-4" />
                Нравится
              </button>
              <button
                type="button"
                onClick={() => handleRating("down")}
                className={`flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition-colors ${
                  rating === "down"
                    ? "border-accent-coral bg-accent-coral/10 text-accent-coral"
                    : "border-surface text-text-light hover:border-accent-coral/40 hover:text-accent-coral"
                }`}
              >
                <ThumbsDown className="h-4 w-4" />
                Не помогло
              </button>
            </div>

            {rating && isEditing && (
              <div className="mt-3 space-y-2">
                <label className="block text-xs font-medium text-text-light" htmlFor={`feedback-${message.id}`}>
                  Комментарий (необязательно)
                </label>
                <textarea
                  id={`feedback-${message.id}`}
                  className="w-full resize-none rounded-xl border border-surface bg-white/70 p-2 text-sm text-text-dark outline-none transition focus:border-primary focus:ring-1 focus:ring-primary/40"
                  rows={3}
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="Поделитесь, что понравилось или что можно улучшить"
                />
                <div className="flex justify-end gap-2">
                  {message.feedback && (
                    <button
                      type="button"
                      className="rounded-full border border-surface px-3 py-1 text-xs text-text-light hover:border-primary/30 hover:text-primary"
                      onClick={() => {
                        setIsEditing(false);
                        setComment(message.feedback?.comment ?? "");
                        setRating(message.feedback?.rating ?? rating);
                      }}
                    >
                      Отмена
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!rating}
                    className="rounded-full bg-primary px-4 py-1 text-xs font-semibold text-white shadow hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-primary/40"
                  >
                    Отправить отзыв
                  </button>
                </div>
              </div>
            )}

            {message.feedback && !isEditing && (
              <div className="mt-3 rounded-xl border border-surface/80 bg-white/60 p-3">
                <div className="flex items-center gap-2 text-xs font-medium text-text-light">
                  {message.feedback.rating === "up" ? (
                    <ThumbsUp className="h-4 w-4 text-primary" />
                  ) : (
                    <ThumbsDown className="h-4 w-4 text-accent-coral" />
                  )}
                  <span>{formatFeedbackLabel(message.feedback.rating)}</span>
                  {timestamp && <span className="text-[11px] text-text-light/80">{timestamp}</span>}
                </div>
                {message.feedback.comment && (
                  <p className="mt-2 text-sm text-text-dark/80">{message.feedback.comment}</p>
                )}
                <button
                  type="button"
                  className="mt-3 text-xs font-medium text-primary hover:underline"
                  onClick={() => {
                    setIsEditing(true);
                    setRating(message.feedback?.rating ?? rating);
                    setComment(message.feedback?.comment ?? "");
                  }}
                >
                  Изменить отзыв
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatMessage;
