import { MessageCircleDashed } from "lucide-react";

export function EmptyState() {
  return (
    <div className="flex max-w-md flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[rgba(74,222,128,0.04)] px-6 py-12 text-center">
      <MessageCircleDashed aria-hidden className="h-8 w-8 text-[var(--brand)]" />
      <h2 className="text-lg font-semibold text-[var(--text)]">Начните новый диалог</h2>
      <p className="text-sm text-[var(--muted)]">
        Попросите «Колибри» подвести итоги встречи или сгенерировать черновик. Команды через «/» помогают быстрее.
      </p>
    </div>
  );
}
