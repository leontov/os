import { Archive, Download, Database, Trash2 } from "lucide-react";
import type { ConversationSummary } from "../../core/useKolibriChat";
import { MODEL_OPTIONS, type ModelId } from "../../core/models";

interface SettingsPanelProps {
  modelId: ModelId;
  onModelChange: (model: ModelId) => void;
  currentConversationTitle: string;
  onArchiveConversation: () => void;
  onExportConversation: () => void;
  onClearHistory: () => void;
  archivedConversations: ConversationSummary[];
}

const formatArchiveTimestamp = (iso?: string): string => {
  if (!iso) {
    return "—";
  }
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
};

const SettingsPanel = ({
  modelId,
  onModelChange,
  currentConversationTitle,
  onArchiveConversation,
  onExportConversation,
  onClearHistory,
  archivedConversations,
}: SettingsPanelProps) => {
  const recentArchived = archivedConversations.slice(-3).reverse();

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <div className="space-y-2">
          <p className="pill-badge inline-flex items-center gap-2">
            <Database className="h-3.5 w-3.5" />
            Модель
          </p>
          <h3 className="text-lg font-semibold text-text-primary">Модель ответа Kolibri</h3>
          <p className="text-sm text-text-secondary">
            Выберите модель для генерации ответов. Настройка применяется ко всем новым сообщениям и сохраняется
            локально.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {MODEL_OPTIONS.map((option) => {
            const isActive = option.id === modelId;
            return (
              <label
                key={option.id}
                className={`flex cursor-pointer flex-col gap-2 rounded-2xl border px-4 py-3 transition-quick focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary ${
                  isActive
                    ? "border-primary/70 bg-primary/10 text-primary"
                    : "border-border-strong/60 bg-background-card/70 text-text-secondary hover:border-primary/40"
                }`}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-text-primary">{option.label}</span>
                  <input
                    type="radio"
                    name="kolibri-model"
                    value={option.id}
                    checked={isActive}
                    onChange={() => onModelChange(option.id)}
                    className="h-4 w-4 accent-primary"
                  />
                </span>
                <span className="text-xs text-text-secondary">{option.description}</span>
                <span className="text-[0.7rem] uppercase tracking-[0.3em] text-text-secondary/80">
                  {option.contextWindow}
                </span>
                <span className="text-xs text-text-secondary/70">{option.bestFor}</span>
              </label>
            );
          })}
        </div>
      </section>

      <section className="space-y-4">
        <div className="space-y-2">
          <p className="pill-badge inline-flex items-center gap-2">
            <Archive className="h-3.5 w-3.5" />
            Данные
          </p>
          <h3 className="text-lg font-semibold text-text-primary">История бесед</h3>
          <p className="text-sm text-text-secondary">
            Управляйте текущей беседой «{currentConversationTitle || "Без названия"}» и локальным хранилищем. Эти
            действия выполняются на устройстве и не затрагивают приватные разговоры.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <button
            type="button"
            onClick={onExportConversation}
            className="flex flex-col items-start gap-2 rounded-2xl border border-border-strong/60 bg-background-card/70 px-4 py-3 text-left transition-quick hover:border-primary/40 hover:text-text"
          >
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-text-primary">
              <Download className="h-4 w-4" />
              Экспорт в Markdown
            </span>
            <span className="text-xs text-text-secondary">
              Сохранить текущую беседу в файл для архива или отправки коллегам.
            </span>
          </button>
          <button
            type="button"
            onClick={onArchiveConversation}
            className="flex flex-col items-start gap-2 rounded-2xl border border-border-strong/60 bg-background-card/70 px-4 py-3 text-left transition-quick hover:border-amber-400/60 hover:text-text"
          >
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-text-primary">
              <Archive className="h-4 w-4" />
              Архивировать беседу
            </span>
            <span className="text-xs text-text-secondary">
              Спрятать беседу из списка, сохранив возможность экспорта позже.
            </span>
          </button>
          <button
            type="button"
            onClick={onClearHistory}
            className="flex flex-col items-start gap-2 rounded-2xl border border-border-strong/60 bg-background-card/70 px-4 py-3 text-left transition-quick hover:border-rose-500/60 hover:text-text"
          >
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-text-primary">
              <Trash2 className="h-4 w-4" />
              Очистить историю
            </span>
            <span className="text-xs text-text-secondary">
              Удалить все локально сохранённые беседы и начать заново.
            </span>
          </button>
        </div>
        <div className="rounded-2xl border border-border-strong/60 bg-background-input/70 px-4 py-4">
          <div className="flex items-center justify-between text-sm font-semibold text-text-primary">
            <span>В архиве: {archivedConversations.length}</span>
            {archivedConversations.length ? (
              <span className="text-xs text-text-secondary">Показываем последние {recentArchived.length}</span>
            ) : null}
          </div>
          {archivedConversations.length ? (
            <ul className="mt-3 space-y-2 text-sm text-text-secondary">
              {recentArchived.map((conversation) => (
                <li key={conversation.id} className="rounded-xl border border-border-strong/40 bg-background-card/60 px-3 py-2">
                  <p className="font-semibold text-text-primary">{conversation.title}</p>
                  <p className="text-xs text-text-secondary">
                    Архивировано: {formatArchiveTimestamp(conversation.archivedAtIso ?? conversation.updatedAtIso)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-text-secondary">
              Архив пока пуст — можно отправить туда завершённые диалоги для наведения порядка.
            </p>
          )}
        </div>
      </section>
    </div>
  );
};

export default SettingsPanel;
