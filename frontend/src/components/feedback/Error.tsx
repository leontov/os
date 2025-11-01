import { AlertOctagon } from "lucide-react";
import { Button } from "../ui/Button";

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex max-w-md flex-col items-center gap-3 rounded-2xl border border-[var(--danger)] bg-[rgba(255,107,107,0.08)] px-6 py-10 text-center">
      <AlertOctagon aria-hidden className="h-8 w-8 text-[var(--danger)]" />
      <h2 className="text-lg font-semibold text-[var(--text)]">Не удалось получить сообщения</h2>
      <p className="text-sm text-[var(--muted)]">
        Проверьте подключение и попробуйте ещё раз. Оффлайн-режим сохранит ваш ввод в очередь и отправит автоматически.
      </p>
      <Button onClick={onRetry}>Повторить</Button>
    </div>
  );
}
